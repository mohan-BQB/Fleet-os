from rest_framework.routers import DefaultRouter

from .views import MaintenanceLogViewSet, MaintenanceScheduleViewSet

router = DefaultRouter()
router.register("schedules", MaintenanceScheduleViewSet, basename="maintenance-schedule")
router.register("logs", MaintenanceLogViewSet, basename="maintenance-log")

urlpatterns = router.urls
