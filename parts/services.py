"""Stock-issue mechanics for callers outside this app (today: maintenance,
via MaintenanceLog.part_source=from_inventory) - imported locally by the
caller, same convention vendors.services uses to avoid an import-time
cycle. Availability itself is checked by the caller's own serializer
.validate() (so a shortage surfaces as a clean field error before anything
is written); these are just the mechanical create/update/reverse, trusted
to run against already-validated data.
"""
from .models import PartStockMovement, PartStockMovementType


def available_quantity(item, exclude_movement=None):
    """Stock on hand, plus whatever `exclude_movement` (an existing ISSUE
    being edited) already holds against it - so re-saving a log with the
    same or a smaller quantity never gets rejected for "using its own
    stock twice"."""
    on_hand = item.quantity_on_hand
    if exclude_movement is not None and exclude_movement.status == "active" \
            and exclude_movement.movement_type == PartStockMovementType.ISSUE \
            and exclude_movement.item_id == item.id:
        on_hand += exclude_movement.quantity
    return on_hand


def sync_issue(existing_movement, item, quantity, date, source_model, source_id, notes=""):
    """Creates or updates the ISSUE movement tracing a consuming record's
    draw from inventory. Idempotent per (source_model, source_id) - pass
    back whatever `existing_movement` the caller already holds (e.g.
    MaintenanceLog.inventory_movement) so an edit adjusts the same row
    instead of stacking a second issue for one log entry."""
    if existing_movement is not None and existing_movement.status == "active":
        if existing_movement.item_id != item.id or existing_movement.quantity != quantity \
                or existing_movement.date != date or existing_movement.notes != notes:
            existing_movement.item = item
            existing_movement.quantity = quantity
            existing_movement.date = date
            existing_movement.notes = notes
            existing_movement.save()
        return existing_movement
    return PartStockMovement.objects.create(
        item=item, movement_type=PartStockMovementType.ISSUE, date=date, quantity=quantity,
        source_model=source_model, source_id=str(source_id), notes=notes,
    )


def reverse_issue(movement):
    """Gives the stock back - called when a log is edited away from
    from_inventory, or removed. Retired, not deleted (BaseModel.delete() is
    disabled anyway) - the movement stays visible in the item's history as
    a reversed line rather than vanishing."""
    if movement is not None and movement.status == "active":
        movement.retire()
