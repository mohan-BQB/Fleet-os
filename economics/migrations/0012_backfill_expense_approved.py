# Data migration: grandfather every pre-existing Expense row as approved.
# Without this, every expense entered before this feature shipped would
# read as "pending" the moment it goes live - not true, and not useful.
# Only rows created after this migration runs default to pending (the
# model field's own default, applied at INSERT time going forward).
from django.db import migrations

# Literal values, not an import of economics.models.ExpenseApprovalStatus -
# migrations stay decoupled from the app's current model code (same
# reasoning economics/expense_heads.py's own docstring states for why it
# has zero Django model imports), and the 0010 backfill migration already
# set this precedent for this app.
APPROVED = "approved"
PENDING = "pending"


def backfill_approved(apps, schema_editor):
    Expense = apps.get_model("economics", "Expense")
    Expense.objects.update(approval_status=APPROVED)


def clear_approval(apps, schema_editor):
    Expense = apps.get_model("economics", "Expense")
    Expense.objects.update(approval_status=PENDING, approval_note="")


class Migration(migrations.Migration):

    dependencies = [
        ("economics", "0011_expense_approval_note_expense_approval_status"),
    ]

    operations = [
        migrations.RunPython(backfill_approved, reverse_code=clear_approval),
    ]
