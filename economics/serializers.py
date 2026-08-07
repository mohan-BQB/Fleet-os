from rest_framework import serializers

from .models import Expense, ExpenseHead, ExpenseSourceType

# Coarse-grained view of source_type for the frontend - unchanged contract
# from before source_type existed, so Phase 0's UI (which already branches
# on this) and any other existing consumer don't need to change alongside
# this. The granular value is available separately via source_type/
# source_id for anything that needs to build a real link to the record.
_SOURCE_TYPE_TO_COARSE = {
    "": "direct",
    ExpenseSourceType.TRIP_EXPENSE: "trip",
    ExpenseSourceType.TYRE_SERVICE_LABOUR: "tyre_service",
    ExpenseSourceType.TYRE_PURCHASE: "tyre_service",
    ExpenseSourceType.MAINTENANCE_LABOUR: "maintenance",
    ExpenseSourceType.MAINTENANCE_PART: "maintenance",
    ExpenseSourceType.PARTS_RECEIPT: "parts",
}

# Every field a direct entry can actually change. Locked outright once
# source_type is set - see ExpenseSerializer.validate(). Deliberately
# explicit rather than "everything not read-only", so a future writable
# field defaults to unlocked unless someone consciously adds it here.
_LOCKED_WHEN_SOURCED = {
    "vehicle", "expense_head", "date", "amount", "vendor", "unlisted_vendor_name", "notes", "receipt",
}


class ExpenseHeadSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseHead
        fields = ["id", "name", "group", "slug"]
        read_only_fields = ["id"]


class ExpenseSerializer(serializers.ModelSerializer):
    # True/False either way now: derived from the vendor ledger when there's
    # a vendor (see vendors.services.is_paid - the ledger is the source of
    # truth there, `paid`/`payment_mode`/`paid_date` are ignored), or from
    # this Expense's own `paid` flag when there isn't one - a one-off payee
    # has no ledger to post a bill against, but still needs a real
    # paid-vs-pending state, not a permanent "not applicable".
    is_paid = serializers.SerializerMethodField()
    # Where this row actually came from - a direct Economics entry, or
    # auto-posted from a tyre service/maintenance job/trip expense line.
    # Masters -> Expense -> All expenses shows every cost in one place
    # regardless of source, but still traces where it was entered so "why
    # is this here" always has an answer. Derived from source_type, not a
    # reverse scan across four other apps' tables anymore.
    source = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = [
            "id", "vehicle", "expense_head", "date", "amount",
            "vendor", "unlisted_vendor_name", "notes", "receipt", "created_at", "is_paid", "source",
            "source_type", "source_id", "payment_mode", "paid_date",
            "approval_status", "approval_note",
        ]
        read_only_fields = [
            "id", "created_at", "is_paid", "source", "source_type", "source_id",
            "payment_mode", "paid_date", "approval_status", "approval_note",
        ]

    def get_is_paid(self, obj):
        if not obj.vendor_id:
            return obj.paid
        from vendors.services import is_paid

        return is_paid("Expense", obj.id)

    def get_source(self, obj):
        return _SOURCE_TYPE_TO_COARSE[obj.source_type]

    def validate(self, attrs):
        # A row mirroring a Trip/Tyre/Maintenance/Parts record is display/
        # history only here - the source record is the real source of truth
        # and the one place a correction actually sticks (see
        # economics.services.sync_linked_expense's docstring). This is the
        # real gate; the frontend hiding the Edit control is UX, not the
        # rule itself - same "backend enforces independently" pattern
        # MarkPaidModal already documents for payment_mode.
        if self.instance is not None and self.instance.source_type and (_LOCKED_WHEN_SOURCED & set(attrs)):
            raise serializers.ValidationError(
                f"This expense was posted automatically from "
                f"{self.instance.get_source_type_display()} and can't be edited here — "
                "fix it at the source record instead."
            )
        vendor = attrs.get("vendor", getattr(self.instance, "vendor", None))
        unlisted_vendor_name = (
            attrs.get("unlisted_vendor_name", getattr(self.instance, "unlisted_vendor_name", "")) or ""
        ).strip()
        if vendor and unlisted_vendor_name:
            raise serializers.ValidationError(
                {"unlisted_vendor_name": "Pick one - an existing vendor, or a name for one that isn't in the system, not both."}
            )
        return attrs
