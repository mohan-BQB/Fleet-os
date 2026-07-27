from rest_framework.routers import DefaultRouter

from .views import TyreServiceViewSet, TyreViewSet

router = DefaultRouter()
router.register("tyres", TyreViewSet, basename="tyre")
router.register("tyre-services", TyreServiceViewSet, basename="tyre-service")

urlpatterns = router.urls
