"""Syncs a TripSheet's settlement fields (returned_amount/reimbursed_amount)
to the driver ledger - mirrors maintenance.services.sync_inventory_issue's
create-or-update-in-place pattern, and TripSheet.wage_entry's own sync,
just for the two settlement-side credits instead of the wage debit.
"""


def generate_trip_no(vehicle, date):
    """T-AUG26-0001 / W-AUG26-0001 - letter from card_type (route -> T,
    work -> W, the same vehicle.metering_unit check TripSheet.card_type
    already uses, just evaluated before the instance exists), 3-letter
    month + 2-digit year, serial resets to 0001 each month scoped to
    (organization, letter, month, year). TripSheet.objects is already
    tenant-scoped by TenantManager, so no explicit organization filter is
    needed here. Assigned once at create() and never editable after -
    see TripSheetSerializer.create()."""
    from .models import TripSheet

    letter = "T" if vehicle.metering_unit == "km" else "W"
    period = date.strftime("%b%y").upper()
    prefix = f"{letter}-{period}-"
    count = TripSheet.objects.filter(trip_no__startswith=prefix).count()
    return f"{prefix}{count + 1:04d}"


def sync_trip_expense_posting(trip_expense):
    """Every vendor-linked TripExpense also posts to a real ledger: a fuel
    entry becomes a FuelLog (so it keeps counting toward fuel-efficiency
    tracking, not just a lump-sum cost), everything else becomes an
    economics.Expense carrying the same expense_head straight across - both
    of which already know how to bill a vendor (vendors.services.sync_bill,
    called from their own save()) and both of which already feed
    economics.pnl.vehicle_pnl. Runs on every save, not gated on trip
    approval - a real cost/bill is real the moment it's entered, same
    reasoning as TripAdvance's immediate ledger sync."""
    from .models import FuelLog

    if trip_expense.expense_head.slug == "fuel":
        _sync_fuel_log(trip_expense, FuelLog)
    else:
        _sync_expense(trip_expense)


def _sync_fuel_log(trip_expense, FuelLog):
    if trip_expense.fuel_log_id:
        log = trip_expense.fuel_log
        log.vehicle = trip_expense.trip_sheet.vehicle
        log.driver = trip_expense.trip_sheet.driver
        log.date = trip_expense.date
        log.litres = trip_expense.litres
        log.rate_per_litre = trip_expense.rate_per_litre
        log.amount = trip_expense.amount
        log.fuel_station = trip_expense.vendor
        log.save()
    else:
        # driver comes straight off the trip sheet - a trip-sourced fuel
        # entry always has one on hand, unlike a standalone entry where a
        # person has to pick it (see FuelLogSerializer.validate()).
        log = FuelLog.objects.create(
            vehicle=trip_expense.trip_sheet.vehicle, driver=trip_expense.trip_sheet.driver,
            trip_sheet=trip_expense.trip_sheet,
            date=trip_expense.date, litres=trip_expense.litres, rate_per_litre=trip_expense.rate_per_litre,
            amount=trip_expense.amount, fuel_station=trip_expense.vendor,
        )
        trip_expense.fuel_log = log
        trip_expense.save()


def _sync_expense(trip_expense):
    from economics.models import ExpenseSourceType
    from economics.services import sync_linked_expense

    sync_linked_expense(
        source=trip_expense, link_field="expense",
        vehicle=trip_expense.trip_sheet.vehicle, expense_head=trip_expense.expense_head,
        date=trip_expense.date, amount=trip_expense.amount, vendor=trip_expense.vendor,
        notes=f"Trip expense — {trip_expense.expense_head.name}",
        source_type=ExpenseSourceType.TRIP_EXPENSE,
    )


def sync_advance_return_entry(trip_sheet):
    """The driver handing back unspent cash - a credit (LedgerEntryType.
    ADVANCE_RETURN), since it reduces what they're holding, same direction
    as an earning. No-op until returned_amount is actually set."""
    from .models import DriverLedgerEntry, LedgerEntryType

    if not trip_sheet.returned_amount or trip_sheet.returned_amount <= 0:
        return

    if trip_sheet.advance_return_entry_id:
        entry = trip_sheet.advance_return_entry
        entry.date = trip_sheet.returned_date or trip_sheet.date
        entry.amount = trip_sheet.returned_amount
        entry.remarks = f"Advance returned - {trip_sheet.returned_received_by or 'accountant'}"
        entry.save()
    else:
        entry = DriverLedgerEntry.objects.create(
            driver=trip_sheet.driver, trip_sheet=trip_sheet,
            date=trip_sheet.returned_date or trip_sheet.date,
            entry_type=LedgerEntryType.ADVANCE_RETURN, amount=trip_sheet.returned_amount,
            remarks=f"Advance returned - {trip_sheet.returned_received_by or 'accountant'}",
        )
        trip_sheet.advance_return_entry = entry
        trip_sheet.save()


def sync_reimbursement_entry(trip_sheet):
    """Paying the driver back for driver_own expenses - a credit
    (LedgerEntryType.REIMBURSEMENT). No-op until reimbursed_amount is set."""
    from .models import DriverLedgerEntry, LedgerEntryType

    if not trip_sheet.reimbursed_amount or trip_sheet.reimbursed_amount <= 0:
        return

    if trip_sheet.reimbursement_entry_id:
        entry = trip_sheet.reimbursement_entry
        entry.date = trip_sheet.reimbursed_date or trip_sheet.date
        entry.amount = trip_sheet.reimbursed_amount
        entry.save()
    else:
        entry = DriverLedgerEntry.objects.create(
            driver=trip_sheet.driver, trip_sheet=trip_sheet,
            date=trip_sheet.reimbursed_date or trip_sheet.date,
            entry_type=LedgerEntryType.REIMBURSEMENT, amount=trip_sheet.reimbursed_amount,
            remarks="Reimbursement for driver-paid expenses",
        )
        trip_sheet.reimbursement_entry = entry
        trip_sheet.save()
