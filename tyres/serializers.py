from rest_framework import serializers

from .models import Tyre, TyreService, TyreServiceBilling, TyreServiceType, TyreSource, TyreStatus


class TyreSerializer(serializers.ModelSerializer):
    # Lifetime distance across every fitted stint, closed ones plus the
    # current one - see Tyre.total_distance/save(). System-computed only;
    # accumulated_distance is deliberately not user-editable so it can't be
    # hand-padded or zeroed out.
    total_distance = serializers.DecimalField(
        max_digits=12, decimal_places=1, read_only=True, allow_null=True,
    )

    class Meta:
        model = Tyre
        fields = [
            "id", "vehicle", "position", "brand", "size", "serial_number",
            "fitted_date", "purchase_date", "purchase_price", "odometer_at_fitting",
            "accumulated_distance", "total_distance", "notes", "status",
        ]
        # status is writable here (Fitted/Spare) so the Add/Edit form can set
        # it directly - only "retired" is reserved for the dedicated
        # retire()/DELETE action, enforced below. accumulated_distance is
        # read-only - see Tyre.save(), which is the only thing allowed to
        # move it.
        read_only_fields = ["id", "accumulated_distance"]

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
    # Write-only: what the linked Expense should cost. Not a model field
    # itself (TyreService doesn't carry money) - only read when billing is
    # actually changing to/staying "paid" (see validate()/create()/update()).
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True, write_only=True)
    expense_amount = serializers.SerializerMethodField()
    # None when there's no linked Expense to pay (internal/not yet billed);
    # True/False once there is one - same derivation as ExpenseSerializer.
    is_paid = serializers.SerializerMethodField()
    # Surfaces the linked Expense's own approval_status here too, so Tyres.tsx
    # can show it without a second fetch against /economics/expenses/ - the
    # same "why isn't this showing as pending anywhere" gap Fuel Log had.
    expense_approval_status = serializers.SerializerMethodField()
    # The tyre's own cost - fully independent write-only/read-only amount
    # pair, mirroring amount/expense_amount above but for tyre_expense
    # instead of expense. See TyreService.tyre_vendor.
    tyre_amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True, write_only=True)
    tyre_expense_amount = serializers.SerializerMethodField()
    is_tyre_paid = serializers.SerializerMethodField()
    tyre_expense_approval_status = serializers.SerializerMethodField()
    # Write-only: which Masters -> Expense head this service's bill should
    # post under. Optional - when left blank, _sync_expense picks a sensible
    # default from service_type (see economics.expense_heads.
    # TYRE_SERVICE_TYPE_TO_SLUG). Plain UUIDField rather than a
    # PrimaryKeyRelatedField so this file doesn't need a module-level import
    # of economics.models (see the tyres<->economics cycle note below).
    expense_head = serializers.UUIDField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = TyreService
        fields = [
            "id", "vehicle", "tyre", "previous_tyre", "removal_reason", "removal_odometer",
            "removal_tread_depth_in", "service_type", "date", "odometer",
            "tread_depth_in", "new_position", "vendor", "unlisted_vendor_name", "performed_by",
            "service_person_name", "service_person_mobile", "notes",
            "billing", "internal_note", "amount", "expense_head", "expense", "expense_amount", "is_paid",
            "expense_approval_status",
            "tyre_source", "tyre_vendor", "tyre_unlisted_vendor_name", "tyre_amount",
            "tyre_expense", "tyre_expense_amount", "is_tyre_paid", "tyre_expense_approval_status",
        ]
        read_only_fields = ["id", "tyre_expense"]
        # `expense` stays writable (not just auto-set by _sync_expense) so a
        # bulk rotation/balancing visit - one real bill, several TyreService
        # rows, one per tyre - can point every row at the *same* Expense
        # instead of billing the vendor once per tyre. Its queryset comes
        # from Expense's own tenant-scoped manager, so a client can only ever
        # link an Expense already in their own org.

    def get_expense_amount(self, obj):
        return obj.expense.amount if obj.expense_id else None

    def get_is_paid(self, obj):
        return self._is_paid(obj.expense)

    def get_expense_approval_status(self, obj):
        return obj.expense.approval_status if obj.expense_id else None

    def get_tyre_expense_amount(self, obj):
        return obj.tyre_expense.amount if obj.tyre_expense_id else None

    def get_is_tyre_paid(self, obj):
        return self._is_paid(obj.tyre_expense)

    def get_tyre_expense_approval_status(self, obj):
        return obj.tyre_expense.approval_status if obj.tyre_expense_id else None

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
        service_type = attrs.get("service_type", getattr(self.instance, "service_type", ""))
        tyre = attrs.get("tyre", getattr(self.instance, "tyre", None))
        previous_tyre = attrs.get("previous_tyre", getattr(self.instance, "previous_tyre", None))
        removal_reason = attrs.get("removal_reason", getattr(self.instance, "removal_reason", ""))
        if service_type == TyreServiceType.REPLACEMENT:
            # A replacement without both ends of the swap on record is
            # exactly the gap this is meant to close - "logged a
            # replacement" must always mean "know which tyre came off and
            # which went on, and why" (see tyres.views.replace_tyre, the
            # only intended entry point for this service_type).
            if not tyre:
                raise serializers.ValidationError({"tyre": "The incoming tyre must be recorded."})
            if not previous_tyre:
                raise serializers.ValidationError({"previous_tyre": "The outgoing tyre must be recorded."})
            if tyre == previous_tyre:
                raise serializers.ValidationError({"previous_tyre": "A tyre can't replace itself."})
            if not removal_reason:
                raise serializers.ValidationError({"removal_reason": "Say why the outgoing tyre was removed."})

            # The incoming tyre's own trace: was it bought new or pulled from
            # spare stock - mirrors maintenance.PartSource/part_source.
            tyre_source = attrs.get("tyre_source", getattr(self.instance, "tyre_source", ""))
            if not tyre_source:
                raise serializers.ValidationError(
                    {"tyre_source": "Say whether the new tyre was bought for this job, or fitted from spare stock."}
                )
            if tyre_source == TyreSource.NEW_PURCHASE:
                # The tyre's own payment - entirely separate from the
                # fitting/labour billing below (see tyre_vendor's
                # docstring): buying the tyre and paying whoever fitted it
                # can be two different people, settled on two different
                # schedules, even when it's the same shop.
                tyre_vendor = attrs.get("tyre_vendor", getattr(self.instance, "tyre_vendor", None))
                tyre_unlisted_vendor_name = (
                    attrs.get("tyre_unlisted_vendor_name", getattr(self.instance, "tyre_unlisted_vendor_name", "")) or ""
                ).strip()
                tyre_amount = attrs.get("tyre_amount")
                if tyre_vendor and tyre_unlisted_vendor_name:
                    raise serializers.ValidationError(
                        {"tyre_unlisted_vendor_name": "Pick one - an existing vendor, or a name for one that isn't in the system, not both."}
                    )
                if not tyre_vendor and not tyre_unlisted_vendor_name:
                    raise serializers.ValidationError(
                        {"tyre_vendor": "Select who the tyre was bought from, or note the vendor's name if they're not in the system."}
                    )
                has_tyre_expense = self.instance is not None and self.instance.tyre_expense_id
                if tyre_amount is None and not has_tyre_expense:
                    raise serializers.ValidationError({"tyre_amount": "Enter what the tyre cost."})
            else:
                # from_spare: its cost was already paid/recorded when that
                # tyre was originally bought, not now. Clear any stray
                # tyre-payment fields left over from switching away from
                # new_purchase on an edit.
                attrs["tyre_vendor"] = None
                attrs["tyre_unlisted_vendor_name"] = ""
        else:
            # Non-replacement service types have no incoming tyre to source -
            # keep tyre-source fields from a prior replacement edit from
            # lingering on an unrelated save.
            attrs["tyre_source"] = ""
            attrs["tyre_vendor"] = None
            attrs["tyre_unlisted_vendor_name"] = ""

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
        # billing fields were left blank.
        if performed_by == "external" and billing != TyreServiceBilling.PAID:
            raise serializers.ValidationError(
                {"billing": "Work done by an outside person has to be billed and paid - it can't be logged as done internally."}
            )
        if billing == TyreServiceBilling.PAID:
            if vendor and unlisted_vendor_name:
                raise serializers.ValidationError(
                    {"unlisted_vendor_name": "Pick one - an existing vendor, or a name for one that isn't in the system, not both."}
                )
            if not vendor and not unlisted_vendor_name:
                raise serializers.ValidationError(
                    {"vendor": "Select who was paid, or note the vendor's name if they're not in the system."}
                )
            has_expense = bool(attrs.get("expense")) or (self.instance is not None and self.instance.expense_id)
            if amount is None and not has_expense:
                raise serializers.ValidationError({"amount": "Enter how much this service cost."})
        elif billing == TyreServiceBilling.INTERNAL and not internal_note:
            raise serializers.ValidationError(
                {"internal_note": "Note who did this, so it's clear it wasn't just left unbilled."}
            )
        return attrs

    def create(self, validated_data):
        amount = validated_data.pop("amount", None)
        tyre_amount = validated_data.pop("tyre_amount", None)
        expense_head_id = validated_data.pop("expense_head", None)
        instance = super().create(validated_data)
        self._sync_expense(instance, amount, expense_head_id)
        self._sync_tyre_expense(instance, tyre_amount)
        return instance

    def update(self, instance, validated_data):
        amount = validated_data.pop("amount", None)
        tyre_amount = validated_data.pop("tyre_amount", None)
        expense_head_id = validated_data.pop("expense_head", None)
        instance = super().update(instance, validated_data)
        self._sync_expense(instance, amount, expense_head_id)
        self._sync_tyre_expense(instance, tyre_amount)
        return instance

    def _sync_expense(self, instance, amount, expense_head_id=None):
        if instance.billing != TyreServiceBilling.PAID or amount is None:
            return
        # Imported locally to avoid a tyres <-> economics import cycle, same
        # convention core.audit/vendors.services already use in this codebase.
        from economics.expense_heads import TYRE_SERVICE_TYPE_TO_SLUG
        from economics.models import ExpenseHead, ExpenseSourceType
        from economics.services import sync_linked_expense

        if expense_head_id:
            head = ExpenseHead.objects.get(pk=expense_head_id)
        else:
            slug = TYRE_SERVICE_TYPE_TO_SLUG.get(instance.service_type, "puncture_repair")
            head = ExpenseHead.objects.get(slug=slug)

        notes = f"Tyre service — {instance.get_service_type_display()}"
        if instance.unlisted_vendor_name:
            # No Vendor row to post a bill against - this is the only place
            # that name survives, so the vehicle's expense record isn't
            # blank about who got paid (see the field's docstring).
            notes += f" (vendor not in system: {instance.unlisted_vendor_name})"

        sync_linked_expense(
            source=instance, link_field="expense",
            vehicle=instance.vehicle, expense_head=head, date=instance.date, amount=amount,
            vendor=instance.vendor, notes=notes, source_type=ExpenseSourceType.TYRE_SERVICE_LABOUR,
        )

    def _sync_tyre_expense(self, instance, tyre_amount):
        if instance.tyre_source != TyreSource.NEW_PURCHASE or tyre_amount is None:
            return
        from economics.models import ExpenseHead, ExpenseSourceType
        from economics.services import sync_linked_expense

        # A tyre purchase is a physical-part cost, same bucket as any other
        # new-part purchase (maintenance/parts) - not a "tyre service" head,
        # those are all labour.
        head = ExpenseHead.objects.get(slug="spare_parts")

        notes = f"New tyre — {instance.tyre.brand if instance.tyre_id else 'replacement'}"
        if instance.tyre_unlisted_vendor_name:
            notes += f" (vendor not in system: {instance.tyre_unlisted_vendor_name})"

        sync_linked_expense(
            source=instance, link_field="tyre_expense",
            vehicle=instance.vehicle, expense_head=head, date=instance.date, amount=tyre_amount,
            vendor=instance.tyre_vendor, notes=notes, source_type=ExpenseSourceType.TYRE_PURCHASE,
        )
