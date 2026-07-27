from rest_framework import serializers

from .models import MaintenanceLog, MaintenanceSchedule


class MaintenanceScheduleSerializer(serializers.ModelSerializer):
    next_due_km = serializers.DecimalField(max_digits=12, decimal_places=1, read_only=True, allow_null=True)
    next_due_date = serializers.DateField(read_only=True, allow_null=True)
    km_remaining = serializers.DecimalField(max_digits=12, decimal_places=1, read_only=True, allow_null=True)
    days_remaining = serializers.IntegerField(read_only=True, allow_null=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = MaintenanceSchedule
        fields = [
            "id", "vehicle", "part_name", "interval_km", "interval_days",
            "last_done_date", "last_done_odometer", "notes", "status",
            "next_due_km", "next_due_date", "km_remaining", "days_remaining", "is_overdue",
        ]
        read_only_fields = ["id", "status"]


class MaintenanceLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceLog
        fields = ["id", "vehicle", "schedule", "part_name", "date", "odometer", "vendor", "notes"]
        read_only_fields = ["id"]
