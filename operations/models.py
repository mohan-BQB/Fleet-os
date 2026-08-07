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
    DRAFT = "draft", "Draft"
    SUBMITTED = "submitted", "Submitted"
    APPROVED = "approved", "Approved"
    CLOSED = "closed", "Closed"
    CANCELLED = "cancelled", "Cancelled"


class TripSheet(BaseModel):
    """One vehicle's operating day (or continuous trip) - the header a
    driver/manager opens, adds legs to, and submits with a closing meter
    reading once the day is done. Also the money box: every rupee handed to
    the driver (advances), spent (trip_expenses), and returned has to
    reconcile before this can be approved & closed - see
    reconciliation_variance/is_reconciled below, and
    TripSheetViewSet.approve_close for the close-gate that enforces it."""
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="trip_sheets")
    driver = models.ForeignKey(Driver, on_delete=models.PROTECT, related_name="trip_sheets")
    trip_no = models.CharField(max_length=40, blank=True)
    date = models.DateField()
    opening_meter = models.DecimalField(max_digits=12, decimal_places=1)
    closing_meter = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    # Only meaningful for card_type=='work' (JCB/tractor) - the productive
    # hours out of the vehicle's total engine hours for the day (see
    # distance_covered, which is that total - already generic/unit-agnostic).
    # idle_hours/idle_pct below are derived from the two together.
    working_hours = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    remarks = models.CharField(max_length=300, blank=True)
    # The DriverLedgerEntry this trip sheet created for a per-trip driver's
    # wage - system-maintained only (see TripSheetSerializer.validate()/
    # _sync_wage_entry), never user-editable. Only ever set when
    # driver.wage_basis=per_trip: a monthly/per-day driver's pay isn't tied
    # to any one trip sheet, so nothing gets created for them here - that
    # wage keeps flowing through the Driver Ledger as a periodic entry, same
    # as it does today.
    wage_entry = models.ForeignKey(
        "DriverLedgerEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    # -- settlement: the money box's single close-out, not a repeatable
    # child like advances/expenses (there's one cash-in-hand return per trip).
    returned_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    returned_received_by = models.CharField(max_length=120, blank=True)
    returned_date = models.DateField(null=True, blank=True)
    # Paying back driver_own expenses (see reimbursement_due) - distinct from
    # returned_amount, which is the driver handing *unspent* cash back.
    reimbursed_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reimbursed_date = models.DateField(null=True, blank=True)
    # System-maintained sync targets for the settlement above, mirroring
    # wage_entry exactly - see operations.services.sync_advance_return_entry/
    # sync_reimbursement_entry.
    advance_return_entry = models.ForeignKey(
        "DriverLedgerEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    reimbursement_entry = models.ForeignKey(
        "DriverLedgerEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    # Only ever set by TripSheetViewSet.approve, when forcing through a trip
    # that doesn't reconcile - who did it and why is then just this field,
    # audited for free by BaseModel.save()'s existing diff log.
    reconciliation_override_reason = models.CharField(max_length=300, blank=True)

    StatusChoices = TripSheetStatus
    status = models.CharField(
        max_length=10, choices=TripSheetStatus.choices, default=TripSheetStatus.DRAFT
    )

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            # Partial constraint - excludes blank trip_no so rows created
            # before auto-numbering existed (or any legacy blank value)
            # don't collide with each other. Same pattern core.Permission
            # already uses for its two partial unique constraints.
            models.UniqueConstraint(
                fields=["organization", "trip_no"],
                condition=~models.Q(trip_no=""),
                name="unique_trip_no_per_org",
            ),
        ]

    @property
    def card_type(self):
        """Which face this trip wears - km vehicles get the route card, hours
        vehicles the work card. Purely derived from the vehicle; no route-leg/
        work-item models exist yet (a later phase), this is just the label."""
        return "route" if self.vehicle.metering_unit == "km" else "work"

    @property
    def distance_covered(self):
        if self.closing_meter is None:
            return None
        return self.closing_meter - self.opening_meter

    @property
    def total_freight(self):
        legs_total = sum((leg.freight_amount for leg in self.legs.all()), Decimal("0"))
        work_total = sum((item.amount for item in self.work_items.all()), Decimal("0"))
        return legs_total + work_total

    @property
    def idle_hours(self):
        if self.working_hours is None or self.distance_covered is None:
            return None
        return self.distance_covered - self.working_hours

    @property
    def idle_pct(self):
        total = self.distance_covered
        idle = self.idle_hours
        if not total or idle is None:
            return None
        return (idle / total) * 100

    def _km_total(self, load_status=None):
        legs = self.legs.all()
        if load_status is not None:
            legs = [leg for leg in legs if leg.load_status == load_status]
        return sum((leg.distance_km or Decimal("0") for leg in legs), Decimal("0"))

    @property
    def total_km(self):
        return self._km_total()

    @property
    def loaded_km(self):
        return self._km_total(TripLegLoadStatus.LOADED)

    @property
    def empty_km(self):
        return self._km_total(TripLegLoadStatus.EMPTY)

    @property
    def empty_running_pct(self):
        total = self.total_km
        if not total:
            return None
        return (self.empty_km / total) * 100

    @property
    def total_advance(self):
        return sum((a.amount for a in self.advances.all()), Decimal("0"))

    def _expenses_total(self, paid_from):
        return sum(
            (e.amount for e in self.trip_expenses.all() if e.paid_from == paid_from), Decimal("0")
        )

    @property
    def expenses_paid_from_advance(self):
        return self._expenses_total(TripExpensePaidFrom.ADVANCE)

    @property
    def driver_own_expenses_total(self):
        return self._expenses_total(TripExpensePaidFrom.DRIVER_OWN)

    @property
    def company_direct_expenses_total(self):
        return self._expenses_total(TripExpensePaidFrom.COMPANY_DIRECT)

    @property
    def reconciliation_variance(self):
        """total_advance - expenses_paid_from_advance - returned_to_accountant.
        Target zero - see TripSheetViewSet.approve_close, which won't let a
        trip through unbalanced without a recorded override reason."""
        return self.total_advance - self.expenses_paid_from_advance - (self.returned_amount or Decimal("0"))

    @property
    def is_reconciled(self):
        return self.reconciliation_variance == 0

    @property
    def reimbursement_due(self):
        return self.driver_own_expenses_total - (self.reimbursed_amount or Decimal("0"))

    def submit(self):
        self.status = TripSheetStatus.SUBMITTED
        self.save()

    def approve_close(self, override_reason=""):
        """Submitted -> closed, one step - finalizes and rolls the closing
        meter forward onto the vehicle (current_meter/meter_reading_date
        exist on Vehicle for exactly this). Replaces the old separate
        approve()/close() model methods.

        closing_meter is required here, not at Submit (see
        TripSheetViewSet.submit's docstring) - this model-level check is
        the defense-in-depth backstop behind TripSheetViewSet.approve_close's
        own check, same "checked at more than one layer" pattern the
        foolproof billing rules use elsewhere (see docs/SPEC.md §1)."""
        if self.closing_meter is None:
            raise ValueError("closing_meter must be set before a trip sheet can be approved & closed.")
        if override_reason:
            self.reconciliation_override_reason = override_reason
        self.status = TripSheetStatus.CLOSED
        self.save()
        if self.vehicle.current_meter is None or self.closing_meter > self.vehicle.current_meter:
            self.vehicle.current_meter = self.closing_meter
            self.vehicle.meter_reading_date = self.date
            self.vehicle.save()

    def retire(self, status=TripSheetStatus.CANCELLED):
        super().retire(status)

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.date}"


