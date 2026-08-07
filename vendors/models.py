"""Vendor master - everyone you pay: fuel stations, garages, tyre shops,
parts suppliers, insurance agents. The mirror of the driver ledger, but for
money owed the other way: bills from a vendor build a payable balance,
settled as you pay. vendor_type scopes which picker a vendor shows up in
(fuel-log, service, etc.) so those lists stay short and relevant."""
from django.db import models

from core.models import BaseModel


class VendorType(models.TextChoices):
    FUEL_STATION = "fuel_station", "Fuel station"
    GARAGE = "garage", "Garage"
    TYRE_SHOP = "tyre_shop", "Tyre shop"
    PARTS_SUPPLIER = "parts_supplier", "Parts supplier"
    INSURANCE_AGENT = "insurance_agent", "Insurance agent"
    OTHER = "other", "Other"


class Vendor(BaseModel):
    name = models.CharField(max_length=120)
    vendor_type = models.CharField(max_length=20, choices=VendorType.choices)
    contact_person = models.CharField(max_length=120, blank=True)
    mobile = models.CharField(max_length=15, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=300, blank=True)
    gstin = models.CharField(max_length=20, blank=True)
    # Whether TDS applies to payments to this vendor - the company's own TAN
    # (core.CompanyProfile) is what actually lets TDS be deducted at all;
    # this just flags which vendors it's relevant for.
    tds_applicable = models.BooleanField(default=False)
    notes = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_vendor_type_display()})"


class VendorLedgerEntryType(models.TextChoices):
    BILL = "bill", "Bill"
    PAYMENT = "payment", "Payment"


class VendorPaymentMode(models.TextChoices):
    CASH = "cash", "Cash"
    BANK = "bank", "Bank transfer"
    UPI = "upi", "UPI"
    CHEQUE = "cheque", "Cheque"


class VendorLedgerEntry(BaseModel):
    """A bill increases what's owed to the vendor - posted automatically
    when an Expense or FuelLog is saved against this vendor, see their
    save() methods - a payment reduces it.

    source_model/source_id are a lightweight, non-FK trace back to whichever
    Expense/FuelLog triggered an entry (same pattern as core.AuditLog's
    model_name/object_id) - a real ForeignKey would put economics/operations
    and vendors in an import cycle. This is what lets a specific expense's
    "paid" status be read back out (see vendors.services.is_paid): a payment
    entry with the same source_model/source_id as a bill means that bill is
    settled. Manual ledger entries (e.g. from the vendor passbook's "Record
    payment") simply leave these blank."""
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="ledger_entries")
    date = models.DateField()
    entry_type = models.CharField(max_length=10, choices=VendorLedgerEntryType.choices)
    payment_mode = models.CharField(max_length=10, choices=VendorPaymentMode.choices, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    remarks = models.CharField(max_length=300, blank=True)
    source_model = models.CharField(max_length=40, blank=True)
    source_id = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ["-date"]
        verbose_name_plural = "vendor ledger entries"
