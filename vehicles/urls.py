from rest_framework.routers import DefaultRouter

from .views import VehicleLoanInstallmentViewSet, VehicleLoanViewSet, VehicleViewSet

router = DefaultRouter()
router.register("vehicles", VehicleViewSet, basename="vehicle")
router.register("vehicle-loans", VehicleLoanViewSet, basename="vehicle-loan")
router.register("vehicle-loan-installments", VehicleLoanInstallmentViewSet, basename="vehicle-loan-installment")

urlpatterns = router.urls
