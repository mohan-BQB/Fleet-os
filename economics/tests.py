from decimal import Decimal

from django.db import IntegrityError
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Organization, Role, User
from core.tenancy import clear, set_current_tenant, set_current_user

from .models import Expense, ExpenseHead, ExpenseSourceType
from .serializers import ExpenseSerializer
from .services import seed_expense_heads, sync_linked_expense


class ExpenseHeadModelTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Fleet")
        self.user = User.objects.create_user(
            username="owner1", email="owner1@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        seed_expense_heads(self.org)
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.addCleanup(clear)

    def test_seeded_heads_cover_all_four_groups(self):
        groups = set(ExpenseHead.objects.values_list("group", flat=True))
        self.assertEqual(groups, {"running", "load", "tyre_service", "repairs"})
        self.assertEqual(ExpenseHead.objects.count(), 23)

    def test_seeding_is_idempotent(self):
        seed_expense_heads(self.org)
        self.assertEqual(ExpenseHead.objects.count(), 23)

    def test_expense_head_has_no_delete(self):
        head = ExpenseHead.objects.get(slug="fuel")
        with self.assertRaises(PermissionError):
            head.delete()

    def test_expense_requires_expense_head(self):
        with self.assertRaises(IntegrityError):
            Expense.objects.create(date="2026-08-01", amount=100)

    def test_expense_vendor_bill_note_uses_head_name(self):
        from vendors.models import Vendor, VendorType

        vendor = Vendor.objects.create(name="Test Garage", vendor_type=VendorType.GARAGE)
        head = ExpenseHead.objects.get(slug="general_repairs")
        Expense.objects.create(date="2026-08-01", amount=500, expense_head=head, vendor=vendor)
        entry = vendor.ledger_entries.first()
        self.assertIsNotNone(entry)
        self.assertIn("General repairs", entry.remarks)


class ExpenseHeadApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Fleet API")
        self.user = User.objects.create_user(
            username="owner2", email="owner2@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        seed_expense_heads(self.org)
        self.client = APIClient()
        # Real session login, not force_authenticate() - CurrentTenantMiddleware
        # reads request.user off Django's own AuthenticationMiddleware, which
        # force_authenticate() (a DRF-only shortcut) never touches, so the
        # tenant/org would silently stay unset for every write in the test.
        self.client.login(username="owner2", password="x")

    def test_delete_is_not_allowed(self):
        set_current_tenant(self.org)
        head = ExpenseHead.objects.get(slug="fuel")
        clear()
        resp = self.client.delete(f"/api/economics/expense-heads/{head.id}/")
        self.assertEqual(resp.status_code, 405)

    def test_list_returns_seeded_heads(self):
        resp = self.client.get("/api/economics/expense-heads/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 23)

    def test_create_new_head(self):
        resp = self.client.post(
            "/api/economics/expense-heads/",
            {"name": "Ferry crossing", "group": "running", "slug": "ferry_crossing"},
        )
        self.assertEqual(resp.status_code, 201, resp.data)


class ExpenseSourceTests(TestCase):
    """Masters -> Expense -> All expenses traces where each row actually
    came from, regardless of which screen created it."""

    def setUp(self):
        self.org = Organization.objects.create(name="Expense Source Co")
        self.user = User.objects.create_user(
            username="owner3", email="owner3@test.local", password="x", organization=self.org, role=Role.OWNER,
        )
        seed_expense_heads(self.org)
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.addCleanup(clear)

    def test_direct_entry_source(self):
        head = ExpenseHead.objects.get(slug="permit_fee")
        expense = Expense.objects.create(date="2026-08-01", amount=500, expense_head=head)
        self.assertEqual(ExpenseSerializer(expense).data["source"], "direct")

    def test_tyre_service_source(self):
        # Goes through TyreServiceSerializer, not a bare .objects.create()
        # with expense= pre-set - that's not how a TyreService is ever
        # actually created (TyreServiceViewSet is the only write surface),
        # and source_type is only ever populated by the real sync path
        # (economics.services.sync_linked_expense), not derived structurally
        # from the FK the way the old reverse-scan get_source() was.
        from vehicles.models import Vehicle
        from tyres.models import Tyre, TyreServiceType
        from tyres.serializers import TyreServiceSerializer

        vehicle = Vehicle.objects.create(
            registration_number="TN-05-EE-0001", category="lorry", number_of_tyres=6, spare_tyres=1,
        )
        tyre = Tyre.objects.create(vehicle=vehicle, position="FL", brand="MRF", status="fitted")
        serializer = TyreServiceSerializer(data={
            "vehicle": str(vehicle.id), "tyre": str(tyre.id), "service_type": TyreServiceType.ALIGNMENT,
            "date": "2026-08-01", "performed_by": "external", "billing": "paid",
            "unlisted_vendor_name": "Local tyre shop", "amount": "400",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        instance = serializer.save()
        self.assertIsNotNone(instance.expense_id)
        self.assertEqual(ExpenseSerializer(instance.expense).data["source"], "tyre_service")


class ExpenseLockTests(TestCase):
    """Once source_type is set, ExpenseSerializer must refuse to touch the
    locked fields directly - the source record is the only place a
    correction sticks (see economics.services.sync_linked_expense's
    docstring, and the ExpenseSerializer.validate belt-and-suspenders note)."""

    def setUp(self):
        self.org = Organization.objects.create(name="Expense Lock Co")
        self.user = User.objects.create_user(
            username="owner4", email="owner4@test.local", password="x", organization=self.org, role=Role.OWNER,
        )
        seed_expense_heads(self.org)
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.addCleanup(clear)

    def _sourced_expense(self):
        from vehicles.models import Vehicle
        from maintenance.models import MaintenanceLog

        vehicle = Vehicle.objects.create(registration_number="TN-05-EE-0002", category="lorry")
        head = ExpenseHead.objects.get(slug="general_repairs")
        log = MaintenanceLog.objects.create(vehicle=vehicle, date="2026-08-01", work_type="consumable")
        return sync_linked_expense(
            source=log, link_field="expense", vehicle=vehicle, expense_head=head,
            date="2026-08-01", amount=Decimal("300"), vendor=None, notes="test",
            source_type=ExpenseSourceType.MAINTENANCE_LABOUR,
        ), log

    def test_direct_entry_stays_fully_editable(self):
        head = ExpenseHead.objects.get(slug="permit_fee")
        expense = Expense.objects.create(date="2026-08-01", amount=500, expense_head=head)
        serializer = ExpenseSerializer(expense, data={"amount": "600"}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        self.assertEqual(updated.amount, Decimal("600"))

    def test_sourced_expense_rejects_locked_field_edit(self):
        expense, _log = self._sourced_expense()
        serializer = ExpenseSerializer(expense, data={"amount": "999"}, partial=True)
        self.assertFalse(serializer.is_valid())
        expense.refresh_from_db()
        self.assertEqual(expense.amount, Decimal("300"))

    def test_sourced_expense_survives_internal_resync(self):
        # A second call as the source record's own save() would make it
        # (e.g. editing the MaintenanceLog's cost) must still go through -
        # the lock is on ExpenseSerializer/the API, not on the model, so the
        # system re-syncing its own linked row is unaffected.
        expense, log = self._sourced_expense()
        resynced = sync_linked_expense(
            source=log, link_field="expense", vehicle=log.vehicle,
            expense_head=expense.expense_head, date="2026-08-01", amount=Decimal("350"),
            vendor=None, notes="updated", source_type=ExpenseSourceType.MAINTENANCE_LABOUR,
        )
        self.assertEqual(resynced.id, expense.id)
        self.assertEqual(resynced.amount, Decimal("350"))
        self.assertEqual(Expense.objects.filter(source_id=log.id).count(), 1)

    def test_sourced_expense_can_still_be_marked_paid(self):
        # mark_paid is a different action from editing amount/vendor/date -
        # stays available on a locked row (see ExpenseViewSet.mark_paid).
        from vendors.models import Vendor, VendorType
        from vendors.services import mark_paid

        vendor = Vendor.objects.create(name="Test Garage", vendor_type=VendorType.GARAGE)
        expense, _log = self._sourced_expense()
        expense.vendor = vendor
        expense.save()
        entry = mark_paid(vendor, "2026-08-02", expense.amount, "test", "Expense", expense.id, payment_mode="cash")
        self.assertIsNotNone(entry)


class ExpenseUnlistedVendorTests(TestCase):
    """A direct entry can name a one-off payee not in the Vendor master,
    same mutually-exclusive-with-vendor idiom as MaintenanceLog/TyreService/
    PartStockMovement's own unlisted_vendor_name (ExpenseSerializer.
    validate())."""

    def setUp(self):
        self.org = Organization.objects.create(name="Unlisted Vendor Co")
        self.user = User.objects.create_user(
            username="owner6", email="owner6@test.local", password="x", organization=self.org, role=Role.OWNER,
        )
        seed_expense_heads(self.org)
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.addCleanup(clear)

    def test_vendor_and_unlisted_name_together_rejected(self):
        from vendors.models import Vendor, VendorType

        vendor = Vendor.objects.create(name="Test Garage", vendor_type=VendorType.GARAGE)
        head = ExpenseHead.objects.get(slug="general_repairs")
        serializer = ExpenseSerializer(data={
            "expense_head": str(head.id), "date": "2026-08-01", "amount": "400",
            "vendor": str(vendor.id), "unlisted_vendor_name": "Roadside Garage",
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn("unlisted_vendor_name", serializer.errors)

    def test_unlisted_vendor_name_alone_is_valid(self):
        head = ExpenseHead.objects.get(slug="general_repairs")
        serializer = ExpenseSerializer(data={
            "expense_head": str(head.id), "date": "2026-08-01", "amount": "400",
            "unlisted_vendor_name": "Roadside Garage",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        expense = serializer.save()
        self.assertIsNone(expense.vendor)
        self.assertEqual(expense.unlisted_vendor_name, "Roadside Garage")

    def test_unlisted_vendor_expense_can_be_marked_paid(self):
        # No Vendor row to post a payable ledger entry against - settles
        # directly on the Expense's own paid/payment_mode/paid_date fields
        # instead (see Expense.paid's docstring and ExpenseViewSet.mark_paid).
        head = ExpenseHead.objects.get(slug="general_repairs")
        expense = Expense.objects.create(
            date="2026-08-01", amount=400, expense_head=head, unlisted_vendor_name="Roadside Garage",
        )
        client = APIClient()
        client.login(username="owner6", password="x")
        resp = client.post(f"/api/economics/expenses/{expense.id}/mark_paid/", {"payment_mode": "cash"})
        self.assertEqual(resp.status_code, 200, resp.data)
        expense.refresh_from_db()
        self.assertTrue(expense.paid)
        self.assertEqual(expense.payment_mode, "cash")


class ExpenseApprovalTests(TestCase):
    """Every expense starts pending and needs an explicit approve/reject by
    owner/admin, or a user specifically delegated expenses/change_status -
    mirrors TripSheet's approve_close delegation model (core/permissions.py
    already gives change_status on `expenses` to owner/admin only by
    default, so no bespoke delegation helper is needed - see the plan)."""

    def setUp(self):
        self.org = Organization.objects.create(name="Expense Approval Co")
        self.owner = User.objects.create_user(
            username="owner5", email="owner5@test.local", password="x", organization=self.org, role=Role.OWNER,
        )
        self.manager = User.objects.create_user(
            username="manager5", email="manager5@test.local", password="x", organization=self.org, role=Role.MANAGER,
        )
        seed_expense_heads(self.org)
        set_current_tenant(self.org)
        set_current_user(self.owner)
        self.addCleanup(clear)

    def _expense(self):
        head = ExpenseHead.objects.get(slug="permit_fee")
        return Expense.objects.create(date="2026-08-01", amount=500, expense_head=head)

    def test_new_expense_starts_pending(self):
        self.assertEqual(self._expense().approval_status, "pending")

    def test_owner_can_approve(self):
        expense = self._expense()
        client = APIClient()
        client.login(username="owner5", password="x")
        resp = client.post(f"/api/economics/expenses/{expense.id}/approve/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["approval_status"], "approved")

    def test_cannot_approve_twice(self):
        expense = self._expense()
        client = APIClient()
        client.login(username="owner5", password="x")
        client.post(f"/api/economics/expenses/{expense.id}/approve/")
        resp = client.post(f"/api/economics/expenses/{expense.id}/approve/")
        self.assertEqual(resp.status_code, 400)

    def test_reject_requires_a_note(self):
        expense = self._expense()
        client = APIClient()
        client.login(username="owner5", password="x")
        resp = client.post(f"/api/economics/expenses/{expense.id}/reject/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("approval_note", resp.data)

    def test_reject_with_note_succeeds(self):
        expense = self._expense()
        client = APIClient()
        client.login(username="owner5", password="x")
        resp = client.post(f"/api/economics/expenses/{expense.id}/reject/", {"approval_note": "Duplicate entry"})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["approval_status"], "rejected")
        self.assertEqual(resp.data["approval_note"], "Duplicate entry")

    def test_manager_cannot_approve_without_delegation(self):
        expense = self._expense()
        client = APIClient()
        client.login(username="manager5", password="x")
        resp = client.post(f"/api/economics/expenses/{expense.id}/approve/")
        self.assertEqual(resp.status_code, 403)

    def test_manager_can_approve_when_delegated(self):
        from core.models import Permission, PermissionAction

        expense = self._expense()
        Permission.objects.create(
            organization=self.org, user=self.manager, section="expenses",
            action=PermissionAction.CHANGE_STATUS, allowed=True,
        )
        client = APIClient()
        client.login(username="manager5", password="x")
        resp = client.post(f"/api/economics/expenses/{expense.id}/approve/")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_manager_cannot_approve_own_entry_even_when_delegated(self):
        # Delegation grants the section-level capability; it doesn't grant
        # approving your own record - see core.permissions.is_self_approval.
        from core.models import Permission, PermissionAction

        Permission.objects.create(
            organization=self.org, user=self.manager, section="expenses",
            action=PermissionAction.CHANGE_STATUS, allowed=True,
        )
        manager_client = APIClient()
        manager_client.login(username="manager5", password="x")
        head = ExpenseHead.objects.get(slug="permit_fee")
        created = manager_client.post(
            "/api/economics/expenses/", {"expense_head": str(head.id), "date": "2026-08-01", "amount": "500"},
        ).data
        resp = manager_client.post(f"/api/economics/expenses/{created['id']}/approve/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("own entry", str(resp.data))

    def test_locked_sourced_expense_can_still_be_approved(self):
        # Approval is orthogonal to the source-lock (see ExpenseLockTests) -
        # a system-posted row can still be approved/rejected even though
        # its amount/vendor/etc. can't be edited directly.
        from vehicles.models import Vehicle
        from maintenance.models import MaintenanceLog

        vehicle = Vehicle.objects.create(registration_number="TN-05-EE-0009", category="lorry")
        head = ExpenseHead.objects.get(slug="general_repairs")
        log = MaintenanceLog.objects.create(vehicle=vehicle, date="2026-08-01", work_type="consumable")
        expense = sync_linked_expense(
            source=log, link_field="expense", vehicle=vehicle, expense_head=head,
            date="2026-08-01", amount=Decimal("300"), vendor=None, notes="test",
            source_type=ExpenseSourceType.MAINTENANCE_LABOUR,
        )
        client = APIClient()
        client.login(username="owner5", password="x")
        resp = client.post(f"/api/economics/expenses/{expense.id}/approve/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["approval_status"], "approved")
