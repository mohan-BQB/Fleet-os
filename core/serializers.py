from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import AuditLog, Role, User


class UserSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True, default=None)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "role", "organization", "organization_name", "driver_id",
            "is_active",
        ]
        read_only_fields = fields


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
