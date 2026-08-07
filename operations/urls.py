from rest_framework.routers import DefaultRouter

from .views import (
    DriverLedgerEntryViewSet, FuelLogViewSet, RouteRateViewSet, TripAdvanceViewSet, TripExpenseViewSet,
    TripLegViewSet, TripSheetViewSet, WorkItemViewSet, WorkRateViewSet,
)

router = DefaultRouter()
router.register("trip-sheets", TripSheetViewSet, basename="trip-sheet")
router.register("legs", TripLegViewSet, basename="trip-leg")
router.register("work-items", WorkItemViewSet, basename="work-item")
router.register("route-rates", RouteRateViewSet, basename="route-rate")
router.register("work-rates", WorkRateViewSet, basename="work-rate")
router.register("trip-advances", TripAdvanceViewSet, basename="trip-advance")
router.register("trip-expenses", TripExpenseViewSet, basename="trip-expense")
router.register("fuel-logs", FuelLogViewSet, basename="fuel-log")
router.register("ledger-entries", DriverLedgerEntryViewSet, basename="ledger-entry")

urlpatterns = router.urls
