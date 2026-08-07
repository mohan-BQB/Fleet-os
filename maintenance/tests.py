"""Previously untested: MaintenanceLogSerializer posts to the Expense ledger
as a side effect of saving, via two independent syncs - the labour charge
and (for a part bought new) the part's own purchase cost. See
economics.services.sync_linked_expense, which both now share.
"""
from decimal import Decimal

from django.test import TestCase

from core.models import Organization, Role, User
from core.tenancy import clear, set_current_tenant, set_current_user
from economics.models import ExpenseSourceType
from economics.services import seed_expense_heads
from vehicles.models import Vehicle

from .serializers import MaintenanceLogSerializer


class MaintenanceLogExpenseSyncTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Maintenance Sync Co")
        self.user = User.objects.create_user(
            username="maint_owner", email="maint_owner@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        seed_expense_heads(self.org)
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.addCleanup(clear)
        self.vehicle = Vehicle.objects.create(registration_number="TN-07-BB-0001", category="lorry")

    def test_labour_charge_creates_linked_expense_with_source_type(self):
        serializer = MaintenanceLogSerializer(data={
            "vehicle": str(self.vehicle.id), "part_name": "Brake service", "date": "2026-08-01",
            "work_type": "consumable", "performed_by": "external", "billing": "paid",
            "unlisted_vendor_name": "City Garage", "amount": "800",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        instance = serializer.save()
        self.assertIsNotNone(instance.expense_id)
        self.assertEqual(instance.expense.amount, Decimal("800"))
        self.assertEqual(instance.expense.source_type, ExpenseSourceType.MAINTENANCE_LABOUR)
        self.assertEqual(instance.expense.source_id, instance.id)

    def test_labour_charge_updates_linked_expense_in_place(self):
        serializer = MaintenanceLogSerializer(data={
            "vehicle": str(self.vehicle.id), "part_name": "Oil change", "date": "2026-08-01",
            "work_type": "consumable", "performed_by": "internal", "billing": "paid",
            "unlisted_vendor_name": "City Garage", "amount": "500",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        instance = serializer.save()
        first_expense_id = instance.expense_id

        update_serializer = MaintenanceLogSerializer(instance, data={"amount": "550"}, partial=True)
        self.assertTrue(update_serializer.is_valid(), update_serializer.errors)
        updated = update_serializer.save()
        self.assertEqual(updated.expense_id, first_expense_id)
        self.assertEqual(updated.expense.amount, Decimal("550"))
        self.assertEqual(instance.expense.__class__.objects.filter(source_id=instance.id).count(), 1)

    def test_new_part_purchase_posts_independent_expense(self):
        # Labour was internal (no labour Expense); the part's own purchase
        # cost is still a real, independent posting - same two-payees shape
        # as the tyre-purchase-vs-fitting split.
        serializer = MaintenanceLogSerializer(data={
            "vehicle": str(self.vehicle.id), "part_name": "Clutch plate", "date": "2026-08-01",
            "work_type": "part_replacement", "disposal_plan": "scrapped", "old_part_number": "CP-1234",
            "part_source": "new_purchase", "part_unlisted_vendor_name": "City Garage", "part_amount": "3200",
            "performed_by": "internal", "billing": "done_internally", "internal_note": "In-house fitting",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        instance = serializer.save()
        self.assertIsNone(instance.expense_id)
        self.assertIsNotNone(instance.part_expense_id)
        self.assertEqual(instance.part_expense.amount, Decimal("3200"))
        self.assertEqual(instance.part_expense.source_type, ExpenseSourceType.MAINTENANCE_PART)
        self.assertEqual(instance.part_expense.source_id, instance.id)
