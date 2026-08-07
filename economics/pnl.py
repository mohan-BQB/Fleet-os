"""Per-vehicle and dashboard-wide P&L. Revenue comes from trip leg freight;
costs are fuel, trip-attributed driver wages/bonuses, and other expenses.
Callers run inside a request, so `Vehicle.objects` / etc. are already
tenant-scoped by TenantManager - no explicit organization filter needed here.
"""
from decimal import Decimal

from django.db.models import Sum

from operations.models import DriverLedgerEntry, FuelLog, LedgerEntryType, TripLeg
from vehicles.models import Vehicle

from .models import Expense

ZERO = Decimal("0")
# Real driver-attributable costs. Not ADVANCE (a float, not a cost) or
# ADVANCE_RETURN (cash coming back, nets the float to zero) - but
# REIMBURSEMENT is a genuine company cost, just paid through the driver
# instead of a vendor directly (see TripExpense.paid_from=driver_own).
DRIVER_COST_TYPES = [LedgerEntryType.WAGE, LedgerEntryType.BONUS, LedgerEntryType.REIMBURSEMENT]


def _sum(queryset, field):
    return queryset.aggregate(total=Sum(field))["total"] or ZERO


def vehicle_pnl(vehicle, start, end):
    revenue = _sum(
        TripLeg.objects.filter(
            trip_sheet__vehicle=vehicle, trip_sheet__date__range=(start, end)
        ),
        "freight_amount",
    )
    fuel_cost = _sum(
        FuelLog.objects.filter(vehicle=vehicle, date__range=(start, end)), "amount"
    )
    driver_cost = _sum(
        DriverLedgerEntry.objects.filter(
            trip_sheet__vehicle=vehicle,
            date__range=(start, end),
            entry_type__in=DRIVER_COST_TYPES,
        ),
        "amount",
    )
    other_expenses = _sum(
        Expense.objects.filter(vehicle=vehicle, date__range=(start, end)), "amount"
    )
    return {
        "vehicle_id": str(vehicle.id),
        "registration_number": vehicle.registration_number,
        "period": {"start": start, "end": end},
        "revenue": revenue,
        "fuel_cost": fuel_cost,
        "driver_cost": driver_cost,
        "other_expenses": other_expenses,
        "net_profit": revenue - fuel_cost - driver_cost - other_expenses,
    }


def dashboard_pnl(start, end):
    """Company-wide P&L: every vehicle's breakdown, ranked by profit, plus
    costs that aren't tied to any single vehicle (e.g. a monthly salary run,
    or a head-office expense)."""
    by_vehicle = [vehicle_pnl(v, start, end) for v in Vehicle.objects.all()]
    by_vehicle.sort(key=lambda row: row["net_profit"], reverse=True)

    unattributed_driver_cost = _sum(
        DriverLedgerEntry.objects.filter(
            trip_sheet__isnull=True, date__range=(start, end), entry_type__in=DRIVER_COST_TYPES
        ),
        "amount",
    )
    unattributed_expenses = _sum(
        Expense.objects.filter(vehicle__isnull=True, date__range=(start, end)), "amount"
    )

    totals = {
        "revenue": sum((row["revenue"] for row in by_vehicle), ZERO),
        "fuel_cost": sum((row["fuel_cost"] for row in by_vehicle), ZERO),
        "driver_cost": sum((row["driver_cost"] for row in by_vehicle), ZERO),
        "other_expenses": sum((row["other_expenses"] for row in by_vehicle), ZERO),
        "unattributed_driver_cost": unattributed_driver_cost,
        "unattributed_expenses": unattributed_expenses,
    }
    totals["net_profit"] = (
        totals["revenue"]
        - totals["fuel_cost"]
        - totals["driver_cost"]
        - totals["other_expenses"]
        - unattributed_driver_cost
        - unattributed_expenses
    )
    return {"period": {"start": start, "end": end}, "totals": totals, "by_vehicle": by_vehicle}
