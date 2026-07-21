from rest_framework import serializers

from .models import Vehicle


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = [
            "id", "registration_number", "category", "usage", "metering_unit",
            "tracking_mode", "registration_date", "rto", "chassis_number",
            "engine_number", "rc_valid_till", "fuel_norm", "maker", "model",
            "mfg_year", "fuel_type", "fleet_id", "current_meter",
            "meter_reading_date", "status",
        ]
        read_only_fields = ["id", "status", "metering_unit"]
