"""Previously untested: TyreServiceSerializer posts to the Expense ledger as
a side effect of saving, via two independent syncs - the fitting/labour
charge and (for a replacement bought new) the tyre's own purchase cost. See
economics.services.sync_linked_expense, which both now share.
"""
from decimal import Decimal

from django.test import TestCase

from core.models import Organization, Role, User
from core.tenancy import clear, set_current_tenant, set_current_user
from economics.models import ExpenseSourceType
from economics.services import seed_expense_heads
from vehicles.models import Vehicle

from .models import Tyre, TyreServiceType
from .serializers import TyreServiceSerializer


class TyreServiceExpenseSyncTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Tyre Sync Co")
        self.user = User.objects.create_user(
            username="tyre_owner", email="tyre_owner@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        seed_expense_heads(self.org)
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.addCleanup(clear)
        self.vehicle = Vehicle.objects.create(
            registration_number="TN-07-AA-0001", category="lorry", number_of_tyres=6, spare_tyres=1,
        )
        self.tyre = Tyre.objects.create(vehicle=self.vehicle, position="FL", brand="MRF", status="fitted")

    def test_labour_charge_creates_linked_expense_with_source_type(self):
        serializer = TyreServiceSerializer(data={
            "vehicle": str(self.vehicle.id), "tyre": str(self.tyre.id), "service_type": TyreServiceType.ALIGNMENT,
            "date": "2026-08-01", "performed_by": "external", "billing": "paid",
            "unlisted_vendor_name": "Highway Tyres", "amount": "450",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        instance = serializer.save()
        self.assertIsNotNone(instance.expense_id)
        self.assertEqual(instance.expense.amount, Decimal("450"))
        self.assertEqual(instance.expense.source_type, ExpenseSourceType.TYRE_SERVICE_LABOUR)
        self.assertEqual(instance.expense.source_id, instance.id)

    def test_labour_charge_updates_linked_expense_in_place(self):
        serializer = TyreServiceSerializer(data={
            "vehicle": str(self.vehicle.id), "tyre": str(self.tyre.id), "service_type": TyreServiceType.BALANCING,
            "date": "2026-08-01", "performed_by": "internal", "billing": "paid",
            "unlisted_vendor_name": "Highway Tyres", "amount": "200",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        instance = serializer.save()
        first_expense_id = instance.expense_id

        update_serializer = TyreServiceSerializer(instance, data={"amount": "250"}, partial=True)
        self.assertTrue(update_serializer.is_valid(), update_serializer.errors)
        updated = update_serializer.save()
        self.assertEqual(updated.expense_id, first_expense_id)
        self.assertEqual(updated.expense.amount, Decimal("250"))
        # Still only one Expense row for this service, not a second one.
        self.assertEqual(instance.expense.__class__.objects.filter(source_id=instance.id).count(), 1)

    def test_internal_billing_creates_no_expense(self):
        serializer = TyreServiceSerializer(data={
            "vehicle": str(self.vehicle.id), "tyre": str(self.tyre.id), "service_type": TyreServiceType.INSPECTION,
            "date": "2026-08-01", "performed_by": "internal", "billing": "done_internally",
            "internal_note": "Checked by our own team",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        instance = serializer.save()
        self.assertIsNone(instance.expense_id)

    def test_new_tyre_purchase_posts_an_independent_expense(self):
        # Labour was internal (no labour Expense); the tyre's own purchase
        # cost is still a real, independent posting - two separate payees,
        # even when the fitting happens to also be free.
        spare = Tyre.objects.create(vehicle=self.vehicle, position="", brand="CEAT", status="spare")
        serializer = TyreServiceSerializer(data={
            "vehicle": str(self.vehicle.id), "tyre": str(spare.id), "previous_tyre": str(self.tyre.id),
            "service_type": TyreServiceType.REPLACEMENT, "date": "2026-08-01",
            "removal_reason": "worn_out", "tyre_source": "new_purchase",
            "tyre_unlisted_vendor_name": "Highway Tyres", "tyre_amount": "6000",
            "performed_by": "internal", "billing": "done_internally", "internal_note": "In-house fitting",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        instance = serializer.save()
        self.assertIsNone(instance.expense_id)
        self.assertIsNotNone(instance.tyre_expense_id)
        self.assertEqual(instance.tyre_expense.amount, Decimal("6000"))
        self.assertEqual(instance.tyre_expense.source_type, ExpenseSourceType.TYRE_PURCHASE)
        self.assertEqual(instance.tyre_expense.source_id, instance.id)
