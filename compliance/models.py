"""Compliance documents. Every RC/insurance/permit/licence-type record with an
expiry lives here as one `Document`, instead of a bespoke field per document
per master - so the reminder engine (and the dashboard) has a single place to
ask "what's due". Subclasses BaseModel, so it inherits tenancy, no-delete,
and audit automatically."""
from datetime import timedelta

from django.db import models, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

from core.models import BaseModel
from core.tenancy import get_current_tenant
from drivers.models import Driver
from vehicles.models import Vehicle


class DocumentStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ARCHIVED = "archived", "Archived"


class DocumentType(models.TextChoices):
    # vehicle documents
    RC = "rc", "Registration certificate"
    INSURANCE = "insurance", "Insurance"
    PERMIT = "permit", "Permit"
    NATIONAL_PERMIT = "national_permit", "National permit"
    FITNESS = "fitness", "Fitness certificate"
    PUC = "puc", "Pollution under control"
    ROAD_TAX = "road_tax", "Road tax"
    # driver documents
    LICENCE = "licence", "Driving licence"
    BADGE = "badge", "Badge"
    POLICE_VERIFICATION = "police_verification", "Police verification"
    MEDICAL_CERTIFICATE = "medical_certificate", "Medical certificate"
    # catch-all
    OTHER = "other", "Other"


class DocumentQuerySet(models.QuerySet):
    def with_expiry(self):
        return self.filter(valid_till__isnull=False)

    def current(self):
        """Excludes archived (renewed-over) rows - an old document's expiry
        shouldn't keep triggering reminders once a fresh one exists."""
        return self.exclude(status=DocumentStatus.ARCHIVED)

    def expired(self, as_of=None):
        as_of = as_of or timezone.localdate()
        return self.current().with_expiry().filter(valid_till__lt=as_of)

    def due(self, as_of=None):
        """Not yet expired, but inside its own reminder window."""
        as_of = as_of or timezone.localdate()
        due_ids = [
            doc.pk for doc in self.current().with_expiry().filter(valid_till__gte=as_of)
            if doc.valid_till <= as_of + timedelta(days=doc.reminder_days_before)
        ]
        return self.filter(pk__in=due_ids)

    def needs_attention(self, as_of=None):
        """Expired or due - what the dashboard/daily job surfaces."""
        as_of = as_of or timezone.localdate()
        return self.current().with_expiry().filter(
            valid_till__lt=as_of
        ) | self.due(as_of)


class DocumentManager(models.Manager.from_queryset(DocumentQuerySet)):
    """DocumentQuerySet's extra methods (due/expired/needs_attention), plus
    the same tenant auto-filtering every other BaseModel subclass's default
    manager gets - `DocumentQuerySet.as_manager()` alone would have skipped
    that (it doesn't inherit TenantManager), silently leaking every org's
    documents into every other org's queries."""

    def get_queryset(self):
        qs = super().get_queryset()
        org = get_current_tenant()
        if org is not None:
            qs = qs.filter(organization=org)
        return qs


class Document(BaseModel):
    vehicle = models.ForeignKey(
        Vehicle, null=True, blank=True, on_delete=models.PROTECT, related_name="documents"
    )
    driver = models.ForeignKey(
        Driver, null=True, blank=True, on_delete=models.PROTECT, related_name="documents"
    )

    doc_type = models.CharField(max_length=24, choices=DocumentType.choices)
    doc_number = models.CharField(max_length=60, blank=True)
    issue_date = models.DateField(null=True, blank=True)
    valid_till = models.DateField(null=True, blank=True)  # null = doesn't expire
    reminder_days_before = models.PositiveIntegerField(default=30)
    file = models.FileField(upload_to="compliance/", null=True, blank=True)
    notes = models.CharField(max_length=300, blank=True)

    objects = DocumentManager()
    all_objects = models.Manager.from_queryset(DocumentQuerySet)()

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(vehicle__isnull=False, driver__isnull=True)
                    | models.Q(vehicle__isnull=True, driver__isnull=False)
                ),
                name="document_belongs_to_exactly_one_holder",
            )
        ]
        ordering = ["valid_till"]

    @property
    def holder(self):
        return self.vehicle or self.driver

    @property
    def is_expired(self):
        return self.valid_till is not None and self.valid_till < timezone.localdate()

    @property
    def is_due(self):
        if self.valid_till is None or self.is_expired:
            return False
        return self.valid_till <= timezone.localdate() + timedelta(days=self.reminder_days_before)

    def renew(self, valid_till, doc_number=None, issue_date=None, reminder_days_before=None, notes=None):
        """Renewal writes a NEW Document row with the fresh number/dates and
        archives this one, atomically - the expiring record stays exactly as
        it was (still shows what it covered and until when) instead of being
        overwritten in place and losing that history. Any field left
        unspecified carries over from this document; `file` is deliberately
        never copied forward - a renewal gets its own fresh scan, if any."""
        # .create() doesn't coerce field values the way full_clean()/a
        # serializer would - a raw ISO string straight off request.data
        # would otherwise sit on the new in-memory instance untouched
        # until the next DB round-trip, breaking date comparisons
        # (is_expired/is_due) on the object this method hands back.
        if isinstance(valid_till, str):
            valid_till = parse_date(valid_till)
        if isinstance(issue_date, str):
            issue_date = parse_date(issue_date)

        with transaction.atomic():
            new_doc = Document.objects.create(
                vehicle=self.vehicle, driver=self.driver, doc_type=self.doc_type,
                doc_number=self.doc_number if doc_number is None else doc_number,
                issue_date=self.issue_date if issue_date is None else issue_date,
                valid_till=valid_till,
                reminder_days_before=(
                    self.reminder_days_before if reminder_days_before is None else reminder_days_before
                ),
                notes=self.notes if notes is None else notes,
            )
            self.retire(DocumentStatus.ARCHIVED, reason=f"Renewed as {new_doc.id}")
        return new_doc

    def __str__(self):
        return f"{self.get_doc_type_display()} - {self.holder} (till {self.valid_till or 'n/a'})"
