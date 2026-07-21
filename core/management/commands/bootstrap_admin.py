"""Idempotent superuser bootstrap for hosted environments where an
interactive `createsuperuser` shell isn't reliably available (e.g. Render's
Shell tab). Safe to run on every deploy: does nothing if the user exists."""
import os

from django.core.management.base import BaseCommand

from core.models import User


class Command(BaseCommand):
    help = "Create the initial admin user if it doesn't already exist."

    def handle(self, *args, **options):
        username = os.environ.get("DJANGO_SUPERUSER_USERNAME", "developer")
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "developer@fleet.local")
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "DevFleet2026!")

        if User.objects.filter(username=username).exists():
            self.stdout.write(f"User '{username}' already exists - skipping.")
            return

        User.objects.create_superuser(username=username, email=email, password=password)
        self.stdout.write(self.style.SUCCESS(f"Created superuser '{username}'."))
