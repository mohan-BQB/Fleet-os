from rest_framework import viewsets

from core.api import RetireOnDestroyMixin
from core.models import Role
from core.permissions import HasCapability
from drivers.models import Driver

from .models import DriverLedgerEntry, FuelLog, TripLeg, TripSheet
from .permissions import CanEnterTripSheets, own_trip_sheets_filter
from .serializers import (
    DriverLedgerEntrySerializer, FuelLogSerializer, TripLegSerializer, TripSheetSerializer,
)


class TripSheetViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    serializer_class = TripSheetSerializer
    permission_classes = [CanEnterTripSheets]

    def get_queryset(self):
        qs = TripSheet.objects.select_related("vehicle", "driver").prefetch_related("legs").all()
        return own_trip_sheets_filter(qs, self.request.user)

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == Role.DRIVER:
            serializer.save(driver=Driver.objects.get(pk=user.driver_id))
        else:
            serializer.save()


class TripLegViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    serializer_class = TripLegSerializer
    permission_classes = [CanEnterTripSheets]

    def get_queryset(self):
        qs = TripLeg.objects.select_related("trip_sheet").all()
        return own_trip_sheets_filter(qs, self.request.user, driver_field="trip_sheet__driver_id")


class FuelLogViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    serializer_class = FuelLogSerializer
    permission_classes = [CanEnterTripSheets]

    def get_queryset(self):
        qs = FuelLog.objects.select_related("vehicle", "trip_sheet").all()
        return own_trip_sheets_filter(qs, self.request.user, driver_field="trip_sheet__driver_id")


class DriverLedgerEntryViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = DriverLedgerEntry.objects.select_related("driver", "trip_sheet").all()
    serializer_class = DriverLedgerEntrySerializer
    permission_classes = [HasCapability]
    required_capability = "driver_ledger"
