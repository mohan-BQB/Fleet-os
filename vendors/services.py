"""Shared helpers for posting to a vendor's payable ledger from other apps
(economics.Expense, operations.FuelLog) without those apps needing an
import-time dependency on vendors.models - callers import this module
locally, inside the method that needs it, the same convention core.audit
uses for record_audit()."""
from .models import VendorLedgerEntry, VendorLedgerEntryType, VendorPaymentMode


def post_bill(vendor, date, amount, remarks, source_model, source_id):
    """Creates the initial bill for a source record. No-op if there's no
    vendor to bill. Internal - Expense/FuelLog should call sync_bill()
    instead, which also handles edits made after the first save."""
    if not vendor:
        return None
    return VendorLedgerEntry.objects.create(
        vendor=vendor, date=date, entry_type=VendorLedgerEntryType.BILL,
        amount=amount, remarks=remarks, source_model=source_model, source_id=str(source_id),
    )


def sync_bill(vendor, date, amount, remarks, source_model, source_id):
    """Called from Expense.save()/FuelLog.save() on *every* save, not just
    creation - a vendor added after the fact, or an amount/vendor corrected
    on an edit, needs to reach the ledger too, otherwise an unpaid record's
    bill silently drifts out of sync with the record itself.

    No-op once the bill's been paid (see mark_paid/is_paid): a settled
    transaction shouldn't retroactively change underneath a recorded
    payment. If the vendor gets cleared entirely on an edit, the existing
    bill is left as-is rather than guessed at - clearing a vendor after
    billing is an edge case rare enough not to auto-resolve."""
    if is_paid(source_model, source_id):
        return None
    existing = VendorLedgerEntry.objects.filter(
        source_model=source_model, source_id=str(source_id), entry_type=VendorLedgerEntryType.BILL,
    ).first()
    if existing is None:
        return post_bill(vendor, date, amount, remarks, source_model, source_id)
    if vendor is None:
        return existing
    if existing.vendor_id != vendor.id or existing.amount != amount or existing.date != date:
        existing.vendor = vendor
        existing.date = date
        existing.amount = amount
        existing.remarks = remarks
        existing.save()
    return existing


def is_paid(source_model, source_id):
    """A source record is "paid" once a payment entry carrying its trace
    exists - this is the only source of truth (see VendorLedgerEntry's
    docstring), not a stored flag on the source record itself."""
    return VendorLedgerEntry.objects.filter(
        source_model=source_model, source_id=str(source_id), entry_type=VendorLedgerEntryType.PAYMENT,
    ).exists()


def mark_paid(vendor, date, amount, remarks, source_model, source_id, payment_mode=""):
    """Posts the settling payment for a specific Expense/FuelLog. Idempotent
    - a second call after it's already paid is a no-op, not a double-payment.

    payment_mode is required and validated here too, not just at the view/
    serializer layer - this is the one function anything that wants to mark
    something paid must go through, so this is the last line of defense
    against a payment ever landing in the ledger with no recorded method."""
    if payment_mode not in VendorPaymentMode.values:
        raise ValueError("payment_mode is required and must be a valid VendorPaymentMode.")
    if not vendor or is_paid(source_model, source_id):
        return None
    return VendorLedgerEntry.objects.create(
        vendor=vendor, date=date, entry_type=VendorLedgerEntryType.PAYMENT,
        payment_mode=payment_mode, amount=amount, remarks=remarks,
        source_model=source_model, source_id=str(source_id),
    )
