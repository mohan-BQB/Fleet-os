from rest_framework import serializers

from .models import DriverLedgerEntry, FuelLog, TripLeg, TripSheet


class TripLegSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripLeg
        fields = [
            "id", "trip_sheet", "sequence", "from_place", "to_place",
            "consignor", "lr_number", "freight_amount", "remarks",
        ]
        read_only_fields = ["id"]


class TripSheetSerializer(serializers.ModelSerializer):
    legs = TripLegSerializer(many=True, read_only=True)
    distance_covered = serializers.DecimalField(max_digits=12, decimal_places=1, read_only=True)
    total_freight = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = TripSheet
        fields = [
            "id", "vehicle", "driver", "date", "opening_meter", "closing_meter",
            "status", "remarks", "legs", "distance_covered", "total_freight",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]


class FuelLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = FuelLog
        fields = [
            "id", "vehicle", "trip_sheet", "date", "litres", "rate_per_litre",
            "amount", "odometer", "fuel_station", "is_full_tank",
        ]
        read_only_fields = ["id", "amount"]


class DriverLedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = DriverLedgerEntry
        fields = [
            "id", "driver", "trip_sheet", "date", "entry_type", "amount", "remarks",
        ]
        read_only_fields = ["id"]
