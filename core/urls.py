from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AuditLogViewSet, LoginView, LogoutView, MeView, UserViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("audit", AuditLogViewSet, basename="audit")

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
] + router.urls
