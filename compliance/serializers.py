from rest_framework import serializers

from .models import Document


class DocumentSerializer(serializers.ModelSerializer):
    holder_display = serializers.CharField(source="holder.__str__", read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_due = serializers.BooleanField(read_only=True)

    class Meta:
        model = Document
        fields = [
            "id", "vehicle", "driver", "holder_display",
            "doc_type", "doc_number", "issue_date", "valid_till",
            "reminder_days_before", "file", "notes", "status",
            "is_expired", "is_due", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]

    def validate(self, attrs):
        vehicle = attrs.get("vehicle", getattr(self.instance, "vehicle", None))
        driver = attrs.get("driver", getattr(self.instance, "driver", None))
        if bool(vehicle) == bool(driver):
            raise serializers.ValidationError(
                "Set exactly one of vehicle or driver."
            )
        return attrs
