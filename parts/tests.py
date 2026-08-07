from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Organization, Role, User
from core.tenancy import clear, set_current_tenant, set_current_user

from .models import PartInventoryItem


class PartInventoryItemLifecycleTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Parts Lifecycle Co")
        self.user = User.objects.create_user(
            username="parts_owner", email="parts_owner@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.addCleanup(clear)
        self.item = PartInventoryItem.objects.create(name="Brake pad set", unit="pair")

    def test_no_hard_delete(self):
        with self.assertRaises(PermissionError):
            self.item.delete()

    def test_retire_then_activate(self):
        self.item.retire()
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, "inactive")

        self.item.activate()
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, "active")


class PartInventoryItemApiLifecycleTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Parts API Lifecycle Co")
        self.user = User.objects.create_user(
            username="parts_owner2", email="parts_owner2@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.item = PartInventoryItem.objects.create(name="Air filter", unit="each")
        clear()
        self.client = APIClient()
        self.client.login(username="parts_owner2", password="x")

    def test_activate_action(self):
        self.item.retire()
        resp = self.client.post(f"/api/parts/inventory-items/{self.item.id}/activate/", {})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "active")
