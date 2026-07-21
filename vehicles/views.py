from rest_framework import viewsets

from core.api import RetireOnDestroyMixin
from core.permissions import HasCapability

from .models import Vehicle
from .serializers import VehicleSerializer


class VehicleViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer
    permission_classes = [HasCapability]
    required_capability = "edit_vehicles_drivers"
