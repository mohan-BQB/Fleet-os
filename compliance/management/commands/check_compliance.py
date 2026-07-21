"""The daily job: surface every compliance document that's expired or about
to expire, across all organizations. Run via cron/scheduler:

    python manage.py check_compliance

For now this prints a report (foundation-level); wiring it to email/SMS/push
is a later layer's job - it can reuse `Document.objects.needs_attention()`.
"""
from django.core.management.base import BaseCommand

from compliance.models import Document


class Command(BaseCommand):
    help = "Report compliance documents that are expired or due for renewal."

    def handle(self, *args, **options):
        due = (
            Document.all_objects
            .select_related("organization", "vehicle", "driver")
            .needs_attention()
            .order_by("organization_id", "valid_till")
        )

        if not due.exists():
            self.stdout.write(self.style.SUCCESS("Nothing due."))
            return

        current_org = None
        for doc in due:
            if doc.organization_id != current_org:
                current_org = doc.organization_id
                self.stdout.write(self.style.MIGRATE_HEADING(str(doc.organization)))
            label = self.style.ERROR("EXPIRED") if doc.is_expired else self.style.WARNING("DUE")
            self.stdout.write(
                f"  [{label}] {doc.get_doc_type_display()} - {doc.holder} "
                f"(valid till {doc.valid_till})"
            )

        self.stdout.write(f"\n{due.count()} document(s) need attention.")
