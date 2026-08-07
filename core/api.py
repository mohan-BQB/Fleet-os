"""Shared DRF plumbing for BaseModel-backed viewsets."""
from rest_framework.decorators import action
from rest_framework.response import Response


class RetireOnDestroyMixin:
    """BaseModel.delete() raises (no hard deletes) - DELETE retires instead."""

    def perform_destroy(self, instance):
        instance.retire()


class ActivateActionMixin:
    """The reverse of RetireOnDestroyMixin's DELETE, for the plain
    Active<->Inactive masters (Customer, Vendor, Parts) - POST /{id}/activate/
    calls BaseModel.activate(). Deliberately not mixed into every
    RetireOnDestroyMixin viewset: on transactional records (TripExpense,
    MaintenanceLog, Expense...) "retire" reverses a posting, and a generic
    "reactivate" there has no defined business meaning."""

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        instance = self.get_object()
        instance.activate(reason=request.data.get("reason", ""))
        return Response(self.get_serializer(instance).data)
