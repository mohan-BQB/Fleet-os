"""Shared helpers for posting to a customer's receivable ledger from other
apps (operations.TripLeg freight) without those apps needing an import-time
dependency on customers.models - callers import this module locally, inside
the method that needs it, the same convention core.audit/vendors.services use.
"""
from .models import CustomerLedgerEntry, CustomerLedgerEntryType


def post_invoice(customer, date, amount, remarks, source_model, source_id):
    """Creates the initial invoice for a source record. No-op if there's no
    customer to bill. Internal - callers should use sync_invoice() instead,
    which also handles edits made after the first save."""
    if not customer:
        return None
    return CustomerLedgerEntry.objects.create(
        customer=customer, date=date, entry_type=CustomerLedgerEntryType.INVOICE,
        amount=amount, remarks=remarks, source_model=source_model, source_id=str(source_id),
    )


def sync_invoice(customer, date, amount, remarks, source_model, source_id):
    """Called every time the source record is saved, not just on creation -
    an amount corrected after the fact needs to reach the ledger too,
    otherwise an unsettled invoice silently drifts out of sync with the
    record itself.

    No-op once the invoice has been received (see mark_received/is_received):
    a settled transaction shouldn't retroactively change underneath a
    recorded receipt."""
    if is_received(source_model, source_id):
        return None
    existing = CustomerLedgerEntry.objects.filter(
        source_model=source_model, source_id=str(source_id), entry_type=CustomerLedgerEntryType.INVOICE,
    ).first()
    if existing is None:
        return post_invoice(customer, date, amount, remarks, source_model, source_id)
    if customer is None:
        return existing
    if existing.customer_id != customer.id or existing.amount != amount or existing.date != date:
        existing.customer = customer
        existing.date = date
        existing.amount = amount
        existing.remarks = remarks
        existing.save()
    return existing


def is_received(source_model, source_id):
    """A source record is "received" once a receipt entry carrying its
    trace exists - the only source of truth (see CustomerLedgerEntry's
    docstring), not a stored flag on the source record itself."""
    return CustomerLedgerEntry.objects.filter(
        source_model=source_model, source_id=str(source_id), entry_type=CustomerLedgerEntryType.RECEIPT,
    ).exists()


def mark_received(customer, date, amount, remarks, source_model, source_id, payment_mode=""):
    """Posts the settling receipt for a specific invoice. Idempotent - a
    second call after it's already received is a no-op, not a double-receipt."""
    if not customer or is_received(source_model, source_id):
        return None
    return CustomerLedgerEntry.objects.create(
        customer=customer, date=date, entry_type=CustomerLedgerEntryType.RECEIPT,
        payment_mode=payment_mode, amount=amount, remarks=remarks,
        source_model=source_model, source_id=str(source_id),
    )
