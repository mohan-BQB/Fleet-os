from rest_framework import viewsets

from core.api import RetireOnDestroyMixin
from core.permissions import HasCapability

from .models import Driver
from .serializers import DriverSerializer


class DriverViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = Driver.objects.all()
    serializer_class = DriverSerializer
    permission_classes = [HasCapability]
    required_capability = "edit_vehicles_drivers"
