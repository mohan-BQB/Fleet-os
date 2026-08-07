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


class MaintenanceLogBilling(models.TextChoices):
    PAID = "paid", "Vendor"
    INTERNAL = "done_internally", "Done internally"


class ServicePerformer(models.TextChoices):
    INTERNAL = "internal", "Our own team"
    # An outside person did the work, whether or not they're the same
    # entity as `vendor` (e.g. a garage that sends different mechanics each
    # visit). Enforced in MaintenanceLogSerializer.validate() to require
    # billing=paid - closes the gap where service_person_name could name an
    # outside worker while billing was left at "done internally", which
    # would silently mean nobody was actually paid for their labour.
    EXTERNAL = "external", "Outside person / vendor"


class MaintenanceWorkType(models.TextChoices):
    PART_REPLACEMENT = "part_replacement", "Part replacement"
    # Oil, coolant, grease, brake fluid, labour-only work (e.g. alignment
    # done under Maintenance rather than Tyres) - nothing physical comes off
    # the vehicle to be accounted for, so none of the part-tracking fields
    # below apply.
    CONSUMABLE = "consumable", "Consumable / fluid / labour only"


class PartDisposalPlan(models.TextChoices):
    RETURNED_TO_VENDOR = "returned_to_vendor", "Returned to vendor (core exchange)"
    SCRAPPED = "scrapped", "Scrapped / disposed"
    KEPT_AS_SPARE = "kept_as_spare", "Kept as spare / backup"
    HANDED_TO_OWNER = "handed_to_owner", "Handed to vehicle owner"
    OTHER = "other", "Other"


class PartSource(models.TextChoices):
    # Bought specifically for this job - its own cost/vendor is tracked by
    # part_vendor/part_unlisted_vendor_name/part_expense below, entirely
    # separate from vendor/billing/amount (which is the labour/service
    # charge, governed by performed_by - see both fields' docstrings). Two
    # different payees can each be pending or settled on their own schedule:
    # the parts shop that sold it, and whoever fitted it, even when that's
    # an outside person and not the same shop. Required in
    # MaintenanceLogSerializer.validate() whenever this is chosen.
    NEW_PURCHASE = "new_purchase", "Bought new for this job"
    # Pulled from stock bought ahead of time (parts.PartInventoryItem) -
    # its cost/vendor was already recorded at the moment it was received
    # into stock, not now. See inventory_item/part_quantity below and
    # inventory_movement, the ISSUE record this creates.
    FROM_INVENTORY = "from_inventory", "Used from spare / inventory"


