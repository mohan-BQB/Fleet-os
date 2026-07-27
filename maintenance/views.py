from rest_framework import viewsets

from core.api import RetireOnDestroyMixin
from core.permissions import HasCapability

from .models import MaintenanceLog, MaintenanceSchedule
from .serializers import MaintenanceLogSerializer, MaintenanceScheduleSerializer


class MaintenanceScheduleViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = MaintenanceSchedule.objects.select_related("vehicle").all()
    serializer_class = MaintenanceScheduleSerializer
    permission_classes = [HasCapability]
    required_capability = "edit_vehicles_drivers"


class MaintenanceLogViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = MaintenanceLog.objects.select_related("vehicle", "schedule").all()
    serializer_class = MaintenanceLogSerializer
    permission_classes = [HasCapability]
    required_capability = "edit_vehicles_drivers"
