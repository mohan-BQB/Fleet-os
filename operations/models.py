"""Daily operations: a trip sheet per vehicle/driver/day, its legs (a trip
sheet covers one or more hauls - "multi-leg"), fuel purchases, and driver
ledger entries (advances/wages/deductions tied to a trip when the driver is
paid per-trip). All subclass BaseModel, so tenancy/no-delete/audit are free.
"""
from decimal import Decimal

from django.db import models

from core.models import BaseModel
from drivers.models import Driver
from vehicles.models import Vehicle


class TripSheetStatus(models.TextChoices):
    OPEN = "open", "Open"
    CLOSED = "closed", "Closed"
    CANCELLED = "cancelled", "Cancelled"


class TripSheet(BaseModel):
    """One vehicle's operating day (or continuous trip) - the header a
    driver/manager opens, adds legs to, and closes out with a closing meter
    reading."""
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="trip_sheets")
    driver = models.ForeignKey(Driver, on_delete=models.PROTECT, related_name="trip_sheets")
    date = models.DateField()
    opening_meter = models.DecimalField(max_digits=12, decimal_places=1)
    closing_meter = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    remarks = models.CharField(max_length=300, blank=True)

    StatusChoices = TripSheetStatus
    status = models.CharField(
        max_length=10, choices=TripSheetStatus.choices, default=TripSheetStatus.OPEN
    )

    class Meta:
        ordering = ["-date", "-created_at"]

    @property
    def distance_covered(self):
        if self.closing_meter is None:
            return None
        return self.closing_meter - self.opening_meter

    @property
    def total_freight(self):
        return sum((leg.freight_amount for leg in self.legs.all()), Decimal("0"))

    def close(self, closing_meter):
        """Close the trip sheet and roll the reading forward onto the vehicle
        (current_meter/meter_reading_date exist on Vehicle for exactly this)."""
        self.closing_meter = closing_meter
        self.status = TripSheetStatus.CLOSED
        self.save()
        if self.vehicle.current_meter is None or closing_meter > self.vehicle.current_meter:
            self.vehicle.current_meter = closing_meter
            self.vehicle.meter_reading_date = self.date
            self.vehicle.save()

    def retire(self, status=TripSheetStatus.CANCELLED):
        super().retire(status)

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.date}"


class TripLeg(BaseModel):
    """One haul within a trip sheet: pick up at `from_place`, drop at
    `to_place`, invoiced as `lr_number` (the lorry receipt), earning
    `freight_amount`."""
    trip_sheet = models.ForeignKey(TripSheet, on_delete=models.PROTECT, related_name="legs")
    sequence = models.PositiveSmallIntegerField(default=1)
    from_place = models.CharField(max_length=120)
    to_place = models.CharField(max_length=120)
    consignor = models.CharField(max_length=120, blank=True)
    lr_number = models.CharField(max_length=40, blank=True)
    freight_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    remarks = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["trip_sheet", "sequence"]

    def __str__(self):
        return f"Leg {self.sequence}: {self.from_place} -> {self.to_place}"


class FuelLog(BaseModel):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="fuel_logs")
    trip_sheet = models.ForeignKey(
        TripSheet, null=True, blank=True, on_delete=models.PROTECT, related_name="fuel_logs"
    )
    date = models.DateField()
    litres = models.DecimalField(max_digits=8, decimal_places=2)
    rate_per_litre = models.DecimalField(max_digits=8, decimal_places=2)
    amount = models.DecimalField(max_digits=10, decimal_places=2, blank=True)
    odometer = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    fuel_station = models.CharField(max_length=120, blank=True)
    is_full_tank = models.BooleanField(default=True)

    class Meta:
        ordering = ["-date"]

    def save(self, *args, **kwargs):
        if not self.amount:
            self.amount = self.litres * self.rate_per_litre
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.litres}L on {self.date}"


class LedgerEntryType(models.TextChoices):
    ADVANCE = "advance", "Advance"
    WAGE = "wage", "Wage"
    BONUS = "bonus", "Bonus"
    DEDUCTION = "deduction", "Deduction"


class DriverLedgerEntry(BaseModel):
    """Advances/wages/deductions against a driver. Linking to a trip sheet
    attributes the cost to that vehicle's P&L (see economics.pnl); leaving it
    blank means a company-level cost (e.g. a monthly salary run)."""
    driver = models.ForeignKey(Driver, on_delete=models.PROTECT, related_name="ledger_entries")
    trip_sheet = models.ForeignKey(
        TripSheet, null=True, blank=True, on_delete=models.PROTECT, related_name="ledger_entries"
    )
    date = models.DateField()
    entry_type = models.CharField(max_length=12, choices=LedgerEntryType.choices)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    remarks = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-date"]
        verbose_name_plural = "driver ledger entries"

    def __str__(self):
        return f"{self.driver} - {self.get_entry_type_display()} {self.amount} ({self.date})"
