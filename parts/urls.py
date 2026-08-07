from rest_framework.routers import DefaultRouter

from .views import PartInventoryItemViewSet, PartStockMovementViewSet

router = DefaultRouter()
router.register("inventory-items", PartInventoryItemViewSet, basename="part-inventory-item")
router.register("stock-movements", PartStockMovementViewSet, basename="part-stock-movement")

urlpatterns = router.urls
