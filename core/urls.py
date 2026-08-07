from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AuditLogViewSet, ChangePasswordView, CompanyProfileView, LoginView, LogoutView, MeView,
    PermissionEffectiveView, PermissionSetView, UserViewSet,
)

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("audit", AuditLogViewSet, basename="audit")

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("company-profile/", CompanyProfileView.as_view(), name="company-profile"),
    path("permissions/effective/", PermissionEffectiveView.as_view(), name="permissions-effective"),
    path("permissions/set/", PermissionSetView.as_view(), name="permissions-set"),
] + router.urls
