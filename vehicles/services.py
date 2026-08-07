"""Generates a VehicleLoan's full installment schedule up front at creation
- see VehicleLoanInstallment's docstring for why (mirrors how
maintenance.MaintenanceSchedule represents its recurring due pattern as
real rows rather than computing them on the fly).
"""
import calendar


def add_months(date, months):
    """Calendar-correct month addition, clamping the day when the target
    month is shorter (e.g. Jan 31 + 1 month -> Feb 28/29, not an overflow
    into March) - the standard approach, no dateutil dependency needed for
    just this."""
    month_index = date.month - 1 + months
    year = date.year + month_index // 12
    month = month_index % 12 + 1
    day = min(date.day, calendar.monthrange(year, month)[1])
    return date.replace(year=year, month=month, day=day)


def create_loan_with_schedule(**loan_fields):
    """Creates the VehicleLoan and all tenure_months VehicleLoanInstallment
    rows in one go - due_date = start_date + i months, amount = emi_amount
    for every installment (no back-loaded/front-loaded schedule - a flat
    EMI is the whole point of an EMI). Deliberately .create() in a loop, not
    bulk_create() - BaseModel.save() is what stamps organization/created_by
    and writes the audit entry, and bulk_create() bypasses save() entirely
    (no other model in this codebase uses it, for the same reason)."""
    from .models import VehicleLoan, VehicleLoanInstallment

    loan = VehicleLoan.objects.create(**loan_fields)
    for i in range(loan.tenure_months):
        VehicleLoanInstallment.objects.create(
            loan=loan, due_date=add_months(loan.start_date, i), amount=loan.emi_amount,
        )
    return loan
