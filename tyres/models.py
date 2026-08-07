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
    # The vehicle's odometer reading at the START of the tyre's *current*
    # fitted stint - null whenever the tyre isn't currently fitted (spare or
    # retired). Only covers the open stint; total lifetime distance is
    # accumulated_distance + this stint (see total_distance()/save() below).
    odometer_at_fitting = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    # Distance run across every *closed* stint (every earlier time this
    # physical tyre was fitted then pulled - to spare or retirement).
    # System-maintained only, in save() below - never user-editable, so it
    # can't be reset or padded by hand. This is what makes a tyre pulled to
    # spare and later refitted keep its prior wear on record instead of
    # quietly restarting at zero.
    accumulated_distance = models.DecimalField(max_digits=12, decimal_places=1, default=0)
    notes = models.CharField(max_length=300, blank=True)

    StatusChoices = TyreStatus
    status = models.CharField(max_length=10, choices=TyreStatus.choices, default=TyreStatus.FITTED)

    class Meta:
        ordering = ["vehicle", "position"]

    def save(self, *args, **kwargs):
        # Runs for every path that can change status - the dedicated
        # replace-tyre action, the plain Retire button, and direct edits via
        # TyreSerializer (which allows toggling fitted/spare by hand) - so
        # the distance ledger can't be bypassed by going around any one of
        # them. Reads the *previous* DB state for both status and
        # odometer_at_fitting - not `self.odometer_at_fitting`, which may
        # already hold whatever new value the same request is trying to
        # write (e.g. a PATCH that changes status to spare AND blanks the
        # field in one call - the stint still has to close using where it
        # actually started, not what the caller just overwrote that with).
        previous_status = None
        previous_odometer_at_fitting = None
        if not self._state.adding:
            previous = Tyre.objects.filter(pk=self.pk).values("status", "odometer_at_fitting").first()
            if previous:
                previous_status = previous["status"]
                previous_odometer_at_fitting = previous["odometer_at_fitting"]

        ending_stint = previous_status == TyreStatus.FITTED and self.status != TyreStatus.FITTED
        starting_stint = previous_status != TyreStatus.FITTED and self.status == TyreStatus.FITTED

        if ending_stint:
            if previous_odometer_at_fitting is not None and self.vehicle.current_meter is not None:
                distance = self.vehicle.current_meter - previous_odometer_at_fitting
                if distance > 0:
                    self.accumulated_distance = (self.accumulated_distance or 0) + distance
            # Stint's over - freeze distance tracking (no live stint to
            # measure) until this tyre gets fitted again. Forced regardless
            # of what the caller passed, so a non-fitted tyre can never be
            # left carrying a stale "currently accumulating" reading.
            self.odometer_at_fitting = None

        if starting_stint and self.odometer_at_fitting is None and self.vehicle.current_meter is not None:
            # Only fills in when nothing more specific was already given
            # (e.g. apply_tyre_replacement passing the exact fitting reading
            # from the replace-tyre form) - this is just the fallback for
            # entry points that don't supply one, like a direct status edit.
            self.odometer_at_fitting = self.vehicle.current_meter

        super().save(*args, **kwargs)

    @property
    def total_distance(self):
        """Lifetime distance: every closed stint plus the current one, if
        fitted. The one number that survives rotations, spare stints, and
        re-fitting intact - see save() for how each contributes."""
        accumulated = self.accumulated_distance or 0
        has_open_stint = (
            self.status == TyreStatus.FITTED
            and self.odometer_at_fitting is not None
            and self.vehicle.current_meter is not None
        )
        if not has_open_stint and not accumulated:
            return None
        current_stint = max(self.vehicle.current_meter - self.odometer_at_fitting, 0) if has_open_stint else 0
        return accumulated + current_stint

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


class TyreServiceBilling(models.TextChoices):
    PAID = "paid", "Vendor"
    INTERNAL = "done_internally", "Done internally"


class TyreServicePerformer(models.TextChoices):
    INTERNAL = "internal", "Our own team"
    # Mirrors maintenance.ServicePerformer - required alongside billing so
    # an outside person's work can't be waved through as "done internally"
    # (enforced in TyreServiceSerializer.validate()).
    EXTERNAL = "external", "Outside person / vendor"


class TyreSource(models.TextChoices):
    # Mirrors maintenance.PartSource - only relevant for
    # service_type=replacement (required then, in
    # TyreServiceSerializer.validate()). The new tyre's own cost/vendor is
    # tyre_vendor/tyre_unlisted_vendor_name/tyre_expense below, entirely
    # independent of vendor/billing/amount (the fitting labour charge,
    # governed by performed_by) - buying the tyre and paying whoever fitted
    # it are two separate obligations, even when it's the same shop.
    NEW_PURCHASE = "new_purchase", "Bought new for this job"
    # Promoted from spare stock - its cost was already paid/recorded when
    # that tyre was originally bought (Tyre.purchase_price/purchase_date),
    # not now.
    FROM_SPARE = "from_spare", "Fitted from spare stock"


class TyreRemovalReason(models.TextChoices):
    WORN_OUT = "worn_out", "Worn out"
    PUNCTURE = "puncture", "Puncture (unrepairable)"
    SIDEWALL_DAMAGE = "sidewall_damage", "Sidewall / structural damage"
    UNEVEN_WEAR = "uneven_wear", "Uneven wear"
    OTHER = "other", "Other"


