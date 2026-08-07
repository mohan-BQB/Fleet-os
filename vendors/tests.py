from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Organization, Role, User
from core.tenancy import clear, set_current_tenant, set_current_user

from .models import Vendor, VendorType


class VendorLifecycleTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Vendor Lifecycle Co")
        self.user = User.objects.create_user(
            username="vend_owner", email="vend_owner@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.addCleanup(clear)
        self.vendor = Vendor.objects.create(name="Balaji Tyre Works", vendor_type=VendorType.TYRE_SHOP)

    def test_no_hard_delete(self):
        with self.assertRaises(PermissionError):
            self.vendor.delete()

    def test_retire_then_activate(self):
        self.vendor.retire()
        self.vendor.refresh_from_db()
        self.assertEqual(self.vendor.status, "inactive")

        self.vendor.activate()
        self.vendor.refresh_from_db()
        self.assertEqual(self.vendor.status, "active")


class VendorApiLifecycleTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Vendor API Lifecycle Co")
        self.user = User.objects.create_user(
            username="vend_owner2", email="vend_owner2@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.vendor = Vendor.objects.create(name="RS Motors Garage", vendor_type=VendorType.GARAGE)
        clear()
        self.client = APIClient()
        self.client.login(username="vend_owner2", password="x")

    def test_delete_retires_not_deletes(self):
        resp = self.client.delete(f"/api/vendors/{self.vendor.id}/")
        self.assertEqual(resp.status_code, 204)
        self.vendor.refresh_from_db()
        self.assertEqual(self.vendor.status, "inactive")

    def test_activate_action(self):
        self.vendor.retire()
        resp = self.client.post(f"/api/vendors/{self.vendor.id}/activate/", {})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "active")
