from rest_framework import serializers

from .models import Vehicle, VehicleLoan, VehicleLoanInstallment
from .services import create_loan_with_schedule


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = [
            "id", "registration_number", "category", "usage", "metering_unit",
            "tracking_mode", "registration_date", "rto", "chassis_number",
            "engine_number", "rc_valid_till", "fuel_norm",
            "rto_vehicle_class", "maker", "model", "mfg_year", "fuel_type",
            "cc", "seating_capacity", "gvw", "colour",
            "owner_name", "owner_relation", "address", "financier", "hypothecation_till",
            "number_of_owners", "acquisition_type", "purchase_date", "previous_owner",
            "ownership_transfer_date", "broker_name", "broker_info", "broker_commission",
            "fleet_id", "current_meter", "meter_reading_date", "purchase_price",
            "status", "number_of_tyres", "spare_tyres", "axle_layout",
            "rc_copy", "rc_copy_back", "photo", "previous_rc_copy",
        ]
        read_only_fields = ["id", "status", "metering_unit"]


class VehicleLoanInstallmentSerializer(serializers.ModelSerializer):
    vehicle = serializers.CharField(source="loan.vehicle_id", read_only=True)
    registration_number = serializers.CharField(source="loan.vehicle.registration_number", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = VehicleLoanInstallment
        fields = [
            "id", "loan", "vehicle", "registration_number", "due_date", "amount",
            "paid", "paid_date", "payment_mode", "is_overdue",
        ]
        read_only_fields = ["id", "loan", "due_date", "amount", "paid", "paid_date"]


class VehicleLoanSerializer(serializers.ModelSerializer):
    installments = VehicleLoanInstallmentSerializer(many=True, read_only=True)
    outstanding_installments = serializers.IntegerField(read_only=True)

    class Meta:
        model = VehicleLoan
        fields = [
            "id", "vehicle", "financier", "principal_amount", "interest_rate", "tenure_months",
            "emi_amount", "start_date", "notes", "installments", "outstanding_installments",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        # The schedule (tenure_months installment rows) is generated in one
        # step alongside the loan itself - see
        # vehicles.services.create_loan_with_schedule.
        return create_loan_with_schedule(**validated_data)
