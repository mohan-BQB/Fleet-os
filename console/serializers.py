from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from core.models import User

from .models import ApiKey, JobRun
from .services import create_organization


class OrganizationAdminSerializer(serializers.Serializer):
    """Read/patch view of an org for the Control Center. Not a
    ModelSerializer: the user/vehicle/driver counts are computed, not model
    fields, and disabled_modules/is_active are the only writable fields."""
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(max_length=200)
    is_active = serializers.BooleanField(required=False)
    disabled_modules = serializers.ListField(child=serializers.CharField(), required=False)
    created_at = serializers.DateTimeField(read_only=True)
    user_count = serializers.SerializerMethodField()
    vehicle_count = serializers.SerializerMethodField()
    driver_count = serializers.SerializerMethodField()

    def get_user_count(self, obj):
        return User.objects.filter(organization=obj).count()

    def get_vehicle_count(self, obj):
        from vehicles.models import Vehicle

        return Vehicle.all_objects.filter(organization=obj).count()

    def get_driver_count(self, obj):
        from drivers.models import Driver

        return Driver.all_objects.filter(organization=obj).count()

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance


class OrganizationOwnerCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, validators=[validate_password])


class OrganizationCreateSerializer(serializers.Serializer):
    """Write-only input for OrganizationViewSet.create - org name, its
    enabled-module set, and its first Owner login, in one shot."""
    name = serializers.CharField(max_length=200)
    disabled_modules = serializers.ListField(
        child=serializers.CharField(), required=False, default=list,
    )
    owner = OrganizationOwnerCreateSerializer()

    def validate_owner(self, value):
        if User.objects.filter(username=value["username"]).exists():
            raise serializers.ValidationError({"username": "That username is already taken."})
        return value

    def create(self, validated_data):
        owner = validated_data["owner"]
        return create_organization(
            name=validated_data["name"],
            disabled_modules=validated_data.get("disabled_modules") or [],
            owner_username=owner["username"],
            owner_email=owner["email"],
            owner_password=owner["password"],
        )

    def to_representation(self, instance):
        return OrganizationAdminSerializer(instance).data


class ApiKeySerializer(serializers.ModelSerializer):
    raw_key = serializers.SerializerMethodField()

    class Meta:
        model = ApiKey
        fields = [
            "id", "name", "organization", "prefix", "raw_key",
            "created_at", "last_used_at", "revoked_at",
        ]
        read_only_fields = ["id", "prefix", "created_at", "last_used_at", "revoked_at"]

    def get_raw_key(self, obj):
        # Only present right after creation - see ApiKeyViewSet.perform_create.
        return getattr(obj, "_raw_key", None)


class JobRunSerializer(serializers.ModelSerializer):
    triggered_by_username = serializers.CharField(
        source="triggered_by.username", read_only=True, default=None,
    )

    class Meta:
        model = JobRun
        fields = [
            "id", "job_name", "started_at", "finished_at", "status", "summary",
            "triggered_by", "triggered_by_username",
        ]
        read_only_fields = fields
