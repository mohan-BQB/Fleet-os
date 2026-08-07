from rest_framework import viewsets

from core.api import ActivateActionMixin, RetireOnDestroyMixin
from core.permissions import HasCapability

from .models import Customer, CustomerLedgerEntry
from .serializers import CustomerLedgerEntrySerializer, CustomerSerializer


class CustomerViewSet(ActivateActionMixin, RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [HasCapability]
    required_section = "customers_vendors"


class CustomerLedgerEntryViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = CustomerLedgerEntry.objects.select_related("customer").all()
    serializer_class = CustomerLedgerEntrySerializer
    permission_classes = [HasCapability]
    required_section = "customers_vendors"
