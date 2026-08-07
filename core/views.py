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
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import record_audit
from .models import AuditAction, AuditLog, CompanyProfile, Permission, PermissionAction, Role, User
from .pagination import AuditLogPagination
from .permissions import SECTIONS, HasCapability, can, effective_permissions
from .serializers import (
    AuditLogSerializer, CompanyProfileSerializer, UserCreateSerializer, UserSerializer,
    UserUpdateSerializer,
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
        if user.organization and not user.organization.is_active:
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
        return Response({
            **UserSerializer(request.user).data,
            "impersonating": "impersonator_id" in request.session,
        })


class UserViewSet(viewsets.ModelViewSet):
    """Team management: an Owner/Admin provisioning and managing accounts
    within their own organization. User isn't a BaseModel subclass (it's
    Django's own AbstractUser), so it gets none of TenantManager's
    auto-scoping or no-hard-delete for free - both are reimplemented here."""
    permission_classes = [HasCapability]
    required_section = "company_users"

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
    required_section = "reports"
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


class CompanyProfileView(APIView):
    """The tenant's own record - a singleton, not a list (unlike
    Vehicle/Driver). Readable by anyone signed in, since the name/logo/GSTIN
    are meant to appear on payslips, statements and reports generated by any
    role; editing (incl. the logo) is Admin-only per core.permissions."""
    permission_classes = [IsAuthenticated]

    def get_object(self, request):
        # Auto-create on first touch rather than requiring a separate
        # "provision the org" step - there's always exactly one profile per
        # organization, so there's nothing meaningful to "add".
        profile, _ = CompanyProfile.objects.get_or_create(
            organization=request.user.organization,
            defaults={"legal_name": request.user.organization.name},
        )
        return profile

    def get(self, request):
        return Response(CompanyProfileSerializer(self.get_object(request)).data)

    def patch(self, request):
        if not can(request.user, "company_users", "add_edit"):
            raise PermissionDenied("You don't have permission to edit the company profile.")
        profile = self.get_object(request)
        serializer = CompanyProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(APIView):
    """Any signed-in user changes their own password - no section gate
    beyond being authenticated (this isn't a Masters/permissions concern)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        old_password = request.data.get("old_password")
        new_password = request.data.get("new_password")
        if not request.user.check_password(old_password or ""):
            raise ValidationError({"old_password": "That's not your current password."})
        if not new_password:
            raise ValidationError({"new_password": "Enter a new password."})
        try:
            validate_password(new_password, user=request.user)
        except DjangoValidationError as exc:
            raise ValidationError({"new_password": exc.messages})
        request.user.set_password(new_password)
        request.user.save()
        # Otherwise the session cookie they're using right now goes stale
        # the moment the password changes and they'd be logged out mid-flow.
        update_session_auth_hash(request, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PermissionEffectiveView(APIView):
    """The full section x action grid for one user in the caller's org -
    what the Users screen renders once a person is selected."""
    permission_classes = [HasCapability]
    required_section = "company_users"

    def get(self, request):
        user_id = request.query_params.get("user")
        if not user_id:
            raise ValidationError("`user` query param is required.")
        try:
            target = User.objects.get(pk=user_id, organization=request.user.organization)
        except (User.DoesNotExist, DjangoValidationError, ValueError):
            raise ValidationError("No such user in your organization.")
        return Response({
            "user": str(target.id), "role": target.role, "permissions": effective_permissions(target),
        })


class PermissionSetView(APIView):
    """Upserts a user-level override - the one door the Users screen's
    switches go through. Always a `user` row, never a `role` row (see
    core.models.Permission's docstring) - role-level overrides exist in the
    data model but nothing in this build writes them; every flip here is
    audited for free via BaseModel.save()."""
    permission_classes = [HasCapability]
    required_section = "company_users"

    def post(self, request):
        user_id = request.data.get("user_id")
        section = request.data.get("section")
        action = request.data.get("action")
        allowed = request.data.get("allowed")
        if not user_id or not section or not action or allowed is None:
            raise ValidationError("`user_id`, `section`, `action` and `allowed` are all required.")
        if section not in SECTIONS:
            raise ValidationError({"section": f"Unknown section '{section}'."})
        if action not in PermissionAction.values:
            raise ValidationError({"action": f"Unknown action '{action}'."})
        try:
            target = User.objects.get(pk=user_id, organization=request.user.organization)
        except (User.DoesNotExist, DjangoValidationError, ValueError):
            raise ValidationError("No such user in your organization.")

        override = Permission.all_objects.filter(
            organization=request.user.organization, user=target, section=section, action=action,
        ).first()
        if override is None:
            override = Permission(organization=request.user.organization, user=target, section=section, action=action)
        override.allowed = bool(allowed)
        override.save()

        return Response({
            "user": str(target.id), "role": target.role, "permissions": effective_permissions(target),
        })
