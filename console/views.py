"""Superuser-only platform operations: org onboarding/suspension, "view as
org" impersonation, cross-tenant health, API keys, and job run history.
Nothing here is tenant-scoped - every queryset is deliberately cross-org."""
from django.contrib.auth import login
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.audit import record_audit
from core.models import AuditAction, AuditLog, Organization, Role, User
from core.serializers import AuditLogSerializer
from core.tenancy import set_current_user

from .models import ApiKey, JobRun
from .permissions import IsSuperuser
from .serializers import (
    ApiKeySerializer, JobRunSerializer, OrganizationAdminSerializer, OrganizationCreateSerializer,
)


class OrganizationViewSet(viewsets.ModelViewSet):
    """No destroy - matches the no-hard-delete ethos elsewhere in the app;
    is_active toggle via PATCH covers suspend/reactivate instead."""
    queryset = Organization.objects.all().order_by("-created_at")
    permission_classes = [IsSuperuser]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return OrganizationCreateSerializer
        return OrganizationAdminSerializer

    @action(detail=True, methods=["post"])
    def impersonate(self, request, pk=None):
        org = self.get_object()
        target = User.objects.filter(
            organization=org, role=Role.OWNER, is_active=True,
        ).first()
        if target is None:
            raise ValidationError("This organization has no active Owner account to impersonate.")
        if "impersonator_id" in request.session:
            raise ValidationError("Already impersonating - exit that session first.")

        impersonator = request.user
        login(request, target)
        # Set AFTER login() - login() flushes the session, which would wipe
        # this if set before. get_current_user() (used by record_audit
        # below) still returns the superuser here: CurrentTenantMiddleware
        # set that thread-local once at the start of this request, before
        # login() touched request.user, so no explicit set_current_user
        # call is needed for this direction (unlike StopImpersonationView).
        request.session["impersonator_id"] = str(impersonator.id)
        record_audit(target, AuditAction.IMPERSONATE_START)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SystemHealthView(APIView):
    """Cross-org counts + recent audit activity for the Developer dashboard."""
    permission_classes = [IsSuperuser]

    def get(self, request):
        from drivers.models import Driver
        from vehicles.models import Vehicle

        recent_audit = AuditLog.objects.select_related("user", "organization")[:25]
        return Response({
            "organization_count": Organization.objects.count(),
            "active_organization_count": Organization.objects.filter(is_active=True).count(),
            "user_count": User.objects.count(),
            "vehicle_count": Vehicle.all_objects.count(),
            "driver_count": Driver.all_objects.count(),
            "recent_audit_log": [
                {
                    **AuditLogSerializer(entry).data,
                    "organization_name": entry.organization.name if entry.organization else None,
                }
                for entry in recent_audit
            ],
        })


class ApiKeyViewSet(viewsets.ModelViewSet):
    queryset = ApiKey.objects.filter(revoked_at__isnull=True).order_by("-created_at")
    serializer_class = ApiKeySerializer
    permission_classes = [IsSuperuser]
    http_method_names = ["get", "post", "head", "options"]

    def perform_create(self, serializer):
        # Bypasses serializer.save(): the raw key only ever exists in memory,
        # right here, long enough to put it on this one response - it's
        # never written to the DB (only its hash is, via ApiKey.generate).
        instance, raw_key = ApiKey.generate(
            name=serializer.validated_data["name"],
            organization=serializer.validated_data.get("organization"),
            created_by=self.request.user,
        )
        instance._raw_key = raw_key
        serializer.instance = instance

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        key = self.get_object()
        key.revoked_at = timezone.now()
        key.save(update_fields=["revoked_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class JobRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = JobRun.objects.all()
    serializer_class = JobRunSerializer
    permission_classes = [IsSuperuser]


class TriggerJobView(APIView):
    """Runs check_compliance synchronously. JobRun bookkeeping (create at
    start, success/failed at end) lives inside the management command
    itself (see compliance/management/commands/check_compliance.py), so the
    CLI/cron path and this button write to the exact same history table."""
    permission_classes = [IsSuperuser]

    def post(self, request):
        try:
            call_command("check_compliance", triggered_by_id=str(request.user.id))
        except Exception:
            # Already recorded as failed on the JobRun row by the command
            # itself - surface that row instead of a raw 500.
            pass
        job_run = JobRun.objects.filter(job_name="check_compliance").first()
        return Response(JobRunSerializer(job_run).data)


class StopImpersonationView(APIView):
    """Deliberately NOT IsSuperuser - by the time this runs, request.user IS
    the impersonated org owner. Authorization here is the presence of
    impersonator_id in the session, set by OrganizationViewSet.impersonate."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        impersonator_id = request.session.get("impersonator_id")
        if not impersonator_id:
            raise ValidationError("Not currently impersonating.")

        impersonated_user = request.user
        impersonator = User.objects.get(pk=impersonator_id)
        login(request, impersonator)
        # CurrentTenantMiddleware set the thread-local from request.user as
        # it was at the START of this request (the impersonated owner);
        # login() above only swapped request.user, so the thread-local still
        # says "impersonated owner" unless corrected here - otherwise
        # record_audit below would misattribute IMPERSONATE_STOP to the
        # owner being exited rather than the superuser exiting.
        set_current_user(impersonator)
        record_audit(impersonated_user, AuditAction.IMPERSONATE_STOP)
        return Response(status=status.HTTP_204_NO_CONTENT)
