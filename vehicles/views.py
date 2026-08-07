from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from core.permissions import HasCapability

from .models import Vehicle, VehicleLoan, VehicleLoanInstallment
from .serializers import VehicleLoanInstallmentSerializer, VehicleLoanSerializer, VehicleSerializer


class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer
    permission_classes = [HasCapability]
    required_section = "vehicles"
    # No bare DELETE - status changes go through the four validated actions
    # below (each its own confirmed, reason/detail-capturing door), not a
    # generic "delete this row" shortcut that would skip the transition
    # checks in Vehicle.change_status(). All four are in
    # core.permissions.CHANGE_STATUS_ACTIONS, so HasCapability already
    # requires vehicles.change_status for them - no extra manual check here.
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    @action(detail=True, methods=["post"])
    def mark_in_service(self, request, pk=None):
        vehicle = self.get_object()
        try:
            vehicle.mark_in_service(reason=request.data.get("reason", ""))
        except ValueError as exc:
            raise ValidationError(str(exc))
        return Response(VehicleSerializer(vehicle).data)

    @action(detail=True, methods=["post"])
    def mark_active(self, request, pk=None):
        vehicle = self.get_object()
        try:
            vehicle.mark_active(reason=request.data.get("reason", ""))
        except ValueError as exc:
            raise ValidationError(str(exc))
        return Response(VehicleSerializer(vehicle).data)

    @action(detail=True, methods=["post"])
    def mark_sold(self, request, pk=None):
        vehicle = self.get_object()
        sold_date = request.data.get("sold_date")
        if not sold_date:
            raise ValidationError({"sold_date": "Enter the date this vehicle was sold."})
        try:
            vehicle.mark_sold(
                sold_date=sold_date, buyer=request.data.get("buyer", ""),
                sale_amount=request.data.get("sale_amount"),
            )
        except ValueError as exc:
            raise ValidationError(str(exc))
        return Response(VehicleSerializer(vehicle).data)

    @action(detail=True, methods=["post"])
    def mark_scrapped(self, request, pk=None):
        vehicle = self.get_object()
        scrap_date = request.data.get("scrap_date")
        if not scrap_date:
            raise ValidationError({"scrap_date": "Enter the date this vehicle was scrapped."})
        try:
            vehicle.mark_scrapped(scrap_date=scrap_date, reason=request.data.get("reason", ""))
        except ValueError as exc:
            raise ValidationError(str(exc))
        return Response(VehicleSerializer(vehicle).data)


class VehicleLoanViewSet(viewsets.ModelViewSet):
    queryset = VehicleLoan.objects.all()
    serializer_class = VehicleLoanSerializer
    permission_classes = [HasCapability]
    required_section = "vehicles"
    # Set up once, no delete/status toggle - same minimal-footprint shape
    # as ExpenseHead (add + view only; nothing to retire, foreclosing a
    # loan early isn't a flow this module builds).
    http_method_names = ["get", "post", "patch", "head", "options"]


class VehicleLoanInstallmentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = VehicleLoanInstallment.objects.select_related("loan__vehicle").all()
    serializer_class = VehicleLoanInstallmentSerializer
    permission_classes = [HasCapability]
    required_section = "vehicles"

    @action(detail=True, methods=["post"])
    def mark_paid(self, request, pk=None):
        installment = self.get_object()
        installment.mark_paid(
            paid_date=request.data.get("paid_date") or timezone.now().date(),
            payment_mode=request.data.get("payment_mode", ""),
        )
        return Response(VehicleLoanInstallmentSerializer(installment).data)
