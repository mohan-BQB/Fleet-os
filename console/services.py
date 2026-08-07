"""Shared org-onboarding logic. Used by both OrganizationViewSet.create (the
Control Center UI) and the create_organization management command (usable
the moment this is deployed, before the UI exists) - one implementation of
"what it means to onboard an organization", not two that can drift."""
from django.db import transaction

from core.audit import record_audit
from core.models import AuditAction, Organization, Role, User


@transaction.atomic
def create_organization(*, name, owner_username, owner_email, owner_password, disabled_modules=None):
    org = Organization.objects.create(name=name, disabled_modules=disabled_modules or [])
    record_audit(org, AuditAction.CREATE)

    User.objects.create_user(
        username=owner_username,
        email=owner_email,
        password=owner_password,
        organization=org,
        role=Role.OWNER,
    )

    return org
