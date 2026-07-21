"""Vehicle master. Subclasses BaseModel, so it inherits tenancy, no-delete,
and audit automatically. The category is the master switch: it sets the
metering unit and (in the UI) which compliance documents apply."""
from django.db import models

from core.models import BaseModel


class Category(models.TextChoices):
    LORRY = "lorry", "Lorry"
    FOUR_WHEELER = "four_wheeler", "Four-wheeler"
    CAR = "car", "Car"
    TWO_WHEELER = "two_wheeler", "Two-wheeler"
    TRACTOR = "tractor", "Tractor"
    JCB = "jcb", "JCB"


HOURS_CATEGORIES = {Category.TRACTOR, Category.JCB}


class Usage(models.TextChoices):
    PRIVATE = "private", "Private"
    COMMERCIAL = "commercial", "Commercial"


class MeteringUnit(models.TextChoices):
    KM = "km", "Kilometres"
    HOURS = "hours", "Hours"


class TrackingMode(models.TextChoices):
    GPS = "gps", "GPS"
    MANUAL = "manual", "Manual"


class FuelType(models.TextChoices):
    DIESEL = "diesel", "Diesel"
    PETROL = "petrol", "Petrol"
    CNG = "cng", "CNG"
    LPG = "lpg", "LPG"
    ELECTRIC = "electric", "Electric"


class AcquisitionType(models.TextChoices):
    NEW = "new", "New"
    SECOND_HAND = "second_hand", "Second-hand"


class AxleLayout(models.TextChoices):
    LORRY_6 = "lorry_6", "Lorry · 6-wheeler"
    LORRY_10 = "lorry_10", "Lorry · 10-wheeler"
    LORRY_12 = "lorry_12", "Lorry · 12-wheeler"
    LORRY_14 = "lorry_14", "Lorry · 14-wheeler"
    LORRY_16 = "lorry_16", "Lorry · 16-wheeler"
    CAR_4_1 = "car_4_1", "Car · 4 + 1"
    TWO_WHEELER_2 = "two_wheeler_2", "Two-wheeler · 2"
    TRACTOR = "tractor", "Tractor · small front + big rear"


class VehicleStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    IN_SERVICE = "in_service", "In service"
    SOLD = "sold", "Sold"
    SCRAPPED = "scrapped", "Scrapped"


class Vehicle(BaseModel):
    # -- category & config (the master switch) ------------------------------
    registration_number = models.CharField(max_length=20)
    category = models.CharField(max_length=20, choices=Category.choices)
    usage = models.CharField(max_length=12, choices=Usage.choices, default=Usage.COMMERCIAL)
    metering_unit = models.CharField(max_length=6, choices=MeteringUnit.choices, blank=True)
    tracking_mode = models.CharField(  # admin-only to change
        max_length=6, choices=TrackingMode.choices, default=TrackingMode.MANUAL
    )

    # -- registration (from RC) --------------------------------------------
    registration_date = models.DateField(null=True, blank=True)
    rto = models.CharField(max_length=80, blank=True)
    chassis_number = models.CharField(max_length=40, blank=True)
    engine_number = models.CharField(max_length=40, blank=True)
    rc_valid_till = models.DateField(null=True, blank=True)  # feeds reminders
    fuel_norm = models.CharField(max_length=20, blank=True)  # BS-IV / BS-VI

    # -- classification & specs --------------------------------------------
    rto_vehicle_class = models.CharField(max_length=40, blank=True)
    maker = models.CharField(max_length=80, blank=True)
    model = models.CharField(max_length=80, blank=True)
    mfg_year = models.PositiveIntegerField(null=True, blank=True)
    fuel_type = models.CharField(max_length=12, choices=FuelType.choices, blank=True)
    cc = models.PositiveIntegerField(null=True, blank=True)
    seating_capacity = models.PositiveIntegerField(null=True, blank=True)
    gvw = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    colour = models.CharField(max_length=40, blank=True)
    body_type = models.CharField(max_length=40, blank=True)

    # -- ownership & acquisition -------------------------------------------
    owner_name = models.CharField(max_length=120, blank=True)
    owner_relation = models.CharField(max_length=40, blank=True)
    address = models.CharField(max_length=300, blank=True)
    financier = models.CharField(max_length=120, blank=True)
    hypothecation_till = models.DateField(null=True, blank=True)
    number_of_owners = models.PositiveIntegerField(default=1)
    acquisition_type = models.CharField(
        max_length=12, choices=AcquisitionType.choices, default=AcquisitionType.NEW
    )
    purchase_date = models.DateField(null=True, blank=True)          # required if second-hand (UI rule)
    previous_owner = models.CharField(max_length=120, blank=True)
    ownership_transfer_date = models.DateField(null=True, blank=True)

    # -- wheel / tyre configuration ----------------------------------------
    number_of_tyres = models.PositiveIntegerField(default=6)
    spare_tyres = models.PositiveIntegerField(default=1)
    axle_layout = models.CharField(max_length=20, choices=AxleLayout.choices, blank=True)

    # -- operational (app-added) -------------------------------------------
    fleet_id = models.CharField(max_length=40, blank=True)  # nickname e.g. "Lorry 3"
    current_meter = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    meter_reading_date = models.DateField(null=True, blank=True)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # -- attachments --------------------------------------------------------
    rc_copy = models.FileField(upload_to="rc/", null=True, blank=True)
    photo = models.ImageField(upload_to="vehicles/", null=True, blank=True)

    StatusChoices = VehicleStatus

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "registration_number"],
                name="uniq_registration_per_org",
            )
        ]
        ordering = ["registration_number"]

    def save(self, *args, **kwargs):
        # Metering unit follows the category unless explicitly set.
        if not self.metering_unit:
            self.metering_unit = (
                MeteringUnit.HOURS if self.category in HOURS_CATEGORIES else MeteringUnit.KM
            )
        super().save(*args, **kwargs)

    def retire(self, status=VehicleStatus.SOLD):
        super().retire(status)

    def __str__(self):
        return self.registration_number
