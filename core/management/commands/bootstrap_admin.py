"""Idempotent superuser bootstrap for hosted environments where an
interactive `createsuperuser` shell isn't reliably available (e.g. Render's
Shell tab). Safe to run on every deploy: does nothing if the user already
has everything it needs.

Also ensures that user belongs to an Organization with role=Owner - a
Django superuser is a Django-admin concept only (see core.permissions.can,
which checks `role`, not is_superuser), and every BaseModel subclass
requires an organization to save at all. Without this, the very first write
through the app 500s on a NOT NULL constraint."""
import os

from django.core.management.base import BaseCommand

from core.models import Organization, Role, User


class Command(BaseCommand):
    help = "Create (or fix up) the initial admin user, with an organization and Owner role."

    def handle(self, *args, **options):
        username = os.environ.get("DJANGO_SUPERUSER_USERNAME", "developer")
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "developer@fleet.local")
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "DevFleet2026!")
        org_name = os.environ.get("DJANGO_SUPERUSER_ORG", "Demo Fleet Co")

        org, _ = Organization.objects.get_or_create(name=org_name)

        user = User.objects.filter(username=username).first()
        if user is not None:
            changed = []
            if user.organization_id is None:
                user.organization = org
                changed.append("organization")
            if user.role != Role.OWNER:
                user.role = Role.OWNER
                changed.append("role")
            if changed:
                user.save()
                self.stdout.write(self.style.SUCCESS(f"Updated '{username}': set {', '.join(changed)}."))
            else:
                self.stdout.write(f"User '{username}' already fully set up - skipping.")
            return

        User.objects.create_superuser(
            username=username, email=email, password=password, organization=org, role=Role.OWNER,
        )
        self.stdout.write(self.style.SUCCESS(f"Created superuser '{username}' in org '{org_name}'."))
