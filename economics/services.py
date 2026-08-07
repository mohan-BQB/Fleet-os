"""Helpers other apps call into - kept out of models.py, and out of
expense_heads.py (which stays import-safe for migrations), for ordinary
runtime use."""
from .expense_heads import SEED_HEADS


def seed_expense_heads(organization):
    """Idempotent: creates whichever of the standard heads this org is
    missing. Called once from core.management.commands.bootstrap_admin when
    a new Organization is provisioned - every Expense/TripExpense write
    requires a real expense_head, so a freshly bootstrapped org needs these
    to exist before anyone can log a cost."""
    from .models import ExpenseHead

    for slug, name, group in SEED_HEADS:
        ExpenseHead.objects.get_or_create(
            organization=organization, slug=slug, defaults={"name": name, "group": group},
        )


def sync_linked_expense(
    *, source, link_field, expense_head, date, amount, vendor, notes, source_type, vehicle=None,
):
    """Create-or-update-in-place the Expense linked to `source` via
    `link_field` (the FK attribute name on `source`, e.g. "expense" or
    "tyre_expense") - the one shape shared, previously six separate
    near-identical times over, by every place that posts to the Expense
    ledger as a side effect of saving something else (a trip expense, a
    tyre service's labour or its new-tyre purchase, a maintenance log's
    labour or its new-part purchase, a parts receipt).

    `source_type`/`source_id` are set only on create - an existing linked
    row's origin never changes across re-syncs, only its amount/date/
    vendor/notes do. This writes straight to the Expense model, not through
    ExpenseSerializer, so it's unaffected by that serializer's lock on
    system-posted rows (see ExpenseSerializer.validate) - a source record
    re-syncing its own linked Expense is exactly the case that lock exists
    to protect, not block."""
    from .models import Expense

    expense_id = getattr(source, f"{link_field}_id")
    if expense_id:
        expense = getattr(source, link_field)
        expense.vehicle = vehicle
        expense.expense_head = expense_head
        expense.date = date
        expense.amount = amount
        expense.vendor = vendor
        expense.notes = notes
        expense.save()
    else:
        expense = Expense.objects.create(
            vehicle=vehicle, expense_head=expense_head, date=date, amount=amount,
            vendor=vendor, notes=notes, source_type=source_type, source_id=source.id,
        )
        setattr(source, link_field, expense)
        source.save()
    return expense
