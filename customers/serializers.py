from rest_framework import serializers

from .models import Customer, CustomerLedgerEntry, CustomerLedgerEntryType


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "id", "name", "gstin", "contact_person", "mobile", "email", "address", "notes", "status",
        ]
        read_only_fields = ["id", "status"]


class CustomerLedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerLedgerEntry
        fields = [
            "id", "customer", "date", "entry_type", "payment_mode", "amount", "remarks",
            "source_model", "source_id",
        ]
        read_only_fields = ["id", "source_model", "source_id"]

    def validate(self, attrs):
        # Covers manual entries too (e.g. the customer passbook's own
        # "Record receipt" form), not just mark_received - a receipt can
        # never land in the ledger without a recorded method, regardless of
        # which door it came in through. Reuses vendors' payment-mode
        # choices rather than a duplicate enum - imported locally to avoid a
        # customers <-> vendors import-time dependency, same convention
        # ExpenseViewSet.mark_paid already uses.
        from vendors.models import VendorPaymentMode

        entry_type = attrs.get("entry_type", getattr(self.instance, "entry_type", None))
        payment_mode = attrs.get("payment_mode", getattr(self.instance, "payment_mode", ""))
        if entry_type == CustomerLedgerEntryType.RECEIPT and payment_mode not in VendorPaymentMode.values:
            raise serializers.ValidationError({"payment_mode": "Select how this was received."})
        return attrs