class TyreService(BaseModel):
    """One service event - e.g. this vehicle had an alignment on this date at
    this odometer. Optionally tied to one tyre (a specific replacement or
    repair); alignment/rotation are usually vehicle-wide, not per-tyre."""
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="tyre_services")
    tyre = models.ForeignKey(
        Tyre, null=True, blank=True, on_delete=models.PROTECT, related_name="services"
    )
    # Only set for service_type=replacement - the physical tyre this one
    # replaced. This is the entire lineage trail: "what happened to the old
    # tyre" is answered by looking up its status (retired vs spare, set
    # atomically alongside this record - see tyres.services.apply_tyre_replacement),
    # not by a separate stored flag that could drift out of sync with it.
    previous_tyre = models.ForeignKey(
        Tyre, null=True, blank=True, on_delete=models.PROTECT, related_name="replaced_by"
    )
    removal_reason = models.CharField(max_length=20, choices=TyreRemovalReason.choices, blank=True)
    # The outgoing tyre's own final reading, distinct from odometer/
    # tread_depth_in below (which - for a replacement - describe the
    # incoming tyre at the moment it went on). Keeping them separate means a
    # replacement can record both "why this tyre came off, in what shape"
    # and "what's going on now" without one overwriting the other.
    removal_odometer = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    removal_tread_depth_in = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    service_type = models.CharField(max_length=20, choices=TyreServiceType.choices)
    date = models.DateField()
    odometer = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    # A reading at this service, not a single static value on Tyre - lets
    # tread wear be tracked over time across inspections/rotations.
    tread_depth_in = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    # For rotation/replacement: where the tyre ended up. save() below applies
    # this to the tyre's own `position`, which is what actually moves it on
    # the position map; this field is just the historical record of that
    # change - core.audit already captures the before/after on Tyre itself.
    new_position = models.CharField(max_length=40, blank=True)
    # The FITTING/LABOUR charge - who got paid for the work itself, never
    # for the tyre (see tyre_vendor below for that, a fully independent
    # payment). Governed by performed_by, not tyre_source.
    vendor = models.ForeignKey(
        "vendors.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="tyre_services"
    )
    # Fallback for a one-off purchase from a shop not in the Vendor master -
    # mutually exclusive with `vendor` (enforced in
    # TyreServiceSerializer.validate()). See MaintenanceLog.unlisted_vendor_name
    # for the full rationale - same pattern, mirrored here.
    unlisted_vendor_name = models.CharField(max_length=120, blank=True)
    # See MaintenanceLog.performed_by for the full rationale - same field,
    # same reasoning, mirrored here.
    performed_by = models.CharField(max_length=20, choices=TyreServicePerformer.choices, blank=True)
    # Who actually did the work - distinct from `vendor` (the shop/company
    # paid, not necessarily the individual who showed up). Also used when
    # performed_by=internal (the in-house mechanic). See
    # MaintenanceLog.service_person_name for the full rationale - same field,
    # same reasoning, mirrored here. Optional, not enforced - can't require
    # a name a shop doesn't offer.
    service_person_name = models.CharField(max_length=120, blank=True)
    service_person_mobile = models.CharField(max_length=15, blank=True)
    notes = models.CharField(max_length=300, blank=True)

    # Every service either cost money (paid, via a linked Expense that flows
    # through the normal vendor/payment machinery) or didn't (done in-house -
    # internal_note says who/what, so "no expense" reads as a deliberate
    # statement rather than someone forgetting to bill it). Enforced in
    # TyreServiceSerializer.validate(), not here - blank/"" is what existing
    # rows predating this field carry, and stays valid on their own re-saves.
    billing = models.CharField(max_length=20, choices=TyreServiceBilling.choices, blank=True, default="")
    internal_note = models.CharField(max_length=300, blank=True)
    expense = models.ForeignKey(
        "economics.Expense", null=True, blank=True, on_delete=models.PROTECT, related_name="tyre_services"
    )

    # Only set for service_type=replacement - required (in
    # TyreServiceSerializer.validate()) whenever that's the type. See
    # TyreSource.
    tyre_source = models.CharField(max_length=20, choices=TyreSource.choices, blank=True)
    # The TYRE's own payment - only used when tyre_source=new_purchase,
    # entirely independent of vendor/billing/amount above (the fitting
    # charge). Required whenever a tyre is bought new.
    tyre_vendor = models.ForeignKey(
        "vendors.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="tyre_purchases"
    )
    # Mutually exclusive with tyre_vendor - same one-off-shop fallback as
    # unlisted_vendor_name, mirrored for the tyre's own payment.
    tyre_unlisted_vendor_name = models.CharField(max_length=120, blank=True)
    tyre_expense = models.ForeignKey(
        "economics.Expense", null=True, blank=True, on_delete=models.PROTECT, related_name="tyre_purchase_services"
    )

    class Meta:
        ordering = ["-date"]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.tyre_id and self.new_position and self.tyre.position != self.new_position:
            self.tyre.position = self.new_position
            self.tyre.save()

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.get_service_type_display()} ({self.date})"
