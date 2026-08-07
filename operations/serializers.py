from rest_framework import serializers

from core.models import Role
from drivers.models import WageBasis

from .models import (
    DriverLedgerEntry, EarningSubtype, FuelLog, LedgerEntryType, RouteRate, TripAdvance, TripExpense,
    TripLeg, TripSheet, TripSheetStatus, WorkItem, WorkRate,
)


class TripLegSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripLeg
        fields = [
            "id", "trip_sheet", "sequence", "from_place", "to_place",
            "consignor", "lr_number", "load_status", "distance_km", "customer", "material",
            "tonnage", "basis", "rate", "freight_amount", "remarks",
        ]
        # freight_amount is still writable here - it stays plain user input
        # for an hours-vehicle trip (see TripLeg.save()). For a route-card
        # trip whatever's submitted gets overwritten by the computed value.
        read_only_fields = ["id"]

    def validate(self, attrs):
        trip_sheet = attrs.get("trip_sheet", getattr(self.instance, "trip_sheet", None))
        if trip_sheet is None or trip_sheet.card_type != "route":
            # An hours-vehicle trip keeps behaving exactly as before this
            # feature existed - no load/customer/rate accounting to enforce.
            return attrs

        load_status = attrs.get("load_status", getattr(self.instance, "load_status", ""))
        if not load_status:
            raise serializers.ValidationError(
                {"load_status": "Say whether this leg was loaded or ran empty."}
            )
        distance_km = attrs.get("distance_km", getattr(self.instance, "distance_km", None))
        if distance_km is None:
            raise serializers.ValidationError(
                {"distance_km": "Enter the distance covered - needed for the empty-running rollup."}
            )
        if load_status == "loaded":
            customer = attrs.get("customer", getattr(self.instance, "customer", None))
            basis = attrs.get("basis", getattr(self.instance, "basis", ""))
            rate = attrs.get("rate", getattr(self.instance, "rate", None))
            if not customer:
                raise serializers.ValidationError({"customer": "Select who this leg is billed to."})
            if not basis:
                raise serializers.ValidationError({"basis": "Say how this leg is billed."})
            if rate is None:
                raise serializers.ValidationError({"rate": "Enter the rate."})
            tonnage = attrs.get("tonnage", getattr(self.instance, "tonnage", None))
            if basis == "per_ton" and tonnage is None:
                raise serializers.ValidationError({"tonnage": "Enter the tonnage - this leg is billed per ton."})
        return attrs


class WorkItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkItem
        fields = [
            "id", "trip_sheet", "sequence", "site", "customer", "work_type", "basis", "qty", "rate",
            "overtime_qty", "overtime_rate", "min_billable", "amount", "remarks",
        ]
        read_only_fields = ["id", "amount"]

    def validate(self, attrs):
        trip_sheet = attrs.get("trip_sheet", getattr(self.instance, "trip_sheet", None))
        if trip_sheet is None or trip_sheet.card_type != "work":
            raise serializers.ValidationError(
                {"trip_sheet": "Work items only apply to an hours-vehicle (JCB/tractor) trip."}
            )
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        work_type = attrs.get("work_type", getattr(self.instance, "work_type", ""))
        basis = attrs.get("basis", getattr(self.instance, "basis", ""))
        qty = attrs.get("qty", getattr(self.instance, "qty", None))
        rate = attrs.get("rate", getattr(self.instance, "rate", None))
        if not customer:
            raise serializers.ValidationError({"customer": "Select who this work is billed to."})
        if not work_type:
            raise serializers.ValidationError({"work_type": "Say what work this was."})
        if not basis:
            raise serializers.ValidationError({"basis": "Say how this is billed."})
        if qty is None:
            raise serializers.ValidationError({"qty": "Enter the quantity."})
        if rate is None:
            raise serializers.ValidationError({"rate": "Enter the rate."})
        overtime_qty = attrs.get("overtime_qty", getattr(self.instance, "overtime_qty", None))
        overtime_rate = attrs.get("overtime_rate", getattr(self.instance, "overtime_rate", None))
        if bool(overtime_qty) != bool(overtime_rate):
            raise serializers.ValidationError(
                {"overtime_rate": "Enter both an overtime quantity and its rate, or neither."}
            )
        return attrs


class RouteRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RouteRate
        fields = [
            "id", "from_place", "to_place", "customer", "material", "basis", "rate",
            "load_pattern", "effective_date",
        ]
        read_only_fields = ["id"]

    def validate_rate(self, value):
        if value <= 0:
            raise serializers.ValidationError("Enter a rate greater than zero.")
        return value


class WorkRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkRate
        fields = [
            "id", "equipment", "work_type", "customer", "basis", "rate",
            "min_billable", "overtime_rate", "effective_date",
        ]
        read_only_fields = ["id"]

    def validate_rate(self, value):
        if value <= 0:
            raise serializers.ValidationError("Enter a rate greater than zero.")
        return value


class TripAdvanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripAdvance
        fields = ["id", "trip_sheet", "amount", "given_by", "date", "payment_mode", "remarks", "ledger_entry"]
        read_only_fields = ["id", "ledger_entry"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Enter an amount greater than zero.")
        return value

    def create(self, validated_data):
        instance = super().create(validated_data)
        self._sync_ledger_entry(instance)
        return instance

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        self._sync_ledger_entry(instance)
        return instance

    def _sync_ledger_entry(self, instance):
        # 1:1 per advance, not a trip-level sync like wage_entry/settlement -
        # each TripAdvance is already its own row, so it just owns one entry.
        if instance.ledger_entry_id:
            entry = instance.ledger_entry
            entry.date = instance.date
            entry.amount = instance.amount
            entry.payment_mode = instance.payment_mode
            entry.remarks = f"Trip advance{f' — {instance.remarks}' if instance.remarks else ''}"
            entry.save()
        else:
            entry = DriverLedgerEntry.objects.create(
                driver=instance.trip_sheet.driver, trip_sheet=instance.trip_sheet, date=instance.date,
                entry_type=LedgerEntryType.ADVANCE, payment_mode=instance.payment_mode, amount=instance.amount,
                remarks=f"Trip advance{f' — {instance.remarks}' if instance.remarks else ''}",
            )
            instance.ledger_entry = entry
            instance.save()


class TripExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripExpense
        fields = [
            "id", "trip_sheet", "expense_head", "paid_from", "amount", "vendor",
            "litres", "rate_per_litre", "notes", "date", "fuel_log", "expense",
        ]
        read_only_fields = ["id", "fuel_log", "expense"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Enter an amount greater than zero.")
        return value

    def validate(self, attrs):
        expense_head = attrs.get("expense_head", getattr(self.instance, "expense_head", None))
        litres = attrs.get("litres", getattr(self.instance, "litres", None))
        rate_per_litre = attrs.get("rate_per_litre", getattr(self.instance, "rate_per_litre", None))
        if expense_head is not None and expense_head.slug == "fuel":
            if litres is None or rate_per_litre is None:
                raise serializers.ValidationError(
                    {"litres": "Enter litres and rate/litre for a fuel expense."}
                )
        return attrs

    def create(self, validated_data):
        instance = super().create(validated_data)
        self._sync_posting(instance)
        return instance

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        self._sync_posting(instance)
        return instance

    def _sync_posting(self, instance):
        from .services import sync_trip_expense_posting

        sync_trip_expense_posting(instance)


class TripSheetSerializer(serializers.ModelSerializer):
    legs = TripLegSerializer(many=True, read_only=True)
    work_items = WorkItemSerializer(many=True, read_only=True)
    advances = TripAdvanceSerializer(many=True, read_only=True)
    trip_expenses = TripExpenseSerializer(many=True, read_only=True)
    distance_covered = serializers.DecimalField(max_digits=12, decimal_places=1, read_only=True)
    total_freight = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    card_type = serializers.CharField(read_only=True)
    total_km = serializers.DecimalField(max_digits=12, decimal_places=1, read_only=True)
    loaded_km = serializers.DecimalField(max_digits=12, decimal_places=1, read_only=True)
    empty_km = serializers.DecimalField(max_digits=12, decimal_places=1, read_only=True)
    empty_running_pct = serializers.DecimalField(
        max_digits=5, decimal_places=1, read_only=True, allow_null=True
    )
    idle_hours = serializers.DecimalField(max_digits=10, decimal_places=1, read_only=True, allow_null=True)
    idle_pct = serializers.DecimalField(max_digits=5, decimal_places=1, read_only=True, allow_null=True)
    total_advance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    expenses_paid_from_advance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    driver_own_expenses_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    company_direct_expenses_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    reconciliation_variance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    is_reconciled = serializers.BooleanField(read_only=True)
    reimbursement_due = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    # Write-only: what the auto-created wage_entry should pay - only used
    # (and required) when the assigned driver is paid per-trip, since
    # there's no fixed Driver.wage_amount to fall back on for them (see
    # drivers.DriverSerializer.validate()). Mirrors the amount/expense_amount
    # pattern used everywhere else in this codebase (e.g.
    # maintenance.MaintenanceLogSerializer).
    driver_wage_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, write_only=True
    )
    wage_amount = serializers.SerializerMethodField()
    # Read-side mirror of TripSheetTransitionPermission's three rules - the
    # frontend can't safely re-derive "is this manager specifically
    # delegated approve_close" from the generic permission grid (a
    # manager's ROLE_DEFAULTS change_status on trip_work_cards is already
    # True for unrelated reasons - see operations.permissions.
    # _delegated_approve_close's docstring), so it's computed here instead
    # of faked client-side.
    can_submit = serializers.SerializerMethodField()
    can_approve_close = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = TripSheet
        fields = [
            "id", "vehicle", "driver", "trip_no", "date", "opening_meter", "closing_meter",
            "status", "remarks", "legs", "work_items", "distance_covered", "total_freight", "card_type",
            "total_km", "loaded_km", "empty_km", "empty_running_pct",
            "working_hours", "idle_hours", "idle_pct",
            "driver_wage_amount", "wage_amount", "wage_entry",
            "advances", "trip_expenses", "total_advance", "expenses_paid_from_advance",
            "driver_own_expenses_total", "company_direct_expenses_total",
            "reconciliation_variance", "is_reconciled", "reimbursement_due",
            "returned_amount", "returned_received_by", "returned_date",
            "reimbursed_amount", "reimbursed_date", "reconciliation_override_reason",
            "can_submit", "can_approve_close", "can_cancel",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "trip_no", "status", "wage_entry", "reconciliation_override_reason", "created_at", "updated_at",
        ]

    def get_wage_amount(self, obj):
        return obj.wage_entry.amount if obj.wage_entry_id else None

    def _request_user(self):
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return None
        return request.user

    def get_can_submit(self, obj):
        from .permissions import _driver_id_for

        user = self._request_user()
        if user is None or obj.status != TripSheetStatus.DRAFT:
            return False
        if user.role in (Role.OWNER, Role.ADMIN, Role.MANAGER):
            return True
        return user.role == Role.DRIVER and _driver_id_for(obj) == user.driver_id

    def get_can_approve_close(self, obj):
        from .permissions import _delegated_approve_close

        user = self._request_user()
        if user is None or obj.status != TripSheetStatus.SUBMITTED:
            return False
        if user.role in (Role.OWNER, Role.ADMIN):
            return True
        return user.role == Role.MANAGER and _delegated_approve_close(user)

    def get_can_cancel(self, obj):
        user = self._request_user()
        if user is None:
            return False
        if obj.status in (TripSheetStatus.APPROVED, TripSheetStatus.CLOSED):
            return False
        return obj.created_by_id == user.id

    def validate(self, attrs):
        driver = attrs.get("driver", getattr(self.instance, "driver", None))
        driver_wage_amount = attrs.get("driver_wage_amount")
        if driver and driver.wage_basis == WageBasis.PER_TRIP:
            has_wage_entry = self.instance is not None and self.instance.wage_entry_id
            if driver_wage_amount is None and not has_wage_entry:
                raise serializers.ValidationError(
                    {"driver_wage_amount": f"{driver.name} is paid per trip - enter what this trip pays."}
                )
        return attrs

    def create(self, validated_data):
        from django.db import IntegrityError, transaction

        from .services import generate_trip_no

        driver_wage_amount = validated_data.pop("driver_wage_amount", None)
        # Assigned server-side, never taken from the client - see
        # generate_trip_no's docstring. A concurrent create in the same
        # org/type/month is rare for one fleet's trip volume, but retried
        # once against the unique constraint rather than assumed away.
        for attempt in range(2):
            validated_data["trip_no"] = generate_trip_no(validated_data["vehicle"], validated_data["date"])
            try:
                with transaction.atomic():
                    instance = super().create(validated_data)
                break
            except IntegrityError:
                if attempt == 1:
                    raise
        self._sync_wage_entry(instance, driver_wage_amount)
        return instance

    def update(self, instance, validated_data):
        driver_wage_amount = validated_data.pop("driver_wage_amount", None)
        settlement_touched = "returned_amount" in validated_data or "reimbursed_amount" in validated_data
        instance = super().update(instance, validated_data)
        self._sync_wage_entry(instance, driver_wage_amount)
        if settlement_touched:
            from .services import sync_advance_return_entry, sync_reimbursement_entry

            sync_advance_return_entry(instance)
            sync_reimbursement_entry(instance)
        return instance

    def _sync_wage_entry(self, instance, amount):
        if instance.driver.wage_basis != WageBasis.PER_TRIP or amount is None:
            # Not a per-trip driver, or this save didn't touch the wage
            # (e.g. just adding a leg) - an existing wage_entry is left as
            # the last recorded amount rather than guessed at.
            return

        if instance.wage_entry_id:
            entry = instance.wage_entry
            entry.driver = instance.driver
            entry.date = instance.date
            entry.amount = amount
            entry.save()
        else:
            entry = DriverLedgerEntry.objects.create(
                driver=instance.driver, trip_sheet=instance, date=instance.date,
                entry_type=LedgerEntryType.WAGE, subtype=EarningSubtype.SALARY, amount=amount,
                remarks="Per-trip wage",
            )
            instance.wage_entry = entry
            instance.save()


# Every field a fuel entry can actually change while open. Locked outright
# once status leaves draft - see FuelLogSerializer.validate() - mirrors
# economics.serializers._LOCKED_WHEN_SOURCED's "deliberately explicit
# rather than everything-not-read-only" reasoning.
_FUEL_LOG_LOCKED_AFTER_SUBMIT = {
    "vehicle", "driver", "filled_by", "trip_sheet", "date", "litres", "rate_per_litre", "odometer",
    "fuel_station", "is_full_tank",
}


class FuelLogSerializer(serializers.ModelSerializer):
    # None when there's no fuel station to pay; True/False once there is
    # one. Derived from the vendor ledger - see vendors.services.is_paid.
    is_paid = serializers.SerializerMethodField()

    class Meta:
        model = FuelLog
        fields = [
            "id", "vehicle", "driver", "filled_by", "trip_sheet", "date", "litres", "rate_per_litre",
            "amount", "odometer", "fuel_station", "is_full_tank", "is_paid",
            "status", "approval_note", "created_by",
        ]
        read_only_fields = ["id", "amount", "is_paid", "status", "approval_note", "created_by"]

    def validate(self, attrs):
        # Once submitted, the source-of-truth fields are frozen - checked
        # first, so the error is about the lock, not a coincidentally-
        # missing driver on a row that couldn't be edited either way. A
        # correction has to go through Reject (with a reason) and a fresh
        # entry, not a silent edit underneath a decision already made.
        if self.instance is not None and self.instance.status != "draft" and (_FUEL_LOG_LOCKED_AFTER_SUBMIT & set(attrs)):
            raise serializers.ValidationError(
                f"This fuel entry is {self.instance.get_status_display()} and can't be edited — "
                "only an open entry can be changed."
            )

        # Nullable in the DB (see FuelLog.driver's docstring) but required
        # at this layer for every new/edited entry - same "won't crash
        # historical data, but never silently skippable going forward"
        # shape as TyreService.billing.
        driver = attrs.get("driver", getattr(self.instance, "driver_id", None))
        if not driver:
            raise serializers.ValidationError({"driver": "Select which driver this fuel entry is for."})
        filled_by = (attrs.get("filled_by", getattr(self.instance, "filled_by", "")) or "").strip()
        if not filled_by:
            raise serializers.ValidationError({"filled_by": "Say who actually filled the tank."})
        return attrs

    def get_is_paid(self, obj):
        if not obj.fuel_station_id:
            return None
        from vendors.services import is_paid

        return is_paid("FuelLog", obj.id)


class DriverLedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = DriverLedgerEntry
        fields = [
            "id", "driver", "trip_sheet", "date", "entry_type", "subtype", "payment_mode",
            "amount", "remarks",
        ]
        read_only_fields = ["id"]
