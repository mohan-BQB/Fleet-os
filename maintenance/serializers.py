from rest_framework import serializers

from .models import MaintenanceLog, MaintenanceLogBilling, MaintenanceSchedule, MaintenanceWorkType, PartSource


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
    # Write-only: what the linked Expense should cost - see
    # tyres.serializers.TyreServiceSerializer for the mirrored pattern.
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True, write_only=True)
    expense_amount = serializers.SerializerMethodField()
    is_paid = serializers.SerializerMethodField()
    # Mirrors tyres.serializers.TyreServiceSerializer's own approval-status
    # passthrough - see that file's docstring for why.
    expense_approval_status = serializers.SerializerMethodField()
    # The part's own cost - fully independent write-only amount/read-only
    # amount pair, mirroring amount/expense_amount above but for
    # part_expense instead of expense. See MaintenanceLog.part_vendor.
    part_amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True, write_only=True)
    part_expense_amount = serializers.SerializerMethodField()
    is_part_paid = serializers.SerializerMethodField()
    part_expense_approval_status = serializers.SerializerMethodField()
    # Write-only escape hatch for the schedule-match check in validate():
    # lets the caller explicitly say "yes, I saw the matching schedule and
    # this genuinely isn't it" instead of the check just blocking forever.
    confirm_no_schedule = serializers.BooleanField(required=False, default=False, write_only=True)

    inventory_item_name = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceLog
        fields = [
            "id", "vehicle", "schedule", "part_name", "date", "odometer", "vendor",
            "unlisted_vendor_name", "performed_by", "service_person_name", "service_person_mobile", "notes",
            "billing", "internal_note", "amount", "expense", "expense_amount", "is_paid",
            "expense_approval_status",
            "work_type", "old_part_number", "old_part_photo", "disposal_plan", "confirm_no_schedule",
            "part_source", "inventory_item", "inventory_item_name", "part_quantity", "inventory_movement",
            "part_vendor", "part_unlisted_vendor_name", "part_amount", "part_expense",
            "part_expense_amount", "is_part_paid", "part_expense_approval_status",
        ]
        read_only_fields = ["id", "expense", "inventory_movement", "part_expense"]

    def get_inventory_item_name(self, obj):
        return obj.inventory_item.name if obj.inventory_item_id else None

    def get_expense_amount(self, obj):
        return obj.expense.amount if obj.expense_id else None

    def get_is_paid(self, obj):
        return self._is_paid(obj.expense)

    def get_expense_approval_status(self, obj):
        return obj.expense.approval_status if obj.expense_id else None

    def get_part_expense_amount(self, obj):
        return obj.part_expense.amount if obj.part_expense_id else None

    def get_is_part_paid(self, obj):
        return self._is_paid(obj.part_expense)

    def get_part_expense_approval_status(self, obj):
        return obj.part_expense.approval_status if obj.part_expense_id else None

    def _is_paid(self, expense):
        # No linked Expense at all - None, not applicable, nothing to be paid.
        if expense is None:
            return None
        # Unlisted vendor (no payable ledger to post a bill against) still
        # has a real paid/pending state now - it lives on the Expense
        # itself (see Expense.paid), not derived as permanently unknown.
        if not expense.vendor_id:
            return expense.paid
        from vendors.services import is_paid

        return is_paid("Expense", expense.id)

    def validate(self, attrs):
        work_type = attrs.get("work_type", getattr(self.instance, "work_type", ""))
        if not work_type:
            raise serializers.ValidationError(
                {"work_type": "Say whether a physical part was replaced, or this was a consumable/fluid/labour-only job."}
            )
        if work_type == MaintenanceWorkType.PART_REPLACEMENT:
            disposal_plan = attrs.get("disposal_plan", getattr(self.instance, "disposal_plan", ""))
            if not disposal_plan:
                raise serializers.ValidationError(
                    {"disposal_plan": "Say what happened to the old part - nothing removed should go unaccounted for."}
                )
            old_part_number = attrs.get("old_part_number", getattr(self.instance, "old_part_number", ""))
            has_photo = bool(attrs.get("old_part_photo")) or (self.instance is not None and bool(self.instance.old_part_photo))
            if not old_part_number and not has_photo:
                raise serializers.ValidationError(
                    {"old_part_number": "Identify the old part with a part/serial number, a photo, or both."}
                )

            # The incoming part needs the same accounting as the outgoing
            # one: where did it actually come from. Fool-proof means neither
            # side of a swap can be left blank.
            part_source = attrs.get("part_source", getattr(self.instance, "part_source", ""))
            if not part_source:
                raise serializers.ValidationError(
                    {"part_source": "Say whether the new part was bought for this job, or used from spare/inventory."}
                )
            inventory_item = attrs.get("inventory_item", getattr(self.instance, "inventory_item", None))
            part_quantity = attrs.get("part_quantity", getattr(self.instance, "part_quantity", None))
            if part_source == PartSource.FROM_INVENTORY:
                if not inventory_item:
                    raise serializers.ValidationError(
                        {"inventory_item": "Select which stocked part this came from."}
                    )
                if not part_quantity or part_quantity <= 0:
                    raise serializers.ValidationError(
                        {"part_quantity": "Enter how many units were used."}
                    )
                from parts.services import available_quantity

                existing_movement = (
                    self.instance.inventory_movement if self.instance is not None and self.instance.inventory_movement_id else None
                )
                available = available_quantity(inventory_item, exclude_movement=existing_movement)
                if part_quantity > available:
                    raise serializers.ValidationError(
                        {"part_quantity": f"Only {available} {inventory_item.unit} of {inventory_item.name} in stock."}
                    )
            elif part_source == PartSource.NEW_PURCHASE:
                if inventory_item or part_quantity:
                    raise serializers.ValidationError(
                        {"part_source": "A newly bought part doesn't draw from inventory - clear the stock item/quantity."}
                    )
                # The part's own payment - entirely separate from the
                # labour billing below (see part_vendor's docstring): a
                # newly bought part is never free, but who gets paid for
                # *buying* it and who gets paid for *fitting* it can be two
                # different people, settled on two different schedules.
                part_vendor = attrs.get("part_vendor", getattr(self.instance, "part_vendor", None))
                part_unlisted_vendor_name = (
                    attrs.get("part_unlisted_vendor_name", getattr(self.instance, "part_unlisted_vendor_name", "")) or ""
                ).strip()
                part_amount = attrs.get("part_amount")
                if part_vendor and part_unlisted_vendor_name:
                    raise serializers.ValidationError(
                        {"part_unlisted_vendor_name": "Pick one - an existing vendor, or a name for one that isn't in the system, not both."}
                    )
                if not part_vendor and not part_unlisted_vendor_name:
                    raise serializers.ValidationError(
                        {"part_vendor": "Select who the part was bought from, or note the vendor's name if they're not in the system."}
                    )
                has_part_expense = self.instance is not None and self.instance.part_expense_id
                if part_amount is None and not has_part_expense:
                    raise serializers.ValidationError({"part_amount": "Enter what the part cost."})
            else:
                # from_inventory: nothing extra to require - the part's
                # payment already happened when the stock was received
                # (parts.PartStockMovement), not now. Clear any stray
                # part-payment fields left over from switching away from
                # new_purchase on an edit.
                attrs["part_vendor"] = None
                attrs["part_unlisted_vendor_name"] = ""
        else:
            # Consumable/labour-only work has nothing physical to source -
            # keep the part-source fields from a prior part_replacement
            # edit from lingering on an unrelated save.
            attrs["part_source"] = ""
            attrs["inventory_item"] = None
            attrs["part_quantity"] = None
            attrs["part_vendor"] = None
            attrs["part_unlisted_vendor_name"] = ""

        # Anything logged against a tracked schedule but not linked to it
        # would leave that schedule's due-date stale - true whether it's a
        # part replacement (air filter) or a consumable top-up (engine oil,
        # brake oil, hydraulic oil are all interval-tracked the same way,
        # just without the disposal/identification requirements above).
        # Only fires when nothing was linked at all; an explicit schedule
        # choice (including deliberately picking a *different* one) is left
        # alone.
        schedule = attrs.get("schedule", getattr(self.instance, "schedule", None))
        vehicle = attrs.get("vehicle", getattr(self.instance, "vehicle", None))
        part_name = (attrs.get("part_name", getattr(self.instance, "part_name", "")) or "").strip()
        if not schedule and vehicle and part_name:
            match = MaintenanceSchedule.objects.filter(
                vehicle=vehicle, status="active", part_name__iexact=part_name,
            ).first()
            if match and not attrs.get("confirm_no_schedule"):
                raise serializers.ValidationError(
                    {"schedule": f'This looks like it matches the tracked schedule "{match.part_name}" - '
                                 "link it so the due date resets, or confirm this isn't that item."}
                )

        billing = attrs.get("billing", getattr(self.instance, "billing", ""))
        vendor = attrs.get("vendor", getattr(self.instance, "vendor", None))
        unlisted_vendor_name = (
            attrs.get("unlisted_vendor_name", getattr(self.instance, "unlisted_vendor_name", "")) or ""
        ).strip()
        internal_note = attrs.get("internal_note", getattr(self.instance, "internal_note", ""))
        amount = attrs.get("amount")
        performed_by = attrs.get("performed_by", getattr(self.instance, "performed_by", ""))
        if not performed_by:
            raise serializers.ValidationError(
                {"performed_by": "Say who actually did the work - your own team, or an outside person."}
            )
        if not billing:
            raise serializers.ValidationError(
                {"billing": "Say whether this service was paid for or done internally."}
            )
        # The actual foolproof guarantee: an outside person's labour can
        # never be waved through as "done internally" just because the
        # billing fields were left blank - naming them in service_person_name
        # doesn't substitute for actually paying them.
        if performed_by == "external" and billing != MaintenanceLogBilling.PAID:
            raise serializers.ValidationError(
                {"billing": "Work done by an outside person has to be billed and paid - it can't be logged as done internally."}
            )
        if billing == MaintenanceLogBilling.PAID:
            if vendor and unlisted_vendor_name:
                raise serializers.ValidationError(
                    {"unlisted_vendor_name": "Pick one - an existing vendor, or a name for one that isn't in the system, not both."}
                )
            if not vendor and not unlisted_vendor_name:
                raise serializers.ValidationError(
                    {"vendor": "Select who was paid, or note the vendor's name if they're not in the system."}
                )
            has_expense = self.instance is not None and self.instance.expense_id
            if amount is None and not has_expense:
                raise serializers.ValidationError({"amount": "Enter how much this service cost."})
        elif billing == MaintenanceLogBilling.INTERNAL and not internal_note:
            raise serializers.ValidationError(
                {"internal_note": "Note who did this, so it's clear it wasn't just left unbilled."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("confirm_no_schedule", None)
        amount = validated_data.pop("amount", None)
        part_amount = validated_data.pop("part_amount", None)
        instance = super().create(validated_data)
        self._sync_expense(instance, amount)
        self._sync_part_expense(instance, part_amount)
        self._sync_inventory(instance)
        return instance

    def update(self, instance, validated_data):
        validated_data.pop("confirm_no_schedule", None)
        amount = validated_data.pop("amount", None)
        part_amount = validated_data.pop("part_amount", None)
        instance = super().update(instance, validated_data)
        self._sync_expense(instance, amount)
        self._sync_part_expense(instance, part_amount)
        self._sync_inventory(instance)
        return instance

    def _sync_inventory(self, instance):
        from .services import sync_inventory_issue

        sync_inventory_issue(instance)

    def _sync_expense(self, instance, amount):
        if instance.billing != MaintenanceLogBilling.PAID or amount is None:
            return
        from economics.models import ExpenseHead, ExpenseSourceType
        from economics.services import sync_linked_expense

        notes = f"Maintenance — {instance.part_name or 'service'}"
        if instance.unlisted_vendor_name:
            # No Vendor row to post a bill against (see the field's
            # docstring) - this is the only place that name survives, so the
            # vehicle's expense record isn't blank about who got paid.
            notes += f" (vendor not in system: {instance.unlisted_vendor_name})"

        sync_linked_expense(
            source=instance, link_field="expense",
            vehicle=instance.vehicle, expense_head=ExpenseHead.objects.get(slug="general_repairs"),
            date=instance.date, amount=amount, vendor=instance.vendor, notes=notes,
            source_type=ExpenseSourceType.MAINTENANCE_LABOUR,
        )

    def _sync_part_expense(self, instance, part_amount):
        if instance.part_source != PartSource.NEW_PURCHASE or part_amount is None:
            return
        from economics.models import ExpenseHead, ExpenseSourceType
        from economics.services import sync_linked_expense

        notes = f"Maintenance part — {instance.part_name or 'part'}"
        if instance.part_unlisted_vendor_name:
            notes += f" (vendor not in system: {instance.part_unlisted_vendor_name})"

        sync_linked_expense(
            source=instance, link_field="part_expense",
            vehicle=instance.vehicle, expense_head=ExpenseHead.objects.get(slug="spare_parts"),
            date=instance.date, amount=part_amount, vendor=instance.part_vendor, notes=notes,
            source_type=ExpenseSourceType.MAINTENANCE_PART,
        )