class TripLegLoadStatus(models.TextChoices):
    LOADED = "loaded", "Loaded"
    EMPTY = "empty", "Empty (deadhead)"


class TripLegBasis(models.TextChoices):
    PER_KM = "per_km", "Per km"
    PER_TON = "per_ton", "Per ton"
    PER_TRIP = "per_trip", "Per trip"
    PER_LOAD = "per_load", "Per load"
    FIXED = "fixed", "Fixed"


class TripLeg(BaseModel):
    """One haul within a trip sheet: pick up at `from_place`, drop at
    `to_place`, invoiced as `lr_number` (the lorry receipt), earning
    `freight_amount`. Only meaningful for a route-card trip
    (trip_sheet.card_type=='route', a km vehicle) - an hours vehicle
    (JCB/tractor/rig) still uses this model today with just freight_amount
    entered by hand; the richer loaded/empty accounting below is skipped for
    it entirely (see save()) until work items exist as their own model."""
    trip_sheet = models.ForeignKey(TripSheet, on_delete=models.PROTECT, related_name="legs")
    sequence = models.PositiveSmallIntegerField(default=1)
    from_place = models.CharField(max_length=120)
    to_place = models.CharField(max_length=120)
    consignor = models.CharField(max_length=120, blank=True)
    lr_number = models.CharField(max_length=40, blank=True)
    # Every leg says whether it carried a load or ran empty (blank/"" only on
    # rows predating this field) - required going forward for a route-card
    # trip, enforced in TripLegSerializer.validate(), not here. Only a loaded
    # leg bills; an empty leg is still tracked (distance_km) for the
    # empty-running rollup, but never has a customer/rate of its own.
    load_status = models.CharField(max_length=10, choices=TripLegLoadStatus.choices, blank=True)
    distance_km = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    customer = models.ForeignKey(
        "customers.Customer", null=True, blank=True, on_delete=models.PROTECT, related_name="trip_legs"
    )
    material = models.CharField(max_length=120, blank=True)
    tonnage = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    basis = models.CharField(max_length=10, choices=TripLegBasis.choices, blank=True)
    rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Computed in save() for a route-card leg (per_km -> rate*distance_km,
    # per_ton -> rate*tonnage, everything else -> rate flat; 0 for an empty
    # leg) - never hand-entered there. Left as a plain user-editable field
    # for an hours-vehicle trip, same as before this feature existed.
    freight_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    remarks = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["trip_sheet", "sequence"]

    def save(self, *args, **kwargs):
        if self.trip_sheet.card_type == "route" and self.load_status:
            if self.load_status == TripLegLoadStatus.EMPTY:
                self.customer = None
                self.material = ""
                self.tonnage = None
                self.basis = ""
                self.rate = None
                self.freight_amount = Decimal("0")
            elif self.basis and self.rate is not None:
                if self.basis == TripLegBasis.PER_KM and self.distance_km is not None:
                    self.freight_amount = self.rate * self.distance_km
                elif self.basis == TripLegBasis.PER_TON and self.tonnage is not None:
                    self.freight_amount = self.rate * self.tonnage
                else:
                    self.freight_amount = self.rate
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Leg {self.sequence}: {self.from_place} -> {self.to_place}"


class WorkItemBasis(models.TextChoices):
    PER_HOUR = "per_hour", "Per hour"
    PER_ACRE = "per_acre", "Per acre"
    PER_TRIP = "per_trip", "Per trip"
    PER_FEET = "per_feet", "Per feet"
    PER_BORE = "per_bore", "Per bore"
    FIXED = "fixed", "Fixed"


class WorkItem(BaseModel):
    """The work-card's line item - JCB/tractor equivalent of a route leg
    (`card_type=='work'` only, enforced in WorkItemSerializer.validate()).
    Unlike a leg, always billable - there's no "empty/deadhead" concept for
    a work item, so customer/basis/rate are required outright, not gated by
    a loaded/empty branch.

    per_bore is accepted as a basis here (flat qty*rate) - the real
    slab/casing/rock pricing override for a rig bore is a later phase, not
    this one."""
    trip_sheet = models.ForeignKey(TripSheet, on_delete=models.PROTECT, related_name="work_items")
    sequence = models.PositiveSmallIntegerField(default=1)
    site = models.CharField(max_length=120, blank=True)
    customer = models.ForeignKey(
        "customers.Customer", null=True, blank=True, on_delete=models.PROTECT, related_name="work_items"
    )
    work_type = models.CharField(max_length=120, blank=True)
    basis = models.CharField(max_length=10, choices=WorkItemBasis.choices, blank=True)
    qty = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Both optional, but required together (see WorkItemSerializer.validate) -
    # how much of qty was overtime, and what it's billed at. Explicit, not
    # derived from a guessed daily-hours threshold.
    overtime_qty = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    overtime_rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # A floor - if the computed amount comes in under this, it's billed at
    # this instead (e.g. a short job still costs a minimum call-out).
    min_billable = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Computed in save(): (qty - overtime_qty)*rate + overtime_qty*overtime_rate,
    # floored at min_billable - never hand-entered.
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    remarks = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["trip_sheet", "sequence"]

    def save(self, *args, **kwargs):
        if self.qty is not None and self.rate is not None:
            overtime_qty = self.overtime_qty or Decimal("0")
            overtime_rate = self.overtime_rate or Decimal("0")
            amount = (self.qty - overtime_qty) * self.rate + overtime_qty * overtime_rate
            if self.min_billable is not None and amount < self.min_billable:
                amount = self.min_billable
            self.amount = amount
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.trip_sheet} - {self.work_type or 'work item'} ({self.amount})"


