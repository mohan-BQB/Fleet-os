from rest_framework import viewsets

from core.api import ActivateActionMixin, RetireOnDestroyMixin
from core.permissions import HasCapability

from .models import PartInventoryItem, PartStockMovement
from .serializers import PartInventoryItemSerializer, PartStockMovementSerializer


class PartInventoryItemViewSet(ActivateActionMixin, RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = PartInventoryItem.objects.all()
    serializer_class = PartInventoryItemSerializer
    permission_classes = [HasCapability]
    required_section = "vehicles"


class PartStockMovementViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    # Issue movements are only ever created server-side (see
    # maintenance.services / parts.services.sync_issue, wired from
    # MaintenanceLog) - this endpoint is how "Receive stock" posts a
    # RECEIPT; PartStockMovementSerializer.validate() still enforces the
    # ISSUE rules if one is ever posted here directly.
    queryset = PartStockMovement.objects.select_related("item", "vendor", "expense").all()
    serializer_class = PartStockMovementSerializer
    permission_classes = [HasCapability]
    required_section = "vehicles"
