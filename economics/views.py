from datetime import date

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import RetireOnDestroyMixin
from core.permissions import HasCapability
from vehicles.models import Vehicle

from . import pnl
from .models import Expense
from .serializers import ExpenseSerializer


class ExpenseViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = Expense.objects.select_related("vehicle").all()
    serializer_class = ExpenseSerializer
    permission_classes = [HasCapability]
    required_capability = "manage_expenses"


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
    required_capability = "view_pnl_reports"

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
    required_capability = "view_pnl_reports"

    def get(self, request):
        start, end = _parse_period(request)
        return Response(pnl.dashboard_pnl(start, end))
