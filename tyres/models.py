"""Individual tyre tracking + service history (alignment, rotation, repair).

The vehicle's basic tyre count/axle layout lives on Vehicle itself
(number_of_tyres, spare_tyres, axle_layout) - this app tracks the actual
physical tyres filling those slots over time, and the service events that
keep them aligned/rotated/repaired. Costs (purchase, alignment labour) are
tracked separately via economics.Expense (category=tyres), keeping money
and physical tracking in their existing separate lanes.
"""
from django.db import models

from core.models import BaseModel
from vehicles.models import Vehicle


class TyreStatus(models.TextChoices):
    FITTED = "fitted", "Fitted"
    SPARE = "spare", "Spare (in stock)"
    RETIRED = "retired", "Retired"


class Tyre(BaseModel):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="tyres")
    # Free text, not a fixed enum: wheel position naming varies by axle
    # layout (a 6-wheeler and a 14-wheeler don't share a position vocabulary).
    position = models.CharField(max_length=40, blank=True)
    brand = models.CharField(max_length=60, blank=True)
    size = models.CharField(max_length=30, blank=True)
    serial_number = models.CharField(max_length=60, blank=True)
    fitted_date = models.DateField(null=True, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    purchase_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    odometer_at_fitting = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    notes = models.CharField(max_length=300, blank=True)

    StatusChoices = TyreStatus
    status = models.CharField(max_length=10, choices=TyreStatus.choices, default=TyreStatus.FITTED)

    class Meta:
        ordering = ["vehicle", "position"]

    def retire(self, status=TyreStatus.RETIRED):
        super().retire(status)

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.position or 'unassigned'} ({self.brand})"


class TyreServiceType(models.TextChoices):
    ALIGNMENT = "alignment", "Wheel alignment"
    ROTATION = "rotation", "Rotation"
    BALANCING = "balancing", "Balancing"
    PUNCTURE_REPAIR = "puncture_repair", "Puncture repair"
    REPLACEMENT = "replacement", "Replacement"
    INSPECTION = "inspection", "Inspection"


class TyreService(BaseModel):
    """One service event - e.g. this vehicle had an alignment on this date at
    this odometer. Optionally tied to one tyre (a specific replacement or
    repair); alignment/rotation are usually vehicle-wide, not per-tyre."""
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="tyre_services")
    tyre = models.ForeignKey(
        Tyre, null=True, blank=True, on_delete=models.PROTECT, related_name="services"
    )
    service_type = models.CharField(max_length=20, choices=TyreServiceType.choices)
    date = models.DateField()
    odometer = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    vendor = models.CharField(max_length=120, blank=True)
    notes = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.get_service_type_display()} ({self.date})"
