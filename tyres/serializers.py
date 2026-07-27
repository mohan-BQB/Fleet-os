from rest_framework import serializers

from .models import Tyre, TyreService, TyreStatus


class TyreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tyre
        fields = [
            "id", "vehicle", "position", "brand", "size", "serial_number",
            "fitted_date", "purchase_date", "purchase_price", "odometer_at_fitting",
            "notes", "status",
        ]
        # status is writable here (Fitted/Spare) so the Add/Edit form can set
        # it directly - only "retired" is reserved for the dedicated
        # retire()/DELETE action, enforced below.
        read_only_fields = ["id"]

    def validate_status(self, value):
        if value == TyreStatus.RETIRED:
            raise serializers.ValidationError("Retire a tyre via the retire action, not by editing status directly.")
        return value

    def validate(self, attrs):
        position = attrs.get("position", getattr(self.instance, "position", ""))
        vehicle = attrs.get("vehicle", getattr(self.instance, "vehicle", None))
        if position and vehicle:
            clash = Tyre.objects.filter(vehicle=vehicle, position=position).exclude(status=TyreStatus.RETIRED)
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError(
                    {"position": f'"{position}" is already occupied by another tyre on this vehicle.'}
                )
        return attrs


class TyreServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = TyreService
        fields = [
            "id", "vehicle", "tyre", "service_type", "date", "odometer",
            "tread_depth_in", "new_position", "vendor", "notes",
        ]
        read_only_fields = ["id"]
