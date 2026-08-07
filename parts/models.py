"""Spare-parts inventory: stock kept on hand ahead of need (bought in bulk,
partly used over time) as distinct from a part bought just-in-time for one
job (recorded directly on the MaintenanceLog that used it, never touching
this app - see MaintenanceLog.part_source).

PartInventoryItem is the catalog entry ("Air filter - Tata 407"); the
quantity actually on hand is never a stored, hand-editable number - like
Vendor's payable balance (vendors.VendorLedgerEntry) and Tyre's accumulated
distance, it's derived from an append-only ledger of movements
(PartStockMovement) so it can't drift from what was actually received and
issued. A RECEIPT records a real purchase (cost + who it came from, an
approved Vendor or a one-off shop); an ISSUE records stock leaving for a
specific consuming record (a MaintenanceLog part replacement) - never
free-floating, so nothing can leave the shelf without something on the
other end accounting for where it went.
"""
from django.db import models

from core.models import BaseModel


class PartInventoryItem(BaseModel):
    name = models.CharField(max_length=120)
    part_number = models.CharField(max_length=100, blank=True)
    unit = models.CharField(max_length=20, default="pcs")
    reorder_level = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    notes = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["name"]

    @property
    def quantity_on_hand(self):
        """Receipts minus issues, active movements only - a reversed/edited-
        away issue is retired (see parts.services), not deleted, so it drops
        out of this total the same way it drops out of the ledger view."""
        from django.db.models import Case, DecimalField, Sum, When

        total = self.movements.filter(status="active").aggregate(
            total=Sum(
                Case(
                    When(movement_type=PartStockMovementType.RECEIPT, then="quantity"),
                    When(movement_type=PartStockMovementType.ISSUE, then=-models.F("quantity")),
                    output_field=DecimalField(max_digits=12, decimal_places=1),
                )
            )
        )["total"]
        return total or 0

    def __str__(self):
        return f"{self.name}{f' ({self.part_number})' if self.part_number else ''}"


class PartStockMovementType(models.TextChoices):
    RECEIPT = "receipt", "Stock received (purchase)"
    ISSUE = "issue", "Stock issued (used)"


class PartStockMovement(BaseModel):
    """One ledger line. RECEIPT fields (unit_cost, vendor/unlisted_vendor_name,
    expense) are how a purchase gets accounted for; ISSUE's source_model/
    source_id trace exactly which record consumed the stock - same
    lightweight, no-import-cycle pattern as VendorLedgerEntry's trace back to
    Expense/FuelLog (parts stays independent of whatever app consumes it;
    today that's maintenance, via MaintenanceLog.inventory_movement)."""
    item = models.ForeignKey(PartInventoryItem, on_delete=models.PROTECT, related_name="movements")
    movement_type = models.CharField(max_length=10, choices=PartStockMovementType.choices)
    date = models.DateField()
    quantity = models.DecimalField(max_digits=10, decimal_places=1)

    # RECEIPT only.
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    vendor = models.ForeignKey(
        "vendors.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="part_stock_receipts"
    )
    # Fallback for a purchase from a shop that isn't in the Vendor master -
    # mutually exclusive with `vendor`. Same pattern as
    # MaintenanceLog.unlisted_vendor_name; enforced in
    # PartStockMovementSerializer.validate().
    unlisted_vendor_name = models.CharField(max_length=120, blank=True)
    expense = models.ForeignKey(
        "economics.Expense", null=True, blank=True, on_delete=models.PROTECT, related_name="part_stock_receipts"
    )

    # ISSUE only - who consumed this stock. Blank on a RECEIPT.
    source_model = models.CharField(max_length=40, blank=True)
    source_id = models.CharField(max_length=40, blank=True)

    notes = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.item.name} {self.get_movement_type_display()} x{self.quantity} ({self.date})"
