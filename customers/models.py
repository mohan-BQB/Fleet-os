"""Customer master - who you bill: freight consignors, quarry/site owners
paying for equipment hours. The receivable-side twin of vendors.Vendor:
a bill you send builds a receivable balance, settled as they pay. Created
inline from a trip leg's quick-add ("typing a new customer name creates the
customer + ledger, no navigating away") as well as from this page directly.
"""
from django.db import models

from core.models import BaseModel


class Customer(BaseModel):
    name = models.CharField(max_length=120)
    gstin = models.CharField(max_length=20, blank=True)
    contact_person = models.CharField(max_length=120, blank=True)
    mobile = models.CharField(max_length=15, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=300, blank=True)
    notes = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class CustomerLedgerEntryType(models.TextChoices):
    INVOICE = "invoice", "Invoice"
    RECEIPT = "receipt", "Receipt"


class CustomerLedgerEntry(BaseModel):
    """An invoice increases what's owed by the customer - posted
    automatically when an approved trip leg's freight bills them (see
    operations.TripSheetViewSet.approve / customers.services.sync_invoice);
    a receipt reduces it.

    source_model/source_id are a lightweight, non-FK trace back to whichever
    record triggered an entry - same pattern as vendors.VendorLedgerEntry
    (a real FK would put operations and customers in an import cycle).
    Manual ledger entries (e.g. a one-off invoice not tied to a trip) simply
    leave these blank."""
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="ledger_entries")
    date = models.DateField()
    entry_type = models.CharField(max_length=10, choices=CustomerLedgerEntryType.choices)
    payment_mode = models.CharField(max_length=10, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    remarks = models.CharField(max_length=300, blank=True)
    source_model = models.CharField(max_length=40, blank=True)
    source_id = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ["-date"]
        verbose_name_plural = "customer ledger entries"
