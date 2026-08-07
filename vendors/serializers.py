from rest_framework import serializers

from .models import Vendor, VendorLedgerEntry, VendorLedgerEntryType


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = [
            "id", "name", "vendor_type", "contact_person", "mobile", "email",
            "address", "gstin", "tds_applicable", "notes", "status",
        ]
        read_only_fields = ["id", "status"]


class VendorLedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorLedgerEntry
        fields = [
            "id", "vendor", "date", "entry_type", "payment_mode", "amount", "remarks",
            "source_model", "source_id",
        ]
        read_only_fields = ["id", "source_model", "source_id"]

    def validate(self, attrs):
        # Covers manual entries too (e.g. the vendor passbook's own "Record
        # payment" form), not just the Expense/FuelLog mark_paid actions -
        # a payment can never land in the ledger without a recorded method,
        # regardless of which door it came in through.
        entry_type = attrs.get("entry_type", getattr(self.instance, "entry_type", None))
        payment_mode = attrs.get("payment_mode", getattr(self.instance, "payment_mode", ""))
        if entry_type == VendorLedgerEntryType.PAYMENT and not payment_mode:
            raise serializers.ValidationError({"payment_mode": "Select how this was paid."})
        return attrs
