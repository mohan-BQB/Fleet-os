from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ApiKeyViewSet, JobRunViewSet, OrganizationViewSet, StopImpersonationView, SystemHealthView,
    TriggerJobView,
)

router = DefaultRouter()
router.register("organizations", OrganizationViewSet, basename="console-organization")
router.register("api-keys", ApiKeyViewSet, basename="console-api-key")
router.register("job-runs", JobRunViewSet, basename="console-job-run")

urlpatterns = [
    path("system-health/", SystemHealthView.as_view(), name="console-system-health"),
    path("jobs/check-compliance/trigger/", TriggerJobView.as_view(), name="console-trigger-job"),
    path("stop-impersonation/", StopImpersonationView.as_view(), name="console-stop-impersonation"),
] + router.urls