class RouteRate(BaseModel):
    """Optional, separate rate master for route legs - a leg always stores
    its own rate snapshot regardless of whether this exists (see
    TripLeg.rate), so cards work with or without it. Resolution and the
    "remember" write-back both happen client-side (see
    frontend/src/lib/rateResolution.ts) - this is deliberately just a plain
    CRUD store, no backend matching logic.

    Dated (effective_date), not a single current value per route - a rate
    change shouldn't retroactively change what an old trip is understood to
    have billed at."""
    from_place = models.CharField(max_length=120)
    to_place = models.CharField(max_length=120)
    # null = a generic default for this route, regardless of customer -
    # overridden by a customer-specific row when one exists (see the
    # resolver). Same convention for `material` below.
    customer = models.ForeignKey(
        "customers.Customer", null=True, blank=True, on_delete=models.PROTECT, related_name="route_rates"
    )
    material = models.CharField(max_length=120, blank=True)
    basis = models.CharField(max_length=10, choices=TripLegBasis.choices)
    rate = models.DecimalField(max_digits=10, decimal_places=2)
    # Descriptive only (e.g. "one-way"/"round-trip") - not part of matching.
    load_pattern = models.CharField(max_length=40, blank=True)
    effective_date = models.DateField()

    class Meta:
        ordering = ["-effective_date"]

    def __str__(self):
        return f"{self.from_place} -> {self.to_place} ({self.rate}, from {self.effective_date})"


