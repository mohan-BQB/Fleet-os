from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True, default=None)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "role", "organization", "organization_name", "driver_id",
        ]
        read_only_fields = fields
