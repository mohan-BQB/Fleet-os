from rest_framework import viewsets

from core.api import RetireOnDestroyMixin
from core.permissions import HasCapability

from .models import Tyre, TyreService
from .serializers import TyreSerializer, TyreServiceSerializer


class TyreViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = Tyre.objects.select_related("vehicle").all()
    serializer_class = TyreSerializer
    permission_classes = [HasCapability]
    required_capability = "edit_vehicles_drivers"


class TyreServiceViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = TyreService.objects.select_related("vehicle", "tyre").all()
    serializer_class = TyreServiceSerializer
    permission_classes = [HasCapability]
    required_capability = "edit_vehicles_drivers"
