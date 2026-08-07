from rest_framework import serializers

from .models import PartInventoryItem, PartStockMovement, PartStockMovementType


class PartInventoryItemSerializer(serializers.ModelSerializer):
    quantity_on_hand = serializers.DecimalField(max_digits=12, decimal_places=1, read_only=True)

    class Meta:
        model = PartInventoryItem
        fields = ["id", "name", "part_number", "unit", "reorder_level", "notes", "status", "quantity_on_hand"]
        read_only_fields = ["id", "status"]


class PartStockMovementSerializer(serializers.ModelSerializer):
    total_cost = serializers.SerializerMethodField()

    class Meta:
        model = PartStockMovement
        fields = [
            "id", "item", "movement_type", "date", "quantity", "unit_cost", "vendor",
            "unlisted_vendor_name", "expense", "source_model", "source_id", "notes", "total_cost",
        ]
        read_only_fields = ["id", "expense"]

    def get_total_cost(self, obj):
        return (obj.unit_cost * obj.quantity) if obj.unit_cost is not None else None

    def validate(self, attrs):
        movement_type = attrs.get("movement_type", getattr(self.instance, "movement_type", ""))
        quantity = attrs.get("quantity", getattr(self.instance, "quantity", None))
        if quantity is None or quantity <= 0:
            raise serializers.ValidationError({"quantity": "Enter a quantity greater than zero."})

        vendor = attrs.get("vendor", getattr(self.instance, "vendor", None))
        unlisted_vendor_name = (
            attrs.get("unlisted_vendor_name", getattr(self.instance, "unlisted_vendor_name", "")) or ""
        ).strip()
        unit_cost = attrs.get("unit_cost", getattr(self.instance, "unit_cost", None))
        source_model = (attrs.get("source_model", getattr(self.instance, "source_model", "")) or "").strip()
        source_id = (attrs.get("source_id", getattr(self.instance, "source_id", "")) or "").strip()

        if movement_type == PartStockMovementType.RECEIPT:
            if unit_cost is None or unit_cost <= 0:
                raise serializers.ValidationError({"unit_cost": "Enter what this stock cost per unit."})
            if vendor and unlisted_vendor_name:
                raise serializers.ValidationError(
                    {"unlisted_vendor_name": "Pick one - an existing vendor, or a name for one that isn't in the system, not both."}
                )
            if not vendor and not unlisted_vendor_name:
                raise serializers.ValidationError(
                    {"vendor": "Select who this was bought from, or note the vendor's name if they're not in the system."}
                )
        elif movement_type == PartStockMovementType.ISSUE:
            if unit_cost is not None or vendor or unlisted_vendor_name:
                raise serializers.ValidationError(
                    {"unit_cost": "An issue doesn't carry its own cost - that was already recorded when this stock was received."}
                )
            if not source_model or not source_id:
                raise serializers.ValidationError(
                    {"source_model": "Stock can't leave inventory without a record of what used it."}
                )
            item = attrs.get("item", getattr(self.instance, "item", None))
            from .services import available_quantity

            available = available_quantity(item, exclude_movement=self.instance)
            if quantity > available:
                raise serializers.ValidationError(
                    {"quantity": f"Only {available} {item.unit} of {item.name} in stock - can't issue {quantity}."}
                )
        return attrs

    def create(self, validated_data):
        instance = super().create(validated_data)
        self._sync_expense(instance)
        return instance

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        self._sync_expense(instance)
        return instance

    def _sync_expense(self, instance):
        if instance.movement_type != PartStockMovementType.RECEIPT or instance.unit_cost is None:
            return
        from economics.models import ExpenseHead, ExpenseSourceType
        from economics.services import sync_linked_expense

        amount = instance.unit_cost * instance.quantity
        notes = f"Parts inventory — {instance.item.name} x{instance.quantity}"
        if instance.unlisted_vendor_name:
            notes += f" (vendor not in system: {instance.unlisted_vendor_name})"

        sync_linked_expense(
            source=instance, link_field="expense",
            expense_head=ExpenseHead.objects.get(slug="spare_parts"), date=instance.date, amount=amount,
            vendor=instance.vendor, notes=notes, source_type=ExpenseSourceType.PARTS_RECEIPT,
        )
