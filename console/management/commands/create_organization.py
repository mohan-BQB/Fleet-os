"""Onboard a new customer from the command line - usable the moment this
app's migrations are deployed, without waiting on the Control Center UI.
Shares its logic with OrganizationViewSet.create via console.services, so
there is exactly one implementation of "what it means to onboard an org".

    python manage.py create_organization --org-name "Acme Logistics" \\
        --owner-username acme-owner --owner-email owner@acme.example \\
        --owner-password 'a-strong-password' \\
        --disable-modules tyres,economics
"""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.management.base import BaseCommand, CommandError

from console.services import create_organization


class Command(BaseCommand):
    help = "Create a new organization with its first Owner account."

    def add_arguments(self, parser):
        parser.add_argument("--org-name", required=True)
        parser.add_argument("--owner-username", required=True)
        parser.add_argument("--owner-email", required=True)
        parser.add_argument("--owner-password", required=True)
        parser.add_argument(
            "--disable-modules", default="",
            help="Comma-separated OPTIONAL_MODULES keys to disable (default: none, everything on).",
        )

    def handle(self, *args, **options):
        try:
            validate_password(options["owner_password"])
        except DjangoValidationError as exc:
            raise CommandError("\n".join(exc.messages))

        disabled_modules = [m.strip() for m in options["disable_modules"].split(",") if m.strip()]

        org = create_organization(
            name=options["org_name"],
            owner_username=options["owner_username"],
            owner_email=options["owner_email"],
            owner_password=options["owner_password"],
            disabled_modules=disabled_modules,
        )
        self.stdout.write(self.style.SUCCESS(
            f"Created organization '{org.name}' ({org.id}) with owner '{options['owner_username']}'."
        ))