class WorkRate(BaseModel):
    """The work-item equivalent of RouteRate - same optional, dated,
    client-resolved design. Mirrors WorkItem's own billing fields exactly
    (rate/min_billable/overtime_rate); no flat/float add-on charge - WorkItem
    doesn't have one either (a later addition if ever needed)."""
    equipment = models.CharField(max_length=80, blank=True)
    work_type = models.CharField(max_length=120)
    customer = models.ForeignKey(
        "customers.Customer", null=True, blank=True, on_delete=models.PROTECT, related_name="work_rates"
    )
    basis = models.CharField(max_length=10, choices=WorkItemBasis.choices)
    rate = models.DecimalField(max_digits=10, decimal_places=2)
    min_billable = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    overtime_rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    effective_date = models.DateField()

    class Meta:
        ordering = ["-effective_date"]

    def __str__(self):
        return f"{self.work_type} ({self.rate}, from {self.effective_date})"


class FuelLogStatus(models.TextChoices):
    DRAFT = "draft", "Open"
    SUBMITTED = "submitted", "Submitted"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    # Not part of the Open->Submit->Approve/Reject review flow - this is
    # what the existing Retire button (RetireOnDestroyMixin) lands on
    # instead of the generic Status.INACTIVE default, same reason
    # TripSheet.retire() overrides to CANCELLED rather than leaving a
    # status value outside this field's own choices.
    CANCELLED = "cancelled", "Cancelled"


