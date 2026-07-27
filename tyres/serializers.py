from rest_framework import serializers

from .models import Tyre, TyreService


class TyreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tyre
        fields = [
            "id", "vehicle", "position", "brand", "size", "serial_number",
            "fitted_date", "purchase_date", "purchase_price", "odometer_at_fitting",
            "notes", "status",
        ]
        read_only_fields = ["id", "status"]


class TyreServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = TyreService
        fields = [
            "id", "vehicle", "tyre", "service_type", "date", "odometer",
            "tread_depth_in", "new_position", "vendor", "notes",
        ]
        read_only_fields = ["id"]
