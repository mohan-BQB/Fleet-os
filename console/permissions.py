"""Platform-operator gate. Everything in this app is superuser-only, except
StopImpersonationView - by the time that endpoint runs, request.user is the
impersonated org owner, not the superuser, so it can't use this check (see
views.StopImpersonationView for the session-based check it uses instead)."""
from rest_framework.permissions import BasePermission


class IsSuperuser(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)
