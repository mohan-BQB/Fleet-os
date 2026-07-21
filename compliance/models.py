"""Compliance documents. Every RC/insurance/permit/licence-type record with an
expiry lives here as one `Document`, instead of a bespoke field per document
per master - so the reminder engine (and the dashboard) has a single place to
ask "what's due". Subclasses BaseModel, so it inherits tenancy, no-delete,
and audit automatically."""
from datetime import timedelta

from django.db import models
from django.utils import timezone

from core.models import BaseModel
from drivers.models import Driver
from vehicles.models import Vehicle


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

    def expired(self, as_of=None):
        as_of = as_of or timezone.localdate()
        return self.with_expiry().filter(valid_till__lt=as_of)

    def due(self, as_of=None):
        """Not yet expired, but inside its own reminder window."""
        as_of = as_of or timezone.localdate()
        due_ids = [
            doc.pk for doc in self.with_expiry().filter(valid_till__gte=as_of)
            if doc.valid_till <= as_of + timedelta(days=doc.reminder_days_before)
        ]
        return self.filter(pk__in=due_ids)

    def needs_attention(self, as_of=None):
        """Expired or due - what the dashboard/daily job surfaces."""
        as_of = as_of or timezone.localdate()
        return self.with_expiry().filter(
            valid_till__lt=as_of
        ) | self.due(as_of)


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

    objects = DocumentQuerySet.as_manager()
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

    def __str__(self):
        return f"{self.get_doc_type_display()} - {self.holder} (till {self.valid_till or 'n/a'})"
