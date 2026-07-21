from rest_framework import serializers

from .models import Driver


class DriverSerializer(serializers.ModelSerializer):
    class Meta:
        model = Driver
        fields = [
            "id", "code", "name", "dob", "mobile", "blood_group",
            "licence_number", "licence_class", "licence_valid_till",
            "badge_number", "badge_valid_till", "date_of_joining",
            "employment_type", "wage_basis", "wage_amount",
            "has_app_login", "status",
        ]
        read_only_fields = ["id", "status"]
