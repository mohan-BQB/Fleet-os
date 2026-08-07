from datetime import date

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import RetireOnDestroyMixin
from core.permissions import HasCapability, is_self_approval
from vehicles.models import Vehicle

from . import pnl
from .models import Expense, ExpenseApprovalStatus, ExpenseHead
from .serializers import ExpenseHeadSerializer, ExpenseSerializer


class ExpenseHeadViewSet(viewsets.ModelViewSet):
    """No delete, no status action - add and rename only (see ExpenseHead's
    docstring: the one master in the system with no active/inactive
    toggle at all)."""
    queryset = ExpenseHead.objects.all()
    serializer_class = ExpenseHeadSerializer
    permission_classes = [HasCapability]
    required_section = "expenses"
    http_method_names = ["get", "post", "patch", "head", "options"]


class ExpenseViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = Expense.objects.select_related("vehicle", "expense_head").all()
    serializer_class = ExpenseSerializer
    permission_classes = [HasCapability]
    required_section = "expenses"

    @action(detail=True, methods=["post"])
    def mark_paid(self, request, pk=None):
        """Settles this expense's bill in one step - the "paid/pending"
        picker on the expense form and table call this, rather than making
        the user go find the vendor and record a payment separately.

        payment_mode is mandatory: how a bill got settled is exactly the
        kind of detail that's easy to skip in a hurry and then can't be
        reconstructed later, so this is rejected outright rather than
        silently defaulting to e.g. "cash" - true whether it's going to the
        vendor ledger or just this Expense's own paid flag below."""
        from vendors.models import VendorPaymentMode

        expense = self.get_object()
        payment_mode = request.data.get("payment_mode")
        if payment_mode not in VendorPaymentMode.values:
            raise ValidationError({"payment_mode": "Select how this was paid."})

        if not expense.vendor_id:
            # No Vendor row to post a payable ledger entry against - a
            # one-off/unlisted payee's settlement lives directly on the
            # Expense instead (see Expense.paid's docstring).
            if expense.paid:
                raise ValidationError("Already marked paid.")
            expense.paid = True
            expense.payment_mode = payment_mode
            expense.paid_date = request.data.get("date") or expense.date
            expense.save()
            return Response(ExpenseSerializer(expense).data)

        from vendors.services import mark_paid

        entry = mark_paid(
            expense.vendor, request.data.get("date") or expense.date, expense.amount,
            f"Expense — {expense.expense_head.name}", "Expense", expense.id,
            payment_mode=payment_mode,
        )
        if entry is None:
            raise ValidationError("Already marked paid.")
        return Response(ExpenseSerializer(expense).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Every expense - direct entry or system-posted alike - starts
        pending and needs this explicit sign-off (see
        Expense.approval_status's docstring). Who can reach this action at
        all is core.permissions' job (expenses/change_status - owner/admin
        by default, or anyone specifically delegated), not this method's -
        same division of responsibility TripSheetViewSet.approve_close uses.
        Also can't be your own entry - see core.permissions.is_self_approval -
        unless you're the owner, who's exempt by design."""
        expense = self.get_object()
        if is_self_approval(request.user, expense):
            raise ValidationError("You can't approve your own entry - ask another approver.")
        if expense.approval_status != ExpenseApprovalStatus.PENDING:
            raise ValidationError(f"Already {expense.approval_status}.")
        expense.approval_status = ExpenseApprovalStatus.APPROVED
        expense.approval_note = (request.data.get("approval_note") or "").strip()
        expense.save()
        return Response(ExpenseSerializer(expense).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Terminal, like approve - a rejected expense stays rejected, on
        record, rather than quietly disappearing or being editable back to
        pending. Requires a reason: a rejection with no explanation is as
        useless later as a payment with no recorded mode (see mark_paid's
        docstring for the same reasoning). Also can't be your own entry -
        see approve()'s docstring."""
        expense = self.get_object()
        if is_self_approval(request.user, expense):
            raise ValidationError("You can't reject your own entry - ask another approver.")
        if expense.approval_status != ExpenseApprovalStatus.PENDING:
            raise ValidationError(f"Already {expense.approval_status}.")
        note = (request.data.get("approval_note") or "").strip()
        if not note:
            raise ValidationError({"approval_note": "Say why this expense is being rejected."})
        expense.approval_status = ExpenseApprovalStatus.REJECTED
        expense.approval_note = note
        expense.save()
        return Response(ExpenseSerializer(expense).data)


def _parse_period(request):
    """Defaults to month-to-date so the P&L views are useful with no params."""
    today = date.today()
    try:
        end = date.fromisoformat(request.query_params["end"]) if "end" in request.query_params else today
        start = (
            date.fromisoformat(request.query_params["start"])
            if "start" in request.query_params
            else end.replace(day=1)
        )
    except ValueError:
        raise ValidationError("`start`/`end` must be ISO dates (YYYY-MM-DD).")
    if start > end:
        raise ValidationError("`start` must be on or before `end`.")
    return start, end


class VehiclePnLView(APIView):
    """The 'calculator tab': pick a vehicle + period, get an instant P&L."""
    permission_classes = [HasCapability]
    required_section = "reports"

    def get(self, request):
        vehicle_id = request.query_params.get("vehicle")
        if not vehicle_id:
            raise ValidationError("`vehicle` query param is required.")
        try:
            vehicle = Vehicle.objects.get(pk=vehicle_id)
        except (Vehicle.DoesNotExist, DjangoValidationError, ValueError):
            raise ValidationError("No such vehicle.")
        start, end = _parse_period(request)
        return Response(pnl.vehicle_pnl(vehicle, start, end))


class DashboardPnLView(APIView):
    """Company-wide P&L across the whole fleet for the period."""
    permission_classes = [HasCapability]
    required_section = "reports"

    def get(self, request):
        start, end = _parse_period(request)
        return Response(pnl.dashboard_pnl(start, end))
