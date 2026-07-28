"""Session-based auth for the frontend: log in (creates a session so
CurrentTenantMiddleware can pick up the tenant), check who's logged in, log
out. Token auth was deliberately skipped - tenant-scoping reads request.user
off Django's own session middleware, which runs before DRF's authentication
step, so a session is what actually makes multi-tenancy work end to end.

No CSRF token endpoint: CORS_ALLOWED_ORIGINS already locks writes to one
trusted origin (see core.authentication.CsrfExemptSessionAuthentication for
why that's sufficient on its own).

Also home to team management (UserViewSet) and the audit trail
(AuditLogViewSet) - both gated by capabilities in core.permissions."""
from django.contrib.auth import authenticate, login, logout
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import record_audit
from .models import AuditAction, AuditLog, Role, User
from .pagination import AuditLogPagination
from .permissions import HasCapability
from .serializers import (
    AuditLogSerializer, UserCreateSerializer, UserSerializer, UserUpdateSerializer,
)
from .tenancy import set_current_tenant, set_current_user


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)
        login(request, user)
        # CurrentTenantMiddleware already ran (before this view) and read
        # request.user as AnonymousUser, so it left the tenancy thread-local
        # cleared. Set it explicitly so record_audit (which reads the
        # current user off that thread-local, not an argument) attributes
        # this login to the user who just authenticated instead of no one.
        set_current_user(user)
        set_current_tenant(user.organization)
        record_audit(user, AuditAction.LOGIN)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserViewSet(viewsets.ModelViewSet):
    """Team management: an Owner/Admin provisioning and managing accounts
    within their own organization. User isn't a BaseModel subclass (it's
    Django's own AbstractUser), so it gets none of TenantManager's
    auto-scoping or no-hard-delete for free - both are reimplemented here."""
    permission_classes = [HasCapability]
    required_capability = "manage_users"

    def get_queryset(self):
        return User.objects.filter(organization=self.request.user.organization)

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ("update", "partial_update"):
            return UserUpdateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)

    def perform_update(self, serializer):
        instance = serializer.instance
        going_inactive = serializer.validated_data.get("is_active") is False
        if going_inactive:
            if instance.pk == self.request.user.pk:
                raise ValidationError("You can't deactivate your own account.")
            if instance.role == Role.OWNER:
                other_active_owner = (
                    User.objects.filter(
                        organization=instance.organization, role=Role.OWNER, is_active=True,
                    )
                    .exclude(pk=instance.pk)
                    .exists()
                )
                if not other_active_owner:
                    raise ValidationError("Can't deactivate the last active Owner.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        # No hard delete of accounts - PATCH is_active=false is the only
        # deactivation path (User has no retire(), unlike BaseModel).
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only audit trail. Serves both the global Audit Log page and the
    per-record history panel (?model_name=&object_id=) off one endpoint."""
    serializer_class = AuditLogSerializer
    permission_classes = [HasCapability]
    required_capability = "view_audit_log"
    pagination_class = AuditLogPagination

    def get_queryset(self):
        qs = AuditLog.objects.filter(
            organization=self.request.user.organization
        ).select_related("user")
        model_name = self.request.query_params.get("model_name")
        object_id = self.request.query_params.get("object_id")
        if model_name:
            qs = qs.filter(model_name=model_name)
        if object_id:
            qs = qs.filter(object_id=object_id)
        return qs
