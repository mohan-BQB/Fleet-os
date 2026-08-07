# Data migration: backfill Expense.source_type/source_id on every row that
# predates the field (0009). Inverts get_source()'s per-row reverse scan
# (economics/serializers.py) into one bulk pass per source model instead of
# N x 6 queries - walk each source model's non-null expense FK once, tag the
# Expense row it points at.
#
# Uses .objects on the historical models (apps.get_model), not .all_objects:
# TenantManager isn't marked use_in_migrations=True, so Django gives every
# historical model a plain, unfiltered manager by default - already
# equivalent to all_objects here, and all_objects isn't guaranteed to exist
# on a historical model at all.
#
# Uses .update() rather than .save() deliberately - this is a one-time
# correction of a previously-unrecorded fact, not a user edit, so it
# shouldn't stamp updated_by/updated_at or spam the audit log with
# thousands of synthetic "update" rows.
from django.db import migrations


def backfill_source(apps, schema_editor):
    Expense = apps.get_model("economics", "Expense")
    TyreService = apps.get_model("tyres", "TyreService")
    MaintenanceLog = apps.get_model("maintenance", "MaintenanceLog")
    TripExpense = apps.get_model("operations", "TripExpense")
    PartStockMovement = apps.get_model("parts", "PartStockMovement")

    def tag(pairs, source_type):
        for source_id, expense_id in pairs:
            if expense_id is None:
                continue
            Expense.objects.filter(pk=expense_id).update(
                source_type=source_type, source_id=source_id
            )

    tag(TyreService.objects.exclude(expense_id=None).values_list("id", "expense_id"), "tyre_service_labour")
    tag(TyreService.objects.exclude(tyre_expense_id=None).values_list("id", "tyre_expense_id"), "tyre_purchase")
    tag(MaintenanceLog.objects.exclude(expense_id=None).values_list("id", "expense_id"), "maintenance_labour")
    tag(MaintenanceLog.objects.exclude(part_expense_id=None).values_list("id", "part_expense_id"), "maintenance_part")
    tag(TripExpense.objects.exclude(expense_id=None).values_list("id", "expense_id"), "trip_expense")
    tag(PartStockMovement.objects.exclude(expense_id=None).values_list("id", "expense_id"), "parts_receipt")


def clear_source(apps, schema_editor):
    Expense = apps.get_model("economics", "Expense")
    Expense.objects.exclude(source_type="").update(source_type="", source_id=None)


class Migration(migrations.Migration):

    dependencies = [
        ("economics", "0009_expense_source_id_expense_source_type_and_more"),
        ("tyres", "0011_tyreservice_tyre_expense_tyreservice_tyre_source_and_more"),
        ("maintenance", "0010_maintenancelog_part_expense_and_more"),
        ("operations", "0013_tripsheet_unique_trip_no_per_org"),
        ("parts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(backfill_source, reverse_code=clear_source),
    ]
