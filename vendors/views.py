from rest_framework import viewsets

from core.api import ActivateActionMixin, RetireOnDestroyMixin
from core.permissions import HasCapability

from .models import Vendor, VendorLedgerEntry
from .serializers import VendorLedgerEntrySerializer, VendorSerializer


class VendorViewSet(ActivateActionMixin, RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    permission_classes = [HasCapability]
    required_section = "customers_vendors"


class VendorLedgerEntryViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = VendorLedgerEntry.objects.select_related("vendor").all()
    serializer_class = VendorLedgerEntrySerializer
    permission_classes = [HasCapability]
    required_section = "customers_vendors"
