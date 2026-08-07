"""The daily job: surface every compliance document that's expired or about
to expire, across all organizations. Run via cron/scheduler:

    python manage.py check_compliance

For now this prints a report (foundation-level); wiring it to email/SMS/push
is a later layer's job - it can reuse `Document.objects.needs_attention()`.

Every run is recorded as a console.JobRun - both this CLI path and the
Developer dashboard's "Run now" button (console.views.TriggerJobView, which
invokes this same command via call_command) write to that one history
table. --triggered-by-id is for that button's internal use (a superuser's
id); left unset for cron/CLI runs.
"""
from django.core.management.base import BaseCommand

from compliance.models import Document


class Command(BaseCommand):
    help = "Report compliance documents that are expired or due for renewal."

    def add_arguments(self, parser):
        parser.add_argument(
            "--triggered-by-id", default=None,
            help="Id of the superuser who triggered this run from the console (internal use).",
        )

    def handle(self, *args, **options):
        from console.models import JobRun, JobStatus

        job_run = JobRun.objects.create(
            job_name="check_compliance", triggered_by_id=options.get("triggered_by_id"),
        )
        try:
            summary = self._run(job_run)
        except Exception as exc:
            job_run.finish(JobStatus.FAILED, summary=str(exc))
            raise
        job_run.finish(JobStatus.SUCCESS, summary=summary)

    def _run(self, job_run):
        due = (
            Document.all_objects
            .select_related("organization", "vehicle", "driver")
            .needs_attention()
            .order_by("organization_id", "valid_till")
        )

        if not due.exists():
            self.stdout.write(self.style.SUCCESS("Nothing due."))
            return "Nothing due."

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

        summary = f"{due.count()} document(s) need attention."
        self.stdout.write(f"\n{summary}")
        return summary
