"""Vehicle master. Subclasses BaseModel, so it inherits tenancy, no-delete,
and audit automatically. The category is the master switch: it sets the
metering unit and (in the UI) which compliance documents apply."""
from django.db import models

from core.models import BaseModel


class Category(models.TextChoices):
    LORRY = "lorry", "Lorry"
    TIPPER = "tipper", "Tipper"
    FOUR_WHEELER = "four_wheeler", "Four-wheeler"
    CAR = "car", "Car"
    TWO_WHEELER = "two_wheeler", "Two-wheeler"
    TRACTOR = "tractor", "Tractor"
    JCB = "jcb", "JCB"
    RIG = "rig", "Rig"


HOURS_CATEGORIES = {Category.TRACTOR, Category.JCB, Category.RIG}


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
    # Categories that had no axle option at all before, despite already
    # existing in Category above.
    TIPPER_6 = "tipper_6", "Tipper · 6-wheeler"
    TIPPER_10 = "tipper_10", "Tipper · 10-wheeler"
    TIPPER_12 = "tipper_12", "Tipper · 12-wheeler"
    JCB_4 = "jcb_4", "JCB · 4-wheel"
    RIG_6 = "rig_6", "Rig · 6-wheeler"
    RIG_10 = "rig_10", "Rig · 10-wheeler"
    FOUR_WHEELER_4_1 = "four_wheeler_4_1", "Four-wheeler · 4 + 1"


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

    # Optional - a deal doesn't always go through a broker. Shown behind a
    # "purchased through a broker?" toggle in the UI (not tied to
    # acquisition_type - a broker can facilitate a new/fleet purchase too,
    # not just a second-hand one).
    broker_name = models.CharField(max_length=120, blank=True)
    broker_info = models.CharField(max_length=300, blank=True)
    broker_commission = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

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
    # The reverse side of this vehicle's own RC (in India, vehicle specs/
    # owner-history are often printed there) - not conditional on
    # acquisition_type, every RC has a back side regardless of new/second-hand.
    rc_copy_back = models.FileField(upload_to="rc/", null=True, blank=True)
    photo = models.ImageField(upload_to="vehicles/", null=True, blank=True)
    # The previous owner's own RC, for a second-hand purchase - distinct
    # from rc_copy above (this vehicle's current RC, either way).
    previous_rc_copy = models.FileField(upload_to="rc/", null=True, blank=True)

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

    # Active is home base; In service is a temporary detour (workshop,
    # repairs) that always leads back; Sold/Scrapped are terminal from
    # either. Enforced by change_status() - the three named actions below
    # are the only doors in, so a client can't skip past the check by
    # posting a bare status value.
    ALLOWED_TRANSITIONS = {
        VehicleStatus.ACTIVE: {VehicleStatus.IN_SERVICE, VehicleStatus.SOLD, VehicleStatus.SCRAPPED},
        VehicleStatus.IN_SERVICE: {VehicleStatus.ACTIVE, VehicleStatus.SOLD, VehicleStatus.SCRAPPED},
        VehicleStatus.SOLD: set(),
        VehicleStatus.SCRAPPED: set(),
    }

    def change_status(self, new_status, reason="", **extra):
        allowed = self.ALLOWED_TRANSITIONS.get(self.status, set())
        if new_status not in allowed:
            raise ValueError(
                f"Can't move a {VehicleStatus(self.status).label} vehicle to {VehicleStatus(new_status).label}."
            )
        self.retire(new_status, reason=reason, **extra)

    def mark_in_service(self, reason=""):
        self.change_status(VehicleStatus.IN_SERVICE, reason=reason)

    def mark_active(self, reason=""):
        self.change_status(VehicleStatus.ACTIVE, reason=reason)

    def mark_sold(self, sold_date, buyer="", sale_amount=None):
        self.change_status(VehicleStatus.SOLD, sold_date=sold_date, buyer=buyer, sale_amount=sale_amount)

    def mark_scrapped(self, scrap_date, reason=""):
        self.change_status(VehicleStatus.SCRAPPED, reason=reason, scrap_date=scrap_date)

    def retire(self, status=VehicleStatus.SOLD, reason="", **extra):
        super().retire(status, reason=reason, **extra)

    def __str__(self):
        return self.registration_number


class VehicleLoan(BaseModel):
    """Loan financing for a vehicle purchase - defined once (financier,
    principal, tenure, EMI amount) on the vehicle's own Loan tab, same
    define-once shape as Compliance/Tyres/Maintenance already living there.
    Cash-outflow tracking only - VehicleLoanInstallment never posts an
    economics.Expense row and never feeds economics.pnl's cost lines: an
    EMI is principal + interest, and only the interest portion is a true
    expense, but this app's whole ledger style (Expense, Vendor ledger,
    Driver ledger) is cash-based, not accrual - splitting principal/
    interest here would be the first place doing real accrual accounting,
    a bigger scope than this module. Net profit keeps meaning what it
    already means today. The full installment schedule is generated up
    front at creation - see vehicles.services.create_loan_with_schedule."""
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="loans")
    financier = models.CharField(max_length=120)
    principal_amount = models.DecimalField(max_digits=12, decimal_places=2)
    # Reference/display only, same as every other field here - does not
    # feed create_loan_with_schedule's math (emi_amount is still entered
    # directly) and is never split out of the cash-outflow figures above.
    # Storing it doesn't change this model's cash-not-accrual scope, just
    # keeps the rate on record alongside the deal it belongs to.
    interest_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    tenure_months = models.PositiveIntegerField()
    emi_amount = models.DecimalField(max_digits=10, decimal_places=2)
    start_date = models.DateField()
    notes = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-start_date"]

    @property
    def outstanding_installments(self):
        return self.installments.filter(status="active", paid=False).count()

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.financier}"


class VehicleLoanPaymentMode(models.TextChoices):
    CASH = "cash", "Cash"
    BANK = "bank", "Bank transfer"
    UPI = "upi", "UPI"
    CHEQUE = "cheque", "Cheque"


class VehicleLoanInstallment(BaseModel):
    """One EMI due date, 1..tenure_months - all generated up front when the
    loan is created (see vehicles.services.create_loan_with_schedule), the
    same "represent the whole recurring pattern as real rows" choice
    maintenance.MaintenanceSchedule already makes for its own due dates,
    rather than computing them on the fly. Marked paid individually as each
    one clears - see mark_paid, the same shape as economics.Expense's."""
    loan = models.ForeignKey(VehicleLoan, on_delete=models.PROTECT, related_name="installments")
    due_date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    paid = models.BooleanField(default=False)
    paid_date = models.DateField(null=True, blank=True)
    payment_mode = models.CharField(max_length=10, choices=VehicleLoanPaymentMode.choices, blank=True)

    class Meta:
        ordering = ["due_date"]

    @property
    def is_overdue(self):
        from django.utils import timezone

        return not self.paid and self.due_date < timezone.now().date()

    def mark_paid(self, paid_date=None, payment_mode=""):
        from django.utils import timezone

        self.paid = True
        self.paid_date = paid_date or timezone.now().date()
        self.payment_mode = payment_mode
        self.save()

    def __str__(self):
        return f"{self.loan.vehicle.registration_number} EMI due {self.due_date}"
