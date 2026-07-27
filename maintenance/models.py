"""Preventive maintenance: recurring part-service schedules (oil, filters,
brake pads, etc.) tracked by km and/or time, whichever comes first - plus
the log of services actually performed. Part is a free-text field, not a
catalog (mirrors how tyre position works): different fleets/vehicles name
things differently, and a shared catalog is more machinery than a small
fleet needs. Costs live in economics.Expense (category=maintenance),
consistent with how tyres keeps money separate from physical tracking.
"""
from datetime import timedelta

from django.db import models
from django.utils import timezone

from core.models import BaseModel
from vehicles.models import Vehicle


class MaintenanceSchedule(BaseModel):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="maintenance_schedules")
    part_name = models.CharField(max_length=80)
    interval_km = models.PositiveIntegerField(null=True, blank=True)
    interval_days = models.PositiveIntegerField(null=True, blank=True)
    last_done_date = models.DateField(null=True, blank=True)
    last_done_odometer = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    notes = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["vehicle", "part_name"]

    @property
    def next_due_km(self):
        if self.interval_km is None or self.last_done_odometer is None:
            return None
        return self.last_done_odometer + self.interval_km

    @property
    def next_due_date(self):
        if self.interval_days is None or self.last_done_date is None:
            return None
        return self.last_done_date + timedelta(days=self.interval_days)

    @property
    def km_remaining(self):
        due = self.next_due_km
        if due is None or self.vehicle.current_meter is None:
            return None
        return due - self.vehicle.current_meter

    @property
    def days_remaining(self):
        due = self.next_due_date
        if due is None:
            return None
        return (due - timezone.localdate()).days

    @property
    def is_overdue(self):
        """Whichever comes first: overdue the moment either threshold is
        crossed, if it's set at all."""
        km_over = self.km_remaining is not None and self.km_remaining <= 0
        date_over = self.days_remaining is not None and self.days_remaining <= 0
        return km_over or date_over

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.part_name}"


class MaintenanceLog(BaseModel):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="maintenance_logs")
    schedule = models.ForeignKey(
        MaintenanceSchedule, null=True, blank=True, on_delete=models.PROTECT, related_name="logs"
    )
    part_name = models.CharField(max_length=80, blank=True)
    date = models.DateField()
    odometer = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    vendor = models.CharField(max_length=120, blank=True)
    notes = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-date"]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.schedule_id and (self.schedule.last_done_date is None or self.date >= self.schedule.last_done_date):
            self.schedule.last_done_date = self.date
            self.schedule.last_done_odometer = self.odometer
            self.schedule.save()

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.part_name or 'service'} ({self.date})"
