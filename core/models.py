"""Foundation data model.

Implements the cross-cutting rules from the spec:
  * Multi-tenancy      - every record carries an `organization`; the default
                         manager auto-filters by the current tenant.
  * No hard delete     - `BaseModel.delete()` is disabled; records are retired
                         via a status change instead.
  * Audit history      - every create/update writes an immutable AuditLog row
                         capturing who, when, and before -> after.
"""
import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models

from .tenancy import get_current_tenant, get_current_user


# ---------------------------------------------------------------------------
# Tenant + identity
# ---------------------------------------------------------------------------
class Organization(models.Model):
    """A tenant: one company that signs up. All data is scoped to it."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Role(models.TextChoices):
    OWNER = "owner", "Owner"
    ADMIN = "admin", "Admin"
    MANAGER = "manager", "Fleet manager"
    DRIVER = "driver", "Driver"
    ACCOUNTANT = "accountant", "Accountant"


class User(AbstractUser):
    """Custom user. Login is the email; every user belongs to one organization.

    Deactivated (is_active=False) rather than deleted, so historical records
    stay attributable.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, null=True, blank=True,
        on_delete=models.PROTECT, related_name="users",
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MANAGER)
    # A driver login is linked to their Driver master record (set once that
    # app exists); kept nullable here in the foundation.
    driver_id = models.UUIDField(null=True, blank=True)

    def __str__(self):
        return f"{self.get_username()} ({self.role})"


# ---------------------------------------------------------------------------
# Tenant-scoped base model (no-delete + audit + auto-stamping)
# ---------------------------------------------------------------------------
class Status(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class TenantManager(models.Manager):
    """Default manager: transparently filters to the current tenant."""

    def get_queryset(self):
        qs = super().get_queryset()
        org = get_current_tenant()
        if org is not None:
            qs = qs.filter(organization=org)
        return qs


class BaseModel(models.Model):
    """Base for every tenant-scoped master/record."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.PROTECT, related_name="+"
    )
    # Generic lifecycle status. Subclasses define their own allowed values via a
    # `StatusChoices` (e.g. Vehicle -> sold/scrapped, Driver -> relieved); the
    # column itself stays generic so any of them can be stored.
    status = models.CharField(max_length=20, default="active")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.PROTECT, related_name="+",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.PROTECT, related_name="+",
    )

    objects = TenantManager()      # tenant-scoped
    all_objects = models.Manager()  # unscoped (admin / migrations)

    class Meta:
        abstract = True

    # -- no hard delete -----------------------------------------------------
    def delete(self, *args, **kwargs):
        raise PermissionError(
            "Hard delete is disabled. Use retire() to change status instead."
        )

    def retire(self, status=Status.INACTIVE):
        """Soft-retire: subclasses may override with domain statuses
        (e.g. a vehicle -> 'sold', a driver -> 'relieved')."""
        self.status = status
        self.save()

    # -- auto-stamp tenant/user + write audit on save -----------------------
    def save(self, *args, **kwargs):
        from .audit import record_audit

        is_new = self._state.adding
        org = get_current_tenant()
        user = get_current_user()

        if self.organization_id is None and org is not None:
            self.organization = org
        if is_new and self.created_by_id is None and user is not None:
            self.created_by = user
        if user is not None:
            self.updated_by = user

        changes = {} if is_new else self._diff_from_db()
        super().save(*args, **kwargs)
        record_audit(self, "create" if is_new else "update", changes)

    def _diff_from_db(self):
        """Return {field: [old, new]} for changed fields (for the audit log)."""
        try:
            old = type(self).all_objects.get(pk=self.pk)
        except type(self).DoesNotExist:
            return {}
        skip = {"updated_at", "updated_by"}
        changes = {}
        for field in self._meta.fields:
            if field.name in skip:
                continue
            old_v = getattr(old, field.attname)
            new_v = getattr(self, field.attname)
            if old_v != new_v:
                changes[field.name] = [_str(old_v), _str(new_v)]
        return changes


def _str(value):
    return "" if value is None else str(value)


# ---------------------------------------------------------------------------
# Company profile (one per organization)
# ---------------------------------------------------------------------------
class CompanyProfile(models.Model):
    """The tenant's own details. Editing (incl. the logo) is admin-only,
    enforced at the API layer (see permissions.py)."""
    organization = models.OneToOneField(
        Organization, on_delete=models.PROTECT, related_name="profile"
    )
    legal_name = models.CharField(max_length=200)
    entity_type = models.CharField(max_length=40, blank=True)
    logo = models.ImageField(upload_to="logos/", null=True, blank=True)
    gstin = models.CharField(max_length=20, blank=True)
    pan = models.CharField(max_length=12, blank=True)
    tan = models.CharField(max_length=12, blank=True)
    address = models.CharField(max_length=300, blank=True)
    city = models.CharField(max_length=80, blank=True)
    state = models.CharField(max_length=80, blank=True)
    pin = models.CharField(max_length=10, blank=True)
    fy_start_month = models.PositiveSmallIntegerField(default=4)  # April
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.legal_name


# ---------------------------------------------------------------------------
# Immutable audit log
# ---------------------------------------------------------------------------
class AuditAction(models.TextChoices):
    CREATE = "create", "Create"
    UPDATE = "update", "Update"
    RETIRE = "retire", "Retire"
    LOGIN = "login", "Login"


class AuditLog(models.Model):
    """Append-only record of every change. Never updated or deleted."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, null=True, on_delete=models.PROTECT, related_name="audit_logs"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+"
    )
    action = models.CharField(max_length=20, choices=AuditAction.choices)
    model_name = models.CharField(max_length=80)
    object_id = models.CharField(max_length=64)
    changes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "model_name", "object_id"]),
            models.Index(fields=["organization", "user", "created_at"]),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise PermissionError("Audit log entries are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Audit log entries cannot be deleted.")

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.action} {self.model_name} {self.object_id}"
