"""Platform-level operations data: API keys and background-job run history.
Neither is tenant-scoped data (they don't subclass core.models.BaseModel) -
an ApiKey may be platform-wide, and a JobRun spans all organizations."""
import hashlib
import secrets
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class ApiKey(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "core.Organization", null=True, blank=True,
        on_delete=models.CASCADE, related_name="api_keys",
    )
    name = models.CharField(max_length=200)
    prefix = models.CharField(max_length=12, editable=False)
    hashed_key = models.CharField(max_length=128, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.name} ({self.prefix}...)"

    @classmethod
    def generate(cls, *, name, organization=None, created_by=None):
        """Returns (instance, raw_key). The raw key is never stored - only
        its hash - so it can only ever be shown to the caller once, here."""
        raw_key = secrets.token_urlsafe(32)
        prefix = raw_key[:8]
        instance = cls.objects.create(
            name=name,
            organization=organization,
            created_by=created_by,
            prefix=prefix,
            hashed_key=hashlib.sha256(raw_key.encode()).hexdigest(),
        )
        return instance, raw_key


class JobStatus(models.TextChoices):
    RUNNING = "running", "Running"
    SUCCESS = "success", "Success"
    FAILED = "failed", "Failed"


class JobRun(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job_name = models.CharField(max_length=100)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=JobStatus.choices, default=JobStatus.RUNNING)
    summary = models.TextField(blank=True)
    # null = triggered by cron/CLI rather than a superuser clicking "Run now".
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.job_name} ({self.status})"

    def finish(self, status, summary=""):
        self.status = status
        self.summary = summary
        self.finished_at = timezone.now()
        self.save(update_fields=["status", "summary", "finished_at"])
