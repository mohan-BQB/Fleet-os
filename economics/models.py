"""Costs that aren't fuel or driver wages (those live in `operations`) -
maintenance, tyres, toll, permits, insurance premiums. Feeds per-vehicle P&L
in pnl.py. A blank `vehicle` is a company-level overhead cost: it shows up in
the dashboard-wide P&L but isn't attributed to any single vehicle."""
from django.db import models

from core.models import BaseModel
from vehicles.models import Vehicle

from .expense_heads import LOAD, REPAIRS, RUNNING, TYRE_SERVICE


class ExpenseHeadGroup(models.TextChoices):
    RUNNING = RUNNING, "Running"
    LOAD = LOAD, "Load"
    TYRE_SERVICE = TYRE_SERVICE, "Tyre service"
    REPAIRS = REPAIRS, "Repairs"


class ExpenseHead(BaseModel):
    """The pick-list trip/work cards and maintenance draw from. One-time
    entry - name + group only, no active/inactive toggle unlike every other
    master here (confirmed with the business: these get added to, never
    retired). Hard delete is still disabled via BaseModel like everything
    else; there's just no status control in front of it either."""
    name = models.CharField(max_length=60)
    group = models.CharField(max_length=20, choices=ExpenseHeadGroup.choices)
    slug = models.SlugField(max_length=60)

    class Meta:
        ordering = ["group", "name"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "slug"], name="unique_expense_head_slug_per_org"),
        ]

    def __str__(self):
        return self.name


class ExpenseSourceType(models.TextChoices):
    """Granular enough to tell apart the two Tyre Service syncs and the two
    Maintenance Log syncs - each is an independent posting with its own
    vendor/amount, not one combined row (see tyres.serializers._sync_expense
    vs _sync_tyre_expense, maintenance.serializers._sync_expense vs
    _sync_part_expense)."""
    TRIP_EXPENSE = "trip_expense", "Trip expense"
    TYRE_SERVICE_LABOUR = "tyre_service_labour", "Tyre service — labour"
    TYRE_PURCHASE = "tyre_purchase", "Tyre service — new tyre purchase"
    MAINTENANCE_LABOUR = "maintenance_labour", "Maintenance — labour"
    MAINTENANCE_PART = "maintenance_part", "Maintenance — new part purchase"
    PARTS_RECEIPT = "parts_receipt", "Parts inventory — receipt"


class ExpenseApprovalStatus(models.TextChoices):
    """Separate from BaseModel.status (the inherited active/inactive retire
    flag) and from source_type - a third, independent dimension. A row can
    be a locked history row (source_type set) AND still pending approval;
    the two checks don't interact."""
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class Expense(BaseModel):
    vehicle = models.ForeignKey(
        Vehicle, null=True, blank=True, on_delete=models.PROTECT, related_name="expenses"
    )
    expense_head = models.ForeignKey(
        ExpenseHead, on_delete=models.PROTECT, related_name="expenses"
    )
    date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    vendor = models.ForeignKey(
        "vendors.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="expenses"
    )
    # A one-off payee not in the Vendor master - same mutually-exclusive-
    # with-vendor idiom as MaintenanceLog/TyreService/PartStockMovement's own
    # unlisted_vendor_name (enforced in ExpenseSerializer.validate(), not
    # here, matching how those three enforce it in their own serializers).
    # Unlike those three, this one's on Expense directly - a direct entry
    # has no separate source record to hold it on.
    unlisted_vendor_name = models.CharField(max_length=120, blank=True)
    notes = models.CharField(max_length=300, blank=True)
    receipt = models.FileField(upload_to="expenses/", null=True, blank=True)

    # Only meaningful/used when vendor is None: a vendored expense's
    # paid/pending state is always derived from the vendor ledger (see
    # vendors.services.is_paid) - the actual source of truth there, so these
    # stay unused for that case. But a one-off payee named only in a
    # `notes`/`unlisted_vendor_name` field on the record that created this
    # (MaintenanceLog, TyreService, PartStockMovement) has no ledger to post
    # a bill against - without a place to record "not paid yet" for THAT
    # case, ExpenseSerializer.get_is_paid used to just return None
    # ("not applicable") forever, and mark_paid refused to run at all
    # without a vendor - so a bill to a named outside person could never be
    # marked paid, full stop, regardless of whether it actually was.
    paid = models.BooleanField(default=False)
    payment_mode = models.CharField(max_length=10, blank=True)
    paid_date = models.DateField(null=True, blank=True)

    # Where this row actually came from. Blank = typed in directly here, and
    # editable like any other master record. Set = mirrored from whichever
    # operational record created it (see ExpenseSourceType) - that record is
    # the source of truth, so this row is display/history only; editing it
    # here would just be overwritten on the source's next save (see e.g.
    # tyres.serializers.TyreServiceSerializer._sync_expense). Enforced at
    # the serializer layer (ExpenseSerializer.validate), not here, so the
    # six sync services can still write to these rows directly.
    # Replaces get_source()'s reverse-FK scan (economics/serializers.py)
    # with a direct field read - same one-of-two-columns idiom
    # vendors.VendorLedgerEntry.source_model/source_id already uses.
    source_type = models.CharField(max_length=30, choices=ExpenseSourceType.choices, blank=True)
    source_id = models.UUIDField(null=True, blank=True)

    # Every expense - direct entry or system-posted alike - starts pending
    # and needs an explicit sign-off (see economics.views.ExpenseViewSet.
    # approve/reject). A source record's own billing validation isn't a
    # substitute for this - it's a separate, later gate, same as a trip
    # sheet's Submit doesn't imply Approve & Close. Terminal once decided -
    # no un-approve/un-reject path, matching TripSheet's closed state.
    approval_status = models.CharField(
        max_length=10, choices=ExpenseApprovalStatus.choices, default=ExpenseApprovalStatus.PENDING,
    )
    # Optional on approve, required on reject (enforced in the view, not
    # here - see ExpenseViewSet.reject) - one field for both since only one
    # is ever set per row.
    approval_note = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-date"]
        constraints = [
            # A source record posts to exactly one Expense row - mirrors
            # TripSheet's unique_trip_no_per_org partial-constraint idiom
            # (operations/models.py) for the same "blank doesn't collide"
            # reason: rows with no source (direct entries) are all blank/
            # blank and must not be treated as duplicates of each other.
            models.UniqueConstraint(
                fields=["source_type", "source_id"],
                condition=~models.Q(source_type=""),
                name="unique_expense_source",
            ),
        ]
        indexes = [
            # What every P&L/report query filters on (economics/pnl.py,
            # Reports.tsx) - Expense had no indexes beyond the implicit
            # per-FK ones before this.
            models.Index(fields=["organization", "date"], name="expense_org_date_idx"),
        ]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # A vendor-billed expense posts to that vendor's payable ledger too,
        # kept in sync on every save (not just creation) so adding a vendor
        # or correcting the amount on an edit actually reaches the ledger -
        # imported locally to avoid an economics <-> vendors import cycle,
        # same convention core.models uses for audit.
        from vendors.services import sync_bill

        sync_bill(
            self.vendor, self.date, self.amount, f"Expense — {self.expense_head.name}",
            "Expense", self.id,
        )

    def __str__(self):
        holder = self.vehicle.registration_number if self.vehicle else "Company"
        return f"{holder} - {self.expense_head.name} {self.amount} ({self.date})"
