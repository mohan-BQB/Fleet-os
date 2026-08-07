from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Organization, Role, User
from core.tenancy import clear, set_current_tenant, set_current_user
from vehicles.models import Vehicle

from .models import Document, DocumentStatus


class DocumentRenewTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Doc Renew Test Co")
        self.user = User.objects.create_user(
            username="cowner", email="cowner@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.addCleanup(clear)
        self.vehicle = Vehicle.objects.create(
            registration_number="TN-02-BB-0001", category="lorry",
            number_of_tyres=6, spare_tyres=1,
        )
        self.doc = Document.objects.create(
            vehicle=self.vehicle, doc_type="insurance", doc_number="POL-1",
            valid_till="2026-07-15",
        )

    def test_renew_creates_new_row_and_archives_old(self):
        new_doc = self.doc.renew(valid_till="2027-07-15", doc_number="POL-2")
        self.doc.refresh_from_db()

        self.assertEqual(self.doc.status, DocumentStatus.ARCHIVED)
        self.assertEqual(new_doc.status, DocumentStatus.ACTIVE)
        self.assertEqual(new_doc.doc_number, "POL-2")
        self.assertEqual(new_doc.vehicle_id, self.vehicle.id)
        self.assertEqual(new_doc.doc_type, self.doc.doc_type)
        # Old row untouched apart from status - still shows what it covered.
        self.assertEqual(self.doc.doc_number, "POL-1")
        self.assertEqual(str(self.doc.valid_till), "2026-07-15")

    def test_archived_document_excluded_from_needs_attention(self):
        self.assertIn(self.doc, Document.objects.needs_attention())
        self.doc.renew(valid_till="2027-07-15")
        self.assertNotIn(self.doc, Document.objects.needs_attention())

    def test_no_hard_delete(self):
        with self.assertRaises(PermissionError):
            self.doc.delete()

    def test_documents_are_tenant_scoped(self):
        other_org = Organization.objects.create(name="Other Org")
        set_current_tenant(other_org)
        self.assertEqual(Document.objects.count(), 0)
        set_current_tenant(self.org)
        self.assertEqual(Document.objects.count(), 1)


class DocumentRenewApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Doc Renew API Co")
        self.user = User.objects.create_user(
            username="cowner2", email="cowner2@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.vehicle = Vehicle.objects.create(
            registration_number="TN-02-BB-0002", category="lorry",
            number_of_tyres=6, spare_tyres=1,
        )
        self.doc = Document.objects.create(
            vehicle=self.vehicle, doc_type="permit", doc_number="PM-1", valid_till="2026-07-15",
        )
        clear()
        self.client = APIClient()
        self.client.login(username="cowner2", password="x")

    def test_renew_requires_valid_till(self):
        resp = self.client.post(f"/api/compliance/documents/{self.doc.id}/renew/", {})
        self.assertEqual(resp.status_code, 400)

    def test_renew_succeeds(self):
        resp = self.client.post(
            f"/api/compliance/documents/{self.doc.id}/renew/", {"valid_till": "2027-07-15"},
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["status"], "active")
