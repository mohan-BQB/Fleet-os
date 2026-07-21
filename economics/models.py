"""Costs that aren't fuel or driver wages (those live in `operations`) -
maintenance, tyres, toll, permits, insurance premiums. Feeds per-vehicle P&L
in pnl.py. A blank `vehicle` is a company-level overhead cost: it shows up in
the dashboard-wide P&L but isn't attributed to any single vehicle."""
from django.db import models

from core.models import BaseModel
from vehicles.models import Vehicle


class ExpenseCategory(models.TextChoices):
    MAINTENANCE = "maintenance", "Maintenance & repairs"
    TYRES = "tyres", "Tyres"
    TOLL = "toll", "Toll"
    PERMIT_FEE = "permit_fee", "Permit fee"
    INSURANCE_PREMIUM = "insurance_premium", "Insurance premium"
    SPARE_PARTS = "spare_parts", "Spare parts"
    OTHER = "other", "Other"


class Expense(BaseModel):
    vehicle = models.ForeignKey(
        Vehicle, null=True, blank=True, on_delete=models.PROTECT, related_name="expenses"
    )
    category = models.CharField(max_length=20, choices=ExpenseCategory.choices)
    date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    vendor = models.CharField(max_length=120, blank=True)
    notes = models.CharField(max_length=300, blank=True)
    receipt = models.FileField(upload_to="expenses/", null=True, blank=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        holder = self.vehicle.registration_number if self.vehicle else "Company"
        return f"{holder} - {self.get_category_display()} {self.amount} ({self.date})"
