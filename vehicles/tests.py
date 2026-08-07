import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Organization, Role, User
from core.tenancy import clear, set_current_tenant, set_current_user

from .models import Vehicle, VehicleLoan, VehicleLoanInstallment, VehicleStatus
from .services import add_months, create_loan_with_schedule


class VehicleStatusTransitionTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Vehicle Status Test Co")
        self.user = User.objects.create_user(
            username="vowner", email="vowner@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.addCleanup(clear)
        self.vehicle = Vehicle.objects.create(
            registration_number="TN-01-AA-0001", category="lorry",
            number_of_tyres=6, spare_tyres=1,
        )

    def test_active_to_in_service_and_back(self):
        self.vehicle.mark_in_service(reason="Gearbox repair")
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.status, VehicleStatus.IN_SERVICE)

        self.vehicle.mark_active(reason="Repair complete")
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.status, VehicleStatus.ACTIVE)

    def test_mark_sold_captures_details_in_audit(self):
        from core.models import AuditLog

        self.vehicle.mark_sold(sold_date="2026-08-01", buyer="Ramesh Transports", sale_amount="450000")
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.status, VehicleStatus.SOLD)

        entry = AuditLog.objects.filter(object_id=str(self.vehicle.id)).order_by("-created_at").first()
        self.assertIn("buyer", entry.changes)
        self.assertEqual(entry.changes["buyer"][1], "Ramesh Transports")
        self.assertIn("sale_amount", entry.changes)

    def test_sold_is_terminal(self):
        self.vehicle.mark_sold(sold_date="2026-08-01")
        self.vehicle.refresh_from_db()
        with self.assertRaises(ValueError):
            self.vehicle.mark_active()

    def test_mark_scrapped_from_active(self):
        self.vehicle.mark_scrapped(scrap_date="2026-08-01", reason="Total loss")
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.status, VehicleStatus.SCRAPPED)

    def test_no_hard_delete(self):
        with self.assertRaises(PermissionError):
            self.vehicle.delete()


class VehicleStatusApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Vehicle Status API Co")
        self.user = User.objects.create_user(
            username="vowner2", email="vowner2@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        set_current_tenant(self.org)
        set_current_user(self.user)
        self.vehicle = Vehicle.objects.create(
            registration_number="TN-01-AA-0002", category="lorry",
            number_of_tyres=6, spare_tyres=1,
        )
        clear()
        self.client = APIClient()
        self.client.login(username="vowner2", password="x")

    def test_delete_is_not_allowed(self):
        resp = self.client.delete(f"/api/vehicles/{self.vehicle.id}/")
        self.assertEqual(resp.status_code, 405)

    def test_mark_sold_requires_sold_date(self):
        resp = self.client.post(f"/api/vehicles/{self.vehicle.id}/mark_sold/", {})
        self.assertEqual(resp.status_code, 400)

    def test_mark_sold_succeeds(self):
        resp = self.client.post(
            f"/api/vehicles/{self.vehicle.id}/mark_sold/",
            {"sold_date": "2026-08-01", "buyer": "Test Buyer", "sale_amount": "100000"},
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "sold")

    def test_invalid_transition_rejected(self):
        self.client.post(f"/api/vehicles/{self.vehicle.id}/mark_sold/", {"sold_date": "2026-08-01"})
        resp = self.client.post(f"/api/vehicles/{self.vehicle.id}/mark_active/", {})
        self.assertEqual(resp.status_code, 400)


class AddMonthsTests(TestCase):
    def test_simple_add(self):
        self.assertEqual(add_months(datetime.date(2026, 8, 2), 1), datetime.date(2026, 9, 2))

    def test_year_rollover(self):
        self.assertEqual(add_months(datetime.date(2026, 11, 15), 3), datetime.date(2027, 2, 15))

    def test_clamps_short_month(self):
        # Jan 31 + 1 month -> Feb 28 (2026 isn't a leap year), not an
        # overflow into March.
        self.assertEqual(add_months(datetime.date(2026, 1, 31), 1), datetime.date(2026, 2, 28))


class VehicleLoanTests(TestCase):
    """Cash-outflow tracking only - no Expense row, no P&L line. Schedule
    generated in full at creation, same recurring-pattern-as-real-rows
    choice maintenance.MaintenanceSchedule already makes."""

    def setUp(self):
        self.org = Organization.objects.create(name="Loan Test Co")
        self.owner = User.objects.create_user(
            username="loanowner", email="loanowner@test.local", password="x",
            organization=self.org, role=Role.OWNER,
        )
        set_current_tenant(self.org)
        set_current_user(self.owner)
        self.vehicle = Vehicle.objects.create(
            registration_number="TN-04-GG-0001", category="lorry", number_of_tyres=6, spare_tyres=1,
        )
        self.addCleanup(clear)

    def test_create_loan_generates_full_schedule(self):
        loan = create_loan_with_schedule(
            vehicle=self.vehicle, financier="ABC Finance", principal_amount=600000,
            tenure_months=12, emi_amount=55000, start_date=datetime.date(2026, 8, 1),
        )
        self.assertEqual(loan.installments.count(), 12)
        first = loan.installments.order_by("due_date").first()
        last = loan.installments.order_by("due_date").last()
        self.assertEqual(first.due_date, datetime.date(2026, 8, 1))
        self.assertEqual(last.due_date, datetime.date(2027, 7, 1))
        self.assertTrue(all(i.amount == 55000 for i in loan.installments.all()))
        self.assertEqual(loan.outstanding_installments, 12)

    def test_loan_does_not_create_expense_or_touch_pnl(self):
        from economics.models import Expense
        from economics.pnl import vehicle_pnl

        before = Expense.objects.count()
        create_loan_with_schedule(
            vehicle=self.vehicle, financier="ABC Finance", principal_amount=600000,
            tenure_months=6, emi_amount=100000, start_date=datetime.date(2026, 8, 1),
        )
        self.assertEqual(Expense.objects.count(), before)
        pnl = vehicle_pnl(self.vehicle, "2026-08-01", "2027-02-01")
        self.assertEqual(pnl["other_expenses"], 0)

    def test_mark_paid_via_api(self):
        loan = create_loan_with_schedule(
            vehicle=self.vehicle, financier="ABC Finance", principal_amount=600000,
            tenure_months=3, emi_amount=200000, start_date=datetime.date(2026, 8, 1),
        )
        installment = loan.installments.order_by("due_date").first()
        clear()
        client = APIClient()
        client.login(username="loanowner", password="x")
        resp = client.post(
            f"/api/vehicle-loan-installments/{installment.id}/mark_paid/",
            {"paid_date": "2026-08-05", "payment_mode": "bank"},
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["paid"])
        self.assertEqual(resp.data["payment_mode"], "bank")

    def test_installment_is_overdue_when_unpaid_past_due_date(self):
        loan = create_loan_with_schedule(
            vehicle=self.vehicle, financier="ABC Finance", principal_amount=600000,
            tenure_months=1, emi_amount=600000, start_date=datetime.date(2000, 1, 1),
        )
        installment = loan.installments.first()
        self.assertTrue(installment.is_overdue)
        installment.mark_paid()
        self.assertFalse(installment.is_overdue)

    def test_loan_create_endpoint_generates_schedule(self):
        clear()
        client = APIClient()
        client.login(username="loanowner", password="x")
        resp = client.post(
            "/api/vehicle-loans/",
            {
                "vehicle": str(self.vehicle.id), "financier": "XYZ Bank", "principal_amount": "500000",
                "tenure_months": "10", "emi_amount": "52000", "start_date": "2026-08-01",
            },
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(len(resp.data["installments"]), 10)

    def test_delete_is_not_allowed(self):
        loan = create_loan_with_schedule(
            vehicle=self.vehicle, financier="ABC Finance", principal_amount=600000,
            tenure_months=3, emi_amount=200000, start_date=datetime.date(2026, 8, 1),
        )
        with self.assertRaises(PermissionError):
            loan.delete()
        with self.assertRaises(PermissionError):
            VehicleLoanInstallment.objects.first().delete()
