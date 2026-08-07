from rest_framework import serializers

from .models import Driver, WageBasis


class DriverSerializer(serializers.ModelSerializer):
    class Meta:
        model = Driver
        fields = [
            "id", "code", "name", "dob", "mobile", "emergency_contact", "address", "blood_group",
            "licence_number", "licence_class", "licence_issue_date", "licence_valid_till",
            "issuing_rto", "badge_number", "badge_valid_till", "date_of_joining",
            "employment_type", "wage_basis", "wage_amount", "advance_limit",
            "has_app_login", "status", "photo", "licence_copy", "id_proof",
        ]
        read_only_fields = ["id", "status"]

    def validate(self, attrs):
        wage_basis = attrs.get("wage_basis", getattr(self.instance, "wage_basis", WageBasis.MONTHLY))
        wage_amount = attrs.get("wage_amount", getattr(self.instance, "wage_amount", None))
        if wage_basis == WageBasis.PER_TRIP:
            # A per-trip driver's rate is decided fresh on each trip sheet
            # (see operations.TripSheet.driver_wage_amount) - a fixed base
            # amount here would be misleading, not just unused, so it's
            # cleared rather than left to linger from an earlier wage_basis.
            attrs["wage_amount"] = None
        elif not wage_amount:
            raise serializers.ValidationError(
                {"wage_amount": "Enter the driver's fixed wage - only 'Per trip' decides the amount per trip instead."}
            )
        return attrs
