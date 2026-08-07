from django.test import TestCase

from core.models import Organization, Role, User
from core.tenancy import clear, set_current_tenant, set_current_user

from .models import Customer


class CustomerLifecycleTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Customer Lifecycle Co")
        self.user = User.objects.create_user(
            username="cust_owner", email="cust_owner@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.addCleanup(clear)
        self.customer = Customer.objects.create(name="Sri Balaji Traders")

    def test_no_hard_delete(self):
        with self.assertRaises(PermissionError):
            self.customer.delete()

    def test_retire_then_activate(self):
        self.customer.retire(reason="No longer freighting with us")
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.status, "inactive")

        self.customer.activate(reason="Back in business")
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.status, "active")
