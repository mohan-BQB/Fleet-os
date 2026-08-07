"""Driver master. Licence and badge expiry feed the reminder engine, just like
vehicle documents. Drivers are retired as 'relieved', never deleted."""
from django.db import models

from core.models import BaseModel


class LicenceClass(models.TextChoices):
    LMV = "lmv", "LMV"
    HMV = "hmv", "HMV"
    HTV = "htv", "HTV / HGV"
    MULTIPLE = "multiple", "Multiple"


class EmploymentType(models.TextChoices):
    PERMANENT = "permanent", "Permanent"
    CONTRACT = "contract", "Contract"
    TEMPORARY = "temporary", "Temporary"


class WageBasis(models.TextChoices):
    MONTHLY = "monthly", "Monthly salary"
    PER_TRIP = "per_trip", "Per trip"
    PER_DAY = "per_day", "Per day"


class DriverStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ON_LEAVE = "on_leave", "On leave"
    RELIEVED = "relieved", "Relieved"


class Driver(BaseModel):
    # -- identity & contact -------------------------------------------------
    code = models.CharField(max_length=20, blank=True)  # e.g. DRV-01
    name = models.CharField(max_length=120)
    dob = models.DateField(null=True, blank=True)
    mobile = models.CharField(max_length=15, blank=True)
    emergency_contact = models.CharField(max_length=15, blank=True)
    address = models.CharField(max_length=300, blank=True)
    blood_group = models.CharField(max_length=5, blank=True)

    # -- licence & badge (feed reminders) ----------------------------------
    licence_number = models.CharField(max_length=30, blank=True)
    licence_class = models.CharField(max_length=12, choices=LicenceClass.choices, blank=True)
    licence_issue_date = models.DateField(null=True, blank=True)
    licence_valid_till = models.DateField(null=True, blank=True)
    issuing_rto = models.CharField(max_length=80, blank=True)
    badge_number = models.CharField(max_length=30, blank=True)
    badge_valid_till = models.DateField(null=True, blank=True)

    # -- employment & pay ---------------------------------------------------
    date_of_joining = models.DateField(null=True, blank=True)
    employment_type = models.CharField(
        max_length=12, choices=EmploymentType.choices, default=EmploymentType.PERMANENT
    )
    wage_basis = models.CharField(
        max_length=12, choices=WageBasis.choices, default=WageBasis.MONTHLY
    )
    wage_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    has_app_login = models.BooleanField(default=False)
    # Warn (not block) when a new advance would push outstanding advance
    # past this. Blank = no cap for this driver.
    advance_limit = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # -- attachments --------------------------------------------------------
    photo = models.ImageField(upload_to="drivers/", null=True, blank=True)
    licence_copy = models.FileField(upload_to="licences/", null=True, blank=True)
    id_proof = models.FileField(upload_to="ids/", null=True, blank=True)

    StatusChoices = DriverStatus

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "code"],
                name="uniq_driver_code_per_org",
                condition=models.Q(code__gt=""),
            )
        ]
        ordering = ["name"]

    ALLOWED_TRANSITIONS = {
        DriverStatus.ACTIVE: {DriverStatus.ON_LEAVE, DriverStatus.RELIEVED},
        DriverStatus.ON_LEAVE: {DriverStatus.ACTIVE, DriverStatus.RELIEVED},
        DriverStatus.RELIEVED: {DriverStatus.ACTIVE},  # via rejoin() only
    }

    def change_status(self, new_status, reason=""):
        allowed = self.ALLOWED_TRANSITIONS.get(self.status, set())
        if new_status not in allowed:
            raise ValueError(
                f"Can't move a {DriverStatus(self.status).label} driver to {DriverStatus(new_status).label}."
            )
        self.retire(new_status, reason=reason)

    def rejoin(self, reason=""):
        """Relieved (or on leave) -> Active, same record - the one reverse
        transition a Driver has, named for what it actually is rather than
        the generic activate()."""
        self.change_status(DriverStatus.ACTIVE, reason=reason)

    def retire(self, status=DriverStatus.RELIEVED, reason=""):
        super().retire(status, reason=reason)

    def __str__(self):
        return f"{self.name} ({self.code})" if self.code else self.name
