from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DashboardPnLView, ExpenseHeadViewSet, ExpenseViewSet, VehiclePnLView

router = DefaultRouter()
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("expense-heads", ExpenseHeadViewSet, basename="expense-head")

urlpatterns = [
    path("pnl/vehicle/", VehiclePnLView.as_view(), name="pnl-vehicle"),
    path("pnl/dashboard/", DashboardPnLView.as_view(), name="pnl-dashboard"),
] + router.urls