class MaintenanceLog(BaseModel):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="maintenance_logs")
    schedule = models.ForeignKey(
        MaintenanceSchedule, null=True, blank=True, on_delete=models.PROTECT, related_name="logs"
    )
    part_name = models.CharField(max_length=80, blank=True)
    date = models.DateField()
    odometer = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    # The LABOUR/SERVICE charge - who got paid for the work itself, never
    # for a part (see part_vendor below for that, a fully independent
    # payment). Governed by performed_by, not part_source: an outside
    # technician always has to be paid here regardless of whether a part
    # was bought new, drawn from stock, or nothing physical changed at all.
    vendor = models.ForeignKey(
        "vendors.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="maintenance_logs"
    )
    # Fallback for a genuine one-off purchase from a shop that isn't in the
    # Vendor master - mutually exclusive with `vendor` (enforced in
    # MaintenanceLogSerializer.validate()). Deliberately not itself linked
    # to the vendor payable ledger (there's no Vendor row to post a bill
    # against), but still recorded - see _sync_expense, which folds it into
    # the linked Expense's notes so the vehicle's cost record isn't blank
    # about who got paid just because they weren't already in the system.
    unlisted_vendor_name = models.CharField(max_length=120, blank=True)
    # Required (in MaintenanceLogSerializer.validate()) alongside billing,
    # not instead of it - this is what makes billing trustworthy rather
    # than a free choice: performed_by=external forces billing=paid, so an
    # outside person's work can never be waved through as "done internally"
    # just because no one filled in the vendor/amount fields.
    performed_by = models.CharField(max_length=20, choices=ServicePerformer.choices, blank=True)
    # Who actually put hands on the vehicle - distinct from `vendor`, which is
    # the shop/company paid, not necessarily the individual who showed up.
    # Also filled when performed_by=internal, where it's the in-house
    # mechanic - one searchable field for "who touched this vehicle" either
    # way, instead of that name only living inside internal_note's free text.
    # Deliberately optional, not enforced: a shop won't always give a name,
    # and the system can't force information that isn't offered.
    service_person_name = models.CharField(max_length=120, blank=True)
    service_person_mobile = models.CharField(max_length=15, blank=True)
    notes = models.CharField(max_length=300, blank=True)

    # Same paid-vs-internal split as TyreService (see its docstring) -
    # enforced in MaintenanceLogSerializer.validate().
    billing = models.CharField(max_length=20, choices=MaintenanceLogBilling.choices, blank=True, default="")
    internal_note = models.CharField(max_length=300, blank=True)
    expense = models.ForeignKey(
        "economics.Expense", null=True, blank=True, on_delete=models.PROTECT, related_name="maintenance_logs"
    )

    # Every logged service says whether a physical part came off the
    # vehicle or not (blank/"" only on rows predating this field - enforced
    # as required going forward in MaintenanceLogSerializer.validate(), not
    # here). For a part replacement, the outgoing part must be identifiable
    # (a part/serial number, a photo, or both) and its fate accounted for -
    # this is the "nothing walks off the yard unrecorded" guarantee: a claimed
    # replacement can't be logged, billed, and paid for without evidence the
    # old part existed and a stated plan for where it went.
    work_type = models.CharField(max_length=20, choices=MaintenanceWorkType.choices, blank=True, default="")
    old_part_number = models.CharField(max_length=100, blank=True)
    old_part_photo = models.FileField(upload_to="maintenance_parts/", null=True, blank=True)
    disposal_plan = models.CharField(max_length=20, choices=PartDisposalPlan.choices, blank=True)

    # The *incoming* part's own trace, mirroring the outgoing part's
    # disposal_plan above - required (in MaintenanceLogSerializer.validate())
    # whenever work_type=part_replacement, same "nothing unaccounted for"
    # guarantee applied to the other end of the swap.
    part_source = models.CharField(max_length=20, choices=PartSource.choices, blank=True)
    inventory_item = models.ForeignKey(
        "parts.PartInventoryItem", null=True, blank=True, on_delete=models.PROTECT, related_name="maintenance_logs"
    )
    part_quantity = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    # The ISSUE movement this log created against inventory_item - system-
    # maintained only (see maintenance.services.sync_inventory_issue,
    # called from the serializer), never user-editable. This is the actual
    # link in the top-to-bottom trace: this part -> this movement -> the
    # receipt(s) that stocked it, with their cost and vendor.
    inventory_movement = models.ForeignKey(
        "parts.PartStockMovement", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    # The PART's own payment - only used when part_source=new_purchase,
    # entirely independent of vendor/billing/amount above (the labour
    # charge). Required (in MaintenanceLogSerializer.validate()) whenever a
    # part is bought new: paying the parts shop and paying whoever fitted
    # it are two separate obligations that can be settled on two separate
    # schedules, even when they happen to be the same vendor.
    part_vendor = models.ForeignKey(
        "vendors.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="maintenance_part_purchases"
    )
    # Mutually exclusive with part_vendor - same one-off-shop fallback as
    # unlisted_vendor_name, mirrored for the part's own payment.
    part_unlisted_vendor_name = models.CharField(max_length=120, blank=True)
    part_expense = models.ForeignKey(
        "economics.Expense", null=True, blank=True, on_delete=models.PROTECT, related_name="maintenance_part_logs"
    )

    class Meta:
        ordering = ["-date"]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.schedule_id and (self.schedule.last_done_date is None or self.date >= self.schedule.last_done_date):
            self.schedule.last_done_date = self.date
            self.schedule.last_done_odometer = self.odometer
            self.schedule.save()

    def retire(self, status="inactive"):
        # Removing the log that drew stock has to give that stock back -
        # otherwise a deleted/undone service permanently understates what's
        # actually on the shelf.
        if self.inventory_movement_id:
            from parts.services import reverse_issue

            reverse_issue(self.inventory_movement)
        super().retire(status)

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.part_name or 'service'} ({self.date})"
