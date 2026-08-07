"""Wires a MaintenanceLog's declared part_source to the parts-inventory
ledger. Imported locally from the serializer (not at module load time) -
same import-cycle-avoidance convention as vendors.services / economics.Expense.
"""


def sync_inventory_issue(instance):
    """Called on every MaintenanceLog save, not just creation - so editing
    a log after the fact (switching source, changing quantity, or moving
    off part_replacement entirely) keeps the inventory ledger in sync
    instead of leaving a stale issue standing (or a needed one missing).
    """
    from parts.models import PartStockMovementType
    from parts.services import reverse_issue, sync_issue

    from .models import MaintenanceWorkType, PartSource

    wants_issue = (
        instance.work_type == MaintenanceWorkType.PART_REPLACEMENT
        and instance.part_source == PartSource.FROM_INVENTORY
        and instance.inventory_item_id
        and instance.part_quantity
    )

    if not wants_issue:
        if instance.inventory_movement_id:
            reverse_issue(instance.inventory_movement)
            instance.inventory_movement = None
            instance.save(update_fields=["inventory_movement"])
        return

    existing = instance.inventory_movement if instance.inventory_movement_id else None
    if existing is not None and existing.movement_type != PartStockMovementType.ISSUE:
        existing = None

    movement = sync_issue(
        existing, instance.inventory_item, instance.part_quantity, instance.date,
        "MaintenanceLog", instance.id, notes=f"{instance.vehicle.registration_number} — {instance.part_name or 'service'}",
    )
    if instance.inventory_movement_id != movement.id:
        instance.inventory_movement = movement
        instance.save(update_fields=["inventory_movement"])
