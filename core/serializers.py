from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import AuditLog, CompanyProfile, Permission, Role, User
from .permissions import effective_permissions


class CompanyProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyProfile
        fields = [
            "legal_name", "entity_type", "logo", "gstin", "pan", "tan",
            "address", "city", "state", "pin", "fy_start_month", "updated_at",
        ]
        read_only_fields = ["updated_at"]


class UserSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True, default=None)
    organization_disabled_modules = serializers.SerializerMethodField()
    # The caller's own resolved section x action grid - lets the frontend
    # gate nav/buttons off one response instead of a permissions round-trip
    # per page. Only meaningful for the requesting user, but harmless (and
    # simplest) to compute the same way when a viewer looks up someone else
    # via UserViewSet/PermissionViewSet.
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "role", "organization", "organization_name", "driver_id",
            "is_active", "is_superuser", "organization_disabled_modules", "permissions",
        ]
        read_only_fields = fields

    def get_organization_disabled_modules(self, obj):
        return obj.organization.disabled_modules if obj.organization else []

    def get_permissions(self, obj):
        return effective_permissions(obj)


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "role", "user", "section", "action", "allowed"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        role = attrs.get("role", "")
        user = attrs.get("user")
        if bool(role) == bool(user):
            raise serializers.ValidationError("Set exactly one of role or user.")
        return attrs


class UserCreateSerializer(serializers.ModelSerializer):
    """Used by UserViewSet.create - an Owner/Admin provisioning a teammate.

    `organization` is deliberately not a field here: it's stamped onto the
    instance server-side from the requesting user (see
    UserViewSet.perform_create), the same principle BaseModel.save() uses to
    keep tenant assignment out of client-controlled input.
    """
    password = serializers.CharField(write_only=True, validators=[validate_password])
    driver_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "role", "driver_id"]

    def validate(self, attrs):
        if attrs.get("role") == Role.DRIVER:
            driver_id = attrs.get("driver_id")
            if not driver_id:
                raise serializers.ValidationError(
                    {"driver_id": "Required when role is driver."}
                )
            # Tenant-scoped already - Driver.objects is TenantManager-backed
            # and this runs inside a request, so the current-tenant
            # thread-local is set.
            from drivers.models import Driver

            if not Driver.objects.filter(pk=driver_id).exists():
                raise serializers.ValidationError(
                    {"driver_id": "No driver with that id in your organization."}
                )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Used by UserViewSet.update/partial_update. Deliberately excludes
    username/email/password - this endpoint changes role/status/driver
    link, not identity or credentials (no password-reset flow yet)."""
    driver_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ["role", "is_active", "driver_id"]

    def validate(self, attrs):
        role = attrs.get("role", self.instance.role if self.instance else None)
        if role == Role.DRIVER:
            driver_id = attrs.get("driver_id", getattr(self.instance, "driver_id", None))
            if not driver_id:
                raise serializers.ValidationError(
                    {"driver_id": "Required when role is driver."}
                )
            from drivers.models import Driver

            if not Driver.objects.filter(pk=driver_id).exists():
                raise serializers.ValidationError(
                    {"driver_id": "No driver with that id in your organization."}
                )
        return attrs


class AuditLogUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username"]


class AuditLogSerializer(serializers.ModelSerializer):
    user = AuditLogUserSerializer(read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "user", "action", "model_name", "object_id", "changes", "created_at"]
