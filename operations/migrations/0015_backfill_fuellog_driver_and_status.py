# Data migration: backfill every pre-existing FuelLog row.
# - status -> approved (grandfathered, same reasoning as the Expense
#   approval backfill: a historical entry shouldn't suddenly read as
#   unreviewed the moment this feature ships - see
#   economics/migrations/0012_backfill_expense_approved.py).
# - driver -> the linked trip sheet's driver, where one exists. Left blank
#   otherwise (a standalone entry with no trip sheet has no reliable way to
#   backfill who it was for) - only new entries require it going forward
#   (FuelLogSerializer.validate()), not historical ones.
from django.db import migrations

APPROVED = "approved"


def backfill(apps, schema_editor):
    FuelLog = apps.get_model("operations", "FuelLog")
    TripSheet = apps.get_model("operations", "TripSheet")

    trip_driver = dict(TripSheet.objects.values_list("id", "driver_id"))
    for log_id, trip_sheet_id in FuelLog.objects.exclude(trip_sheet=None).values_list("id", "trip_sheet_id"):
        driver_id = trip_driver.get(trip_sheet_id)
        if driver_id:
            FuelLog.objects.filter(pk=log_id).update(driver_id=driver_id)

    FuelLog.objects.update(status=APPROVED)


def clear(apps, schema_editor):
    FuelLog = apps.get_model("operations", "FuelLog")
    FuelLog.objects.update(status="draft", driver=None, approval_note="")


class Migration(migrations.Migration):

    dependencies = [
        ("operations", "0014_fuellog_approval_note_fuellog_driver_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill, reverse_code=clear),
    ]
