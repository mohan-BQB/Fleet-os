from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from core.api import RetireOnDestroyMixin
from core.models import Role
from core.permissions import HasCapability, is_self_approval

from .models import (
    DriverLedgerEntry, FuelLog, FuelLogStatus, RouteRate, TripAdvance, TripExpense, TripLeg, TripSheet,
    TripSheetStatus, WorkItem, WorkRate,
)
from .permissions import (
    FuelLogTransitionPermission, OwnRecordsPermission, TripSheetTransitionPermission, own_trip_sheets_filter,
)
from .serializers import (
    DriverLedgerEntrySerializer, FuelLogSerializer, RouteRateSerializer, TripAdvanceSerializer,
    TripExpenseSerializer, TripLegSerializer, TripSheetSerializer, WorkItemSerializer, WorkRateSerializer,
)


class TripSheetViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    serializer_class = TripSheetSerializer
    permission_classes = [TripSheetTransitionPermission]
    required_section = "trip_work_cards"

    def get_queryset(self):
        qs = (
            TripSheet.objects.select_related("vehicle", "driver")
            .prefetch_related("legs", "work_items", "advances", "trip_expenses")
            .all()
        )
        return own_trip_sheets_filter(qs, self.request.user)

    def create(self, request, *args, **kwargs):
        # `driver` is a required field on the serializer, so it has to be
        # in the payload before is_valid() runs - too early for a
        # perform_create() override to fill in for a driver logging their
        # own trip. Injected here instead, before validation, rather than
        # mutating request.data/request._full_data directly.
        data = request.data
        if request.user.role == Role.DRIVER:
            # .copy() (not a dict spread) so this works whether the client
            # sent JSON (a plain dict) or multipart/form-encoded (a
            # QueryDict, where `**`-unpacking silently wraps values in
            # lists instead of flattening them).
            data = request.data.copy()
            data["driver"] = str(request.user.driver_id)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=201, headers=headers)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """Open (draft) -> submitted - once the trip is genuinely underway:
        a route sheet needs at least two legs logged (a single leg alone
        doesn't represent a real route - the driver can still save progress
        after the first one, just not submit yet), a work-card sheet needs
        at least one work item, and any advance handed to the driver
        settled. Deliberately does NOT require the closing meter - that's
        often not known yet when a driver hands off mid-day (see
        approve_close, which is where it's actually required, since that's
        the point it's consumed - the vehicle-meter rollforward)."""
        trip_sheet = self.get_object()
        if trip_sheet.status != TripSheetStatus.DRAFT:
            raise ValidationError("Only an open trip sheet can be submitted.")

        missing = []
        if trip_sheet.closing_meter is not None and trip_sheet.closing_meter < trip_sheet.opening_meter:
            raise ValidationError("Closing meter can't be less than the opening meter.")
        has_line_items = (
            trip_sheet.legs.count() > 1 if trip_sheet.card_type == "route" else trip_sheet.work_items.exists()
        )
        if not has_line_items:
            missing.append("at least two trip legs" if trip_sheet.card_type == "route" else "at least one work item")
        if trip_sheet.total_advance > 0 and trip_sheet.returned_amount is None:
            missing.append("advance settlement (returned amount)")
        if missing:
            raise ValidationError(f"Can't submit yet - missing: {', '.join(missing)}.")

        trip_sheet.submit()
        return Response(self.get_serializer(trip_sheet).data)

    @action(detail=True, methods=["post"], url_path="approve-close")
    def approve_close(self, request, pk=None):
        """Submitted -> closed, one step: the closing-meter check (moved
        here from Submit - see submit()'s docstring), the money-box
        reconciliation gate (unbalanced trips are rejected unless
        overridden with a recorded reason - who's allowed to reach this
        action at all, and therefore to authorize that override, is
        TripSheetTransitionPermission's job, not this method's), and the
        closing-meter rollforward onto the vehicle (see
        TripSheet.approve_close())."""
        trip_sheet = self.get_object()
        if trip_sheet.status != TripSheetStatus.SUBMITTED:
            raise ValidationError("Only a submitted trip sheet can be approved & closed.")

        if trip_sheet.closing_meter is None:
            raise ValidationError("Enter the closing meter reading before approving & closing this trip.")

        override_reason = (request.data.get("override_reason") or "").strip()
        if not trip_sheet.is_reconciled and not override_reason:
            raise ValidationError(
                f"This trip doesn't balance (₹{trip_sheet.reconciliation_variance} unaccounted) - "
                "return the difference, or override with a reason."
            )

        trip_sheet.approve_close(override_reason=override_reason)

        # A non-approved card posts nothing - this is the one place a
        # loaded leg's freight reaches the customer's receivable ledger.
        # Legs with no customer (an hours-vehicle trip, or a leg predating
        # this feature) are skipped, not errored.
        from customers.services import sync_invoice

        for leg in trip_sheet.legs.all():
            if leg.customer_id:
                sync_invoice(
                    leg.customer, trip_sheet.date, leg.freight_amount,
                    f"Freight — {leg.from_place} to {leg.to_place}", "TripLeg", leg.id,
                )
        for item in trip_sheet.work_items.all():
            if item.customer_id:
                sync_invoice(
                    item.customer, trip_sheet.date, item.amount,
                    f"Work — {item.work_type or item.site}", "WorkItem", item.id,
                )

        return Response(self.get_serializer(trip_sheet).data)


class TripLegViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    serializer_class = TripLegSerializer
    permission_classes = [OwnRecordsPermission]
    required_section = "trip_work_cards"

    def get_queryset(self):
        qs = TripLeg.objects.select_related("trip_sheet").all()
        return own_trip_sheets_filter(qs, self.request.user, driver_field="trip_sheet__driver_id")


class WorkItemViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    serializer_class = WorkItemSerializer
    permission_classes = [OwnRecordsPermission]
    required_section = "trip_work_cards"

    def get_queryset(self):
        qs = WorkItem.objects.select_related("trip_sheet", "customer").all()
        return own_trip_sheets_filter(qs, self.request.user, driver_field="trip_sheet__driver_id")


class RouteRateViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = RouteRate.objects.select_related("customer").all()
    serializer_class = RouteRateSerializer
    permission_classes = [HasCapability]
    required_section = "trip_work_cards"


class WorkRateViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = WorkRate.objects.select_related("customer").all()
    serializer_class = WorkRateSerializer
    permission_classes = [HasCapability]
    required_section = "trip_work_cards"


class TripAdvanceViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    serializer_class = TripAdvanceSerializer
    permission_classes = [OwnRecordsPermission]
    required_section = "trip_work_cards"

    def get_queryset(self):
        qs = TripAdvance.objects.select_related("trip_sheet").all()
        return own_trip_sheets_filter(qs, self.request.user, driver_field="trip_sheet__driver_id")


class TripExpenseViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    serializer_class = TripExpenseSerializer
    permission_classes = [OwnRecordsPermission]
    required_section = "trip_work_cards"

    def get_queryset(self):
        qs = TripExpense.objects.select_related("trip_sheet", "vendor").all()
        return own_trip_sheets_filter(qs, self.request.user, driver_field="trip_sheet__driver_id")


class FuelLogViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    serializer_class = FuelLogSerializer
    permission_classes = [FuelLogTransitionPermission]
    required_section = "fuel_log"

    def get_queryset(self):
        qs = FuelLog.objects.select_related("vehicle", "trip_sheet", "driver").all()
        # driver_id directly, not trip_sheet__driver_id - a standalone fuel
        # entry (no trip sheet, most of them) now carries its own driver
        # (see FuelLog.driver's docstring), so it's correctly scoped to
        # that driver instead of being invisible to the own-records filter.
        return own_trip_sheets_filter(qs, self.request.user, section="fuel_log", driver_field="driver_id")

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """Open -> submitted. No extra completeness gate beyond what's
        already required at creation (litres, rate, driver) - a fuel entry
        isn't built up incrementally over legs the way a trip sheet is, so
        there's nothing else to wait for."""
        fuel_log = self.get_object()
        if fuel_log.status != FuelLogStatus.DRAFT:
            raise ValidationError("Only an open fuel entry can be submitted.")
        fuel_log.status = FuelLogStatus.SUBMITTED
        fuel_log.save()
        return Response(FuelLogSerializer(fuel_log).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Terminal, like Expense's approve/reject - who can reach this at
        all is core.permissions' job (fuel_log/change_status - owner/admin
        by default, or anyone specifically delegated), not this method's.
        Also can't be your own entry - see core.permissions.is_self_approval -
        unless you're the owner, who's exempt by design."""
        fuel_log = self.get_object()
        if is_self_approval(request.user, fuel_log):
            raise ValidationError("You can't approve your own entry - ask another approver.")
        if fuel_log.status != FuelLogStatus.SUBMITTED:
            raise ValidationError(f"Only a submitted fuel entry can be approved (currently {fuel_log.status}).")
        fuel_log.status = FuelLogStatus.APPROVED
        fuel_log.approval_note = (request.data.get("approval_note") or "").strip()
        fuel_log.save()
        return Response(FuelLogSerializer(fuel_log).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Requires a reason, same as ExpenseViewSet.reject - a rejection
        with no explanation is as useless later as a payment with no
        recorded mode. Also can't be your own entry - see approve()'s
        docstring."""
        fuel_log = self.get_object()
        if is_self_approval(request.user, fuel_log):
            raise ValidationError("You can't reject your own entry - ask another approver.")
        if fuel_log.status != FuelLogStatus.SUBMITTED:
            raise ValidationError(f"Only a submitted fuel entry can be rejected (currently {fuel_log.status}).")
        note = (request.data.get("approval_note") or "").strip()
        if not note:
            raise ValidationError({"approval_note": "Say why this fuel entry is being rejected."})
        fuel_log.status = FuelLogStatus.REJECTED
        fuel_log.approval_note = note
        fuel_log.save()
        return Response(FuelLogSerializer(fuel_log).data)

    @action(detail=True, methods=["post"])
    def mark_paid(self, request, pk=None):
        """payment_mode is mandatory - see ExpenseViewSet.mark_paid for why
        this is rejected rather than defaulted."""
        from vendors.models import VendorPaymentMode

        fuel_log = self.get_object()
        if not fuel_log.fuel_station_id:
            raise ValidationError("This fuel log has no fuel station to pay.")
        payment_mode = request.data.get("payment_mode")
        if payment_mode not in VendorPaymentMode.values:
            raise ValidationError({"payment_mode": "Select how this was paid."})

        from vendors.services import mark_paid

        entry = mark_paid(
            fuel_log.fuel_station, request.data.get("date") or fuel_log.date, fuel_log.amount,
            "Fuel log", "FuelLog", fuel_log.id, payment_mode=payment_mode,
        )
        if entry is None:
            raise ValidationError("Already marked paid.")
        return Response(FuelLogSerializer(fuel_log).data)


class DriverLedgerEntryViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = DriverLedgerEntry.objects.select_related("driver", "trip_sheet").all()
    serializer_class = DriverLedgerEntrySerializer
    permission_classes = [HasCapability]
    required_section = "money_box_settlement"
