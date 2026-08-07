from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Organization, Permission, Role, User
from core.permissions import can
from core.tenancy import clear, set_current_tenant, set_current_user
from vehicles.models import Vehicle


class RoleDefaultsTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Role Defaults Test Co")
        self.owner = User.objects.create_user(
            username="rd_owner", email="rd_owner@test.local", password="x", organization=self.org, role=Role.OWNER,
        )
        self.manager = User.objects.create_user(
            username="rd_manager", email="rd_manager@test.local", password="x",
            organization=self.org, role=Role.MANAGER,
        )
        self.accountant = User.objects.create_user(
            username="rd_accountant", email="rd_accountant@test.local", password="x",
            organization=self.org, role=Role.ACCOUNTANT,
        )
        self.driver = User.objects.create_user(
            username="rd_driver", email="rd_driver@test.local", password="x",
            organization=self.org, role=Role.DRIVER,
        )

    def test_owner_has_everything(self):
        self.assertTrue(can(self.owner, "vehicles", "change_status"))
        self.assertTrue(can(self.owner, "company_users", "add_edit"))

    def test_manager_cannot_change_vehicle_status(self):
        self.assertTrue(can(self.manager, "vehicles", "add_edit"))
        self.assertFalse(can(self.manager, "vehicles", "change_status"))
        self.assertTrue(can(self.manager, "trip_work_cards", "change_status"))  # can approve
        self.assertFalse(can(self.manager, "company_users"))

    def test_accountant_is_view_only_on_vehicles_but_full_on_expenses(self):
        self.assertTrue(can(self.accountant, "vehicles", "view"))
        self.assertFalse(can(self.accountant, "vehicles", "add_edit"))
        self.assertTrue(can(self.accountant, "expenses", "add_edit"))
        self.assertTrue(can(self.accountant, "money_box_settlement", "change_status"))

    def test_driver_has_no_section_grants(self):
        for section in ["vehicles", "drivers", "expenses", "trip_work_cards", "fuel_log", "reports"]:
            self.assertFalse(can(self.driver, section, "view"))

    def test_unauthenticated_denied(self):
        self.assertFalse(can(None, "vehicles", "view"))


class PermissionOverrideTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Override Test Co")
        self.manager = User.objects.create_user(
            username="ov_manager", email="ov_manager@test.local", password="x",
            organization=self.org, role=Role.MANAGER,
        )

    def test_user_override_beats_role_default(self):
        self.assertFalse(can(self.manager, "vehicles", "change_status"))
        Permission.objects.create(
            organization=self.org, user=self.manager, section="vehicles", action="change_status", allowed=True,
        )
        self.assertTrue(can(self.manager, "vehicles", "change_status"))

    def test_override_can_also_revoke_a_default_grant(self):
        self.assertTrue(can(self.manager, "vehicles", "add_edit"))
        Permission.objects.create(
            organization=self.org, user=self.manager, section="vehicles", action="add_edit", allowed=False,
        )
        self.assertFalse(can(self.manager, "vehicles", "add_edit"))

    def test_no_hard_delete_on_permission_rows(self):
        override = Permission.objects.create(
            organization=self.org, user=self.manager, section="vehicles", action="view", allowed=True,
        )
        with self.assertRaises(PermissionError):
            override.delete()


class PermissionApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Permission API Co")
        self.owner = User.objects.create_user(
            username="api_owner", email="api_owner@test.local", password="x", organization=self.org, role=Role.OWNER,
        )
        self.manager = User.objects.create_user(
            username="api_manager", email="api_manager@test.local", password="x",
            organization=self.org, role=Role.MANAGER,
        )
        set_current_tenant(self.org)
        set_current_user(self.owner)
        self.vehicle = Vehicle.objects.create(
            registration_number="TN-03-CC-0001", category="lorry", number_of_tyres=6, spare_tyres=1,
        )
        clear()

    def test_manager_gets_403_on_mark_sold_until_owner_grants_it(self):
        manager_client = APIClient()
        manager_client.login(username="api_manager", password="x")

        resp = manager_client.post(
            f"/api/vehicles/{self.vehicle.id}/mark_sold/", {"sold_date": "2026-08-01"},
        )
        self.assertEqual(resp.status_code, 403)

        owner_client = APIClient()
        owner_client.login(username="api_owner", password="x")
        resp = owner_client.post(
            "/api/auth/permissions/set/",
            {"user_id": str(self.manager.id), "section": "vehicles", "action": "change_status", "allowed": True},
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["permissions"]["vehicles"]["change_status"])

        resp = manager_client.post(
            f"/api/vehicles/{self.vehicle.id}/mark_sold/", {"sold_date": "2026-08-01"},
        )
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_manager_cannot_grant_permissions(self):
        manager_client = APIClient()
        manager_client.login(username="api_manager", password="x")
        resp = manager_client.post(
            "/api/auth/permissions/set/",
            {"user_id": str(self.manager.id), "section": "vehicles", "action": "change_status", "allowed": True},
        )
        self.assertEqual(resp.status_code, 403)

    def test_effective_endpoint(self):
        owner_client = APIClient()
        owner_client.login(username="api_owner", password="x")
        resp = owner_client.get(f"/api/auth/permissions/effective/?user={self.manager.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("vehicles", resp.data["permissions"])
        self.assertTrue(resp.data["permissions"]["vehicles"]["add_edit"])
        self.assertFalse(resp.data["permissions"]["vehicles"]["change_status"])


class ChangePasswordTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Change Password Co")
        self.user = User.objects.create_user(
            username="pw_user", email="pw_user@test.local", password="OldPass123!",
            organization=self.org, role=Role.OWNER,
        )
        self.client = APIClient()
        self.client.login(username="pw_user", password="OldPass123!")

    def test_wrong_old_password_rejected(self):
        resp = self.client.post(
            "/api/auth/change-password/", {"old_password": "wrong", "new_password": "NewPass456!"},
        )
        self.assertEqual(resp.status_code, 400)

    def test_change_password_succeeds_and_session_survives(self):
        resp = self.client.post(
            "/api/auth/change-password/", {"old_password": "OldPass123!", "new_password": "NewPass456!"},
        )
        self.assertEqual(resp.status_code, 204)
        # Session should still be valid (update_session_auth_hash) - a
        # follow-up authenticated call must not 401/403.
        resp = self.client.get("/api/auth/me/")
        self.assertEqual(resp.status_code, 200)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass456!"))


class CompanyProfilePermissionTests(TestCase):
    """Admin-only in the role defaults, but reachable by anyone the owner
    explicitly grants company_users.add_edit to via a Permission override -
    the same DB-override path PermissionApiTests exercises for Vehicle."""

    def setUp(self):
        self.org = Organization.objects.create(name="Company Profile Perm Co")
        self.owner = User.objects.create_user(
            username="cp_owner", email="cp_owner@test.local", password="x", organization=self.org, role=Role.OWNER,
        )
        self.manager = User.objects.create_user(
            username="cp_manager", email="cp_manager@test.local", password="x",
            organization=self.org, role=Role.MANAGER,
        )
        self.manager_client = APIClient()
        self.manager_client.login(username="cp_manager", password="x")

    def test_manager_cannot_edit_company_profile(self):
        resp = self.manager_client.patch(
            "/api/auth/company-profile/", {"legal_name": "Hijacked Co"}, content_type="application/json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_manager_can_edit_after_explicit_grant(self):
        owner_client = APIClient()
        owner_client.login(username="cp_owner", password="x")
        resp = owner_client.post(
            "/api/auth/permissions/set/",
            {"user_id": str(self.manager.id), "section": "company_users", "action": "add_edit", "allowed": True},
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        resp = self.manager_client.patch(
            "/api/auth/company-profile/", {"legal_name": "Velan Freight Carriers Pvt Ltd"}, content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["legal_name"], "Velan Freight Carriers Pvt Ltd")
