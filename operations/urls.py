from rest_framework.routers import DefaultRouter

from .views import DriverLedgerEntryViewSet, FuelLogViewSet, TripLegViewSet, TripSheetViewSet

router = DefaultRouter()
router.register("trip-sheets", TripSheetViewSet, basename="trip-sheet")
router.register("legs", TripLegViewSet, basename="trip-leg")
router.register("fuel-logs", FuelLogViewSet, basename="fuel-log")
router.register("ledger-entries", DriverLedgerEntryViewSet, basename="ledger-entry")

urlpatterns = router.urls
