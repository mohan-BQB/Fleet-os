"""Audit helper. Called from BaseModel.save() to append an AuditLog row."""
from .tenancy import get_current_tenant, get_current_user


def record_audit(instance, action, changes=None):
    # Imported here to avoid a circular import with models.
    from .models import AuditLog

    # Skip no-op updates (nothing actually changed).
    if action == "update" and not changes:
        return

    organization = getattr(instance, "organization", None) or get_current_tenant()
    AuditLog.objects.create(
        organization=organization,
        user=get_current_user(),
        action=action,
        model_name=type(instance).__name__,
        object_id=str(instance.pk),
        changes=changes or {},
    )
