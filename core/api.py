"""Shared DRF plumbing for BaseModel-backed viewsets."""


class RetireOnDestroyMixin:
    """BaseModel.delete() raises (no hard deletes) - DELETE retires instead."""

    def perform_destroy(self, instance):
        instance.retire()
