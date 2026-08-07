from rest_framework.routers import DefaultRouter

from .views import CustomerLedgerEntryViewSet, CustomerViewSet

router = DefaultRouter()
router.register("customers", CustomerViewSet, basename="customer")
router.register("customer-ledger-entries", CustomerLedgerEntryViewSet, basename="customer-ledger-entry")

urlpatterns = router.urls