class FuelLog(BaseModel):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="fuel_logs")
    trip_sheet = models.ForeignKey(
        TripSheet, null=True, blank=True, on_delete=models.PROTECT, related_name="fuel_logs"
    )
    # Nullable at the DB level only so pre-existing rows (and any legacy
    # row with genuinely no way to know who it was for) don't break - every
    # new entry requires it via FuelLogSerializer.validate(), same
    # "nullable in the DB, required at the API layer" idiom TyreService.
    # billing already uses. Also fixes a latent gap for free:
    # operations.permissions._driver_id_for already checks this field
    # before falling back to trip_sheet.driver_id, so a standalone fuel
    # entry (no trip_sheet) is now correctly scoped to its own driver too.
    driver = models.ForeignKey(
        Driver, null=True, blank=True, on_delete=models.PROTECT, related_name="fuel_logs"
    )
    # Who physically filled the tank - the driver above, or a company person
    # doing it on their behalf. Free text rather than a second Driver/AppUser
    # FK, since either can fill it and the point is just that someone's
    # named and accountable for the litres entered, not that it's a formal
    # system account. Same "nullable in the DB, required via the serializer"
    # idiom as `driver` above.
    filled_by = models.CharField(max_length=120, blank=True)
    date = models.DateField()
    litres = models.DecimalField(max_digits=8, decimal_places=2)
    rate_per_litre = models.DecimalField(max_digits=8, decimal_places=2)
    amount = models.DecimalField(max_digits=10, decimal_places=2, blank=True)
    odometer = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    fuel_station = models.ForeignKey(
        "vendors.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="fuel_logs"
    )
    is_full_tank = models.BooleanField(default=True)

    # Open -> Submitted -> Approved/Rejected, terminal - same shape as
    # Expense.approval_status (economics/models.py), independent state
    # machine per entry regardless of whether it was typed in directly or
    # auto-posted from a trip's fuel expense (see operations.services.
    # _sync_fuel_log) - a source already validating its own billing isn't
    # a substitute for this sign-off, same reasoning applied to Expense.
    StatusChoices = FuelLogStatus
    status = models.CharField(max_length=10, choices=FuelLogStatus.choices, default=FuelLogStatus.DRAFT)
    approval_note = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-date"]

    def retire(self, status=FuelLogStatus.CANCELLED):
        super().retire(status)

    def save(self, *args, **kwargs):
        if not self.amount:
            self.amount = self.litres * self.rate_per_litre
        super().save(*args, **kwargs)
        # Posts to the fuel station's payable ledger too, kept in sync on
        # every save - see Expense.save() for the full reasoning and why
        # this import has to be local.
        from vendors.services import sync_bill

        sync_bill(self.fuel_station, self.date, self.amount, "Fuel log", "FuelLog", self.id)

    def __str__(self):
        return f"{self.vehicle.registration_number} - {self.litres}L on {self.date}"


class LedgerEntryType(models.TextChoices):
    ADVANCE = "advance", "Advance"
    WAGE = "wage", "Wage"
    BONUS = "bonus", "Bonus"
    DEDUCTION = "deduction", "Deduction"
    PAYMENT = "payment", "Payment"
    # Both credits (see frontend LEDGER_CREDIT_TYPES) - cash the driver hands
    # back reduces what they're holding, same direction as an earning, not a
    # second debit. Auto-created by TripSheet's settlement fields - see
    # operations.services.sync_advance_return_entry/sync_reimbursement_entry.
    ADVANCE_RETURN = "advance_return", "Advance returned"
    REIMBURSEMENT = "reimbursement", "Expense reimbursement"


class EarningSubtype(models.TextChoices):
    """Finer classification on a wage/bonus entry - all still credits."""
    SALARY = "salary", "Salary"
    BATA = "bata", "Bata / trip allowance"
    OVERTIME = "overtime", "Overtime"


class DeductionSubtype(models.TextChoices):
    DAMAGE = "damage", "Damage"
    PENALTY = "penalty", "Penalty"
    FUEL_SHORTAGE = "fuel_shortage", "Fuel shortage"


class PaymentMode(models.TextChoices):
    CASH = "cash", "Cash"
    BANK = "bank", "Bank transfer"
    UPI = "upi", "UPI"


