from rest_framework.routers import DefaultRouter

from .views import VendorLedgerEntryViewSet, VendorViewSet

router = DefaultRouter()
router.register("vendors", VendorViewSet, basename="vendor")
router.register("vendor-ledger-entries", VendorLedgerEntryViewSet, basename="vendor-ledger-entry")

urlpatterns = router.urls