class TripAdvance(BaseModel):
    """Cash handed to the driver for this trip - 1..n, top-ups allowed. Each
    advance immediately posts its own DriverLedgerEntry (a debit - see
    LedgerEntryType), same create-or-update-in-place sync as
    TripSheet.wage_entry, just one row per advance instead of one per trip."""
    trip_sheet = models.ForeignKey(TripSheet, on_delete=models.PROTECT, related_name="advances")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    given_by = models.CharField(max_length=120, blank=True)
    date = models.DateField()
    payment_mode = models.CharField(max_length=10, choices=PaymentMode.choices, blank=True)
    remarks = models.CharField(max_length=300, blank=True)
    ledger_entry = models.ForeignKey(
        "DriverLedgerEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.trip_sheet} - advance {self.amount} ({self.date})"


class TripExpensePaidFrom(models.TextChoices):
    ADVANCE = "advance", "From advance"
    COMPANY_DIRECT = "company_direct", "Company paid directly"
    DRIVER_OWN = "driver_own", "Driver's own money"


class TripExpense(BaseModel):
    """Every spend on the trip, 0..n - picked from Masters -> Expense
    (`economics.ExpenseHead`), never an untracked "other", so nothing about
    a trip's cash goes unaccounted for. paid_from decides how this feeds
    reconciliation: only `advance` counts against the cash handed over
    (TripSheet.reconciliation_variance); `company_direct` is a company cost
    excluded from that cash reconciliation; `driver_own` becomes a
    reimbursement owed to the driver (TripSheet.reimbursement_due).

    A vendor-linked expense also posts to that vendor's payable ledger and
    the vehicle's P&L, via a real FuelLog (expense_head.slug == "fuel") or
    economics.Expense (every other head) that this row keeps in sync - see
    operations.services.sync_trip_expense_posting."""
    trip_sheet = models.ForeignKey(TripSheet, on_delete=models.PROTECT, related_name="trip_expenses")
    expense_head = models.ForeignKey(
        "economics.ExpenseHead", on_delete=models.PROTECT, related_name="trip_expenses"
    )
    paid_from = models.CharField(max_length=20, choices=TripExpensePaidFrom.choices)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    vendor = models.ForeignKey(
        "vendors.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="trip_expenses"
    )
    # Only meaningful (and required, see TripExpenseSerializer) when
    # expense_head.slug == "fuel" - lets a fuel entry post a real FuelLog with
    # its own litres/rate tracking instead of a lump-sum cost.
    litres = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    rate_per_litre = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    notes = models.CharField(max_length=300, blank=True)
    date = models.DateField()
    # System-maintained links to whichever downstream record this expense
    # posted to (see sync_trip_expense_posting) - exactly one of these is
    # ever set, depending on expense_head.
    fuel_log = models.ForeignKey(
        "FuelLog", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    expense = models.ForeignKey(
        "economics.Expense", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-date", "-created_at"]

    def retire(self, status="inactive"):
        # Removing a trip expense shouldn't leave a ghost bill behind in the
        # vendor ledger / P&L - mirrors MaintenanceLog.retire()'s reversal.
        if self.fuel_log_id:
            self.fuel_log.retire()
        if self.expense_id:
            self.expense.retire()
        super().retire(status)

    def __str__(self):
        return f"{self.trip_sheet} - {self.expense_head.name} {self.amount} ({self.date})"


class DriverLedgerEntry(BaseModel):
    """Advances/wages/deductions against a driver. Linking to a trip sheet
    attributes the cost to that vehicle's P&L (see economics.pnl); leaving it
    blank means a company-level cost (e.g. a monthly salary run)."""
    driver = models.ForeignKey(Driver, on_delete=models.PROTECT, related_name="ledger_entries")
    trip_sheet = models.ForeignKey(
        TripSheet, null=True, blank=True, on_delete=models.PROTECT, related_name="ledger_entries"
    )
    date = models.DateField()
    entry_type = models.CharField(max_length=20, choices=LedgerEntryType.choices)
    # Holds an EarningSubtype value (wage/bonus) or a DeductionSubtype value
    # (deduction) depending on entry_type - not DB-enforced, the serializer/
    # UI scope which choices apply.
    subtype = models.CharField(max_length=20, blank=True)
    payment_mode = models.CharField(max_length=10, choices=PaymentMode.choices, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    remarks = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-date"]
        verbose_name_plural = "driver ledger entries"

    def __str__(self):
        return f"{self.driver} - {self.get_entry_type_display()} {self.amount} ({self.date})"
