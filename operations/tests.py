from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Organization, Permission, PermissionAction, Role, User
from core.tenancy import clear, set_current_tenant, set_current_user
from drivers.models import Driver
from vehicles.models import Vehicle

from .models import TripAdvance, TripLeg, TripSheet, TripSheetStatus
from .services import generate_trip_no


class DriverOwnTripSheetCarveoutTests(TestCase):
    """OwnRecordsPermission's driver carve-out (own trip sheets only) - a
    driver has no `trip_work_cards` section grant at all in ROLE_DEFAULTS,
    so this whole path only works via the object/queryset-level fallback in
    operations.permissions, not the ordinary section check."""

    def setUp(self):
        self.org = Organization.objects.create(name="Driver Carveout Co")
        set_current_tenant(self.org)
        self.driver1 = Driver.objects.create(code="DRV-01", name="Driver One")
        self.driver2 = Driver.objects.create(code="DRV-02", name="Driver Two")
        self.vehicle = Vehicle.objects.create(
            registration_number="TN-04-DD-0001", category="lorry", number_of_tyres=6, spare_tyres=1,
        )
        self.user1 = User.objects.create_user(
            username="driver1", email="d1@test.local", password="x",
            organization=self.org, role=Role.DRIVER, driver_id=self.driver1.id,
        )
        User.objects.create_user(
            username="driver2", email="d2@test.local", password="x",
            organization=self.org, role=Role.DRIVER, driver_id=self.driver2.id,
        )
        set_current_user(self.user1)
        self.ts1 = TripSheet.objects.create(vehicle=self.vehicle, driver=self.driver1, date="2026-08-01", opening_meter=100)
        self.ts2 = TripSheet.objects.create(vehicle=self.vehicle, driver=self.driver2, date="2026-08-01", opening_meter=200)
        clear()
        self.client1 = APIClient()
        self.client1.login(username="driver1", password="x")

    def test_driver_only_lists_own_trip_sheets(self):
        resp = self.client1.get("/api/operations/trip-sheets/")
        self.assertEqual(resp.status_code, 200)
        ids = [row["id"] for row in resp.data]
        self.assertIn(str(self.ts1.id), ids)
        self.assertNotIn(str(self.ts2.id), ids)

    def test_driver_cannot_fetch_another_drivers_trip_sheet(self):
        resp = self.client1.get(f"/api/operations/trip-sheets/{self.ts2.id}/")
        self.assertEqual(resp.status_code, 404)

    def test_driver_can_create_own_trip_sheet(self):
        resp = self.client1.post(
            "/api/operations/trip-sheets/",
            {"vehicle": str(self.vehicle.id), "date": "2026-08-02", "opening_meter": "150", "remarks": ""},
        )
        self.assertEqual(resp.status_code, 201, resp.data)


class TripNoGenerationTests(TestCase):
    """T-AUG26-0001 / W-AUG26-0001 - server-generated, read-only, monthly
    serial reset per (organization, card_type)."""

    def setUp(self):
        self.org = Organization.objects.create(name="Trip No Co")
        set_current_tenant(self.org)
        self.driver = Driver.objects.create(code="DRV-01", name="Driver One")
        self.route_vehicle = Vehicle.objects.create(
            registration_number="TN-04-EE-0001", category="lorry", metering_unit="km",
            number_of_tyres=6, spare_tyres=1,
        )
        self.work_vehicle = Vehicle.objects.create(
            registration_number="TN-04-EE-0002", category="lorry", metering_unit="hours",
            number_of_tyres=6, spare_tyres=1,
        )
        self.user = User.objects.create_user(
            username="owner1", email="owner1@test.local", password="x", organization=self.org, role=Role.OWNER,
        )
        set_current_user(self.user)
        self.addCleanup(clear)

    def test_route_vehicle_gets_t_prefix(self):
        import datetime

        no = generate_trip_no(self.route_vehicle, datetime.date(2026, 8, 2))
        self.assertEqual(no, "T-AUG26-0001")

    def test_work_vehicle_gets_w_prefix(self):
        import datetime

        no = generate_trip_no(self.work_vehicle, datetime.date(2026, 8, 2))
        self.assertEqual(no, "W-AUG26-0001")

    def test_serial_increments_and_resets_by_month(self):
        import datetime

        first = generate_trip_no(self.route_vehicle, datetime.date(2026, 8, 2))
        TripSheet.objects.create(
            vehicle=self.route_vehicle, driver=self.driver, date="2026-08-02", opening_meter=100, trip_no=first,
        )
        second = generate_trip_no(self.route_vehicle, datetime.date(2026, 8, 15))
        self.assertEqual(second, "T-AUG26-0002")

        next_month = generate_trip_no(self.route_vehicle, datetime.date(2026, 9, 1))
        self.assertEqual(next_month, "T-SEP26-0001")

    def test_api_create_assigns_trip_no_and_ignores_client_value(self):
        client = APIClient()
        client.login(username="owner1", password="x")
        resp = client.post(
            "/api/operations/trip-sheets/",
            {
                "vehicle": str(self.route_vehicle.id), "driver": str(self.driver.id), "date": "2026-08-02",
                "opening_meter": "100", "trip_no": "SOMETHING-CLIENT-SUPPLIED",
            },
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["trip_no"], "T-AUG26-0001")

    def test_trip_no_cannot_be_edited_after_creation(self):
        client = APIClient()
        client.login(username="owner1", password="x")
        create_resp = client.post(
            "/api/operations/trip-sheets/",
            {"vehicle": str(self.route_vehicle.id), "driver": str(self.driver.id), "date": "2026-08-02", "opening_meter": "100"},
        )
        trip_id = create_resp.data["id"]
        original_trip_no = create_resp.data["trip_no"]
        patch_resp = client.patch(
            f"/api/operations/trip-sheets/{trip_id}/", {"trip_no": "HACKED-0001"}, content_type="application/json",
        )
        self.assertEqual(patch_resp.status_code, 200, patch_resp.data)
        self.assertEqual(patch_resp.data["trip_no"], original_trip_no)


class SubmitApproveCloseWorkflowTests(TestCase):
    """Open -> Submitted -> Approved & Closed, per the approved
    trip-sheet-path-plan mockup: Submit is gated on completeness and open to
    driver/manager/owner; Approve & Close is owner-only unless a manager is
    specifically delegated; Cancel is creator-only and locked once
    approved & closed."""

    def setUp(self):
        self.org = Organization.objects.create(name="Workflow Co")
        set_current_tenant(self.org)
        self.driver = Driver.objects.create(code="DRV-01", name="Driver One")
        self.other_driver = Driver.objects.create(code="DRV-02", name="Driver Two")
        self.vehicle = Vehicle.objects.create(
            registration_number="TN-04-FF-0001", category="lorry", metering_unit="km",
            number_of_tyres=6, spare_tyres=1,
        )
        self.owner = User.objects.create_user(
            username="owner1", email="owner1@test.local", password="x", organization=self.org, role=Role.OWNER,
        )
        self.manager = User.objects.create_user(
            username="manager1", email="manager1@test.local", password="x", organization=self.org, role=Role.MANAGER,
        )
        self.driver_user = User.objects.create_user(
            username="driveruser1", email="du1@test.local", password="x",
            organization=self.org, role=Role.DRIVER, driver_id=self.driver.id,
        )
        self.other_driver_user = User.objects.create_user(
            username="driveruser2", email="du2@test.local", password="x",
            organization=self.org, role=Role.DRIVER, driver_id=self.other_driver.id,
        )
        set_current_user(self.owner)
        self.addCleanup(clear)

    def _complete_trip_sheet(self, created_by):
        set_current_user(created_by)
        ts = TripSheet.objects.create(
            vehicle=self.vehicle, driver=self.driver, date="2026-08-02", opening_meter=100, closing_meter=150,
        )
        TripLeg.objects.create(trip_sheet=ts, from_place="A", to_place="B", freight_amount=1000)
        TripLeg.objects.create(trip_sheet=ts, from_place="B", to_place="A", freight_amount=1000)
        return ts

    def test_submit_blocked_when_incomplete(self):
        # No leg yet - still blocked. Closing meter is no longer part of
        # this gate (see submit()'s docstring - moved to approve_close).
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = TripSheet.objects.create(vehicle=self.vehicle, driver=self.driver, date="2026-08-02", opening_meter=100)
        resp = client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("trip leg", str(resp.data))
        self.assertNotIn("closing meter", str(resp.data))

    def test_submit_blocked_with_only_one_leg(self):
        # A single leg can still be saved (added) on a draft sheet - it just
        # isn't enough on its own to submit (see submit()'s docstring).
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = TripSheet.objects.create(vehicle=self.vehicle, driver=self.driver, date="2026-08-02", opening_meter=100)
        TripLeg.objects.create(trip_sheet=ts, from_place="A", to_place="B", freight_amount=1000)
        resp = client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("two trip legs", str(resp.data))

    def test_submit_succeeds_without_closing_meter(self):
        # The behaviour this whole change is about: legs logged, no closing
        # meter yet - submit still succeeds. The trip sheet is handed off
        # mid-day; the closing reading comes later, before Approve & Close
        # (see test_approve_close_blocked_without_closing_meter).
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = TripSheet.objects.create(vehicle=self.vehicle, driver=self.driver, date="2026-08-02", opening_meter=100)
        TripLeg.objects.create(trip_sheet=ts, from_place="A", to_place="B", freight_amount=1000)
        TripLeg.objects.create(trip_sheet=ts, from_place="B", to_place="A", freight_amount=1000)
        resp = client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "submitted")
        self.assertIsNone(resp.data["closing_meter"])

    def test_approve_close_blocked_without_closing_meter(self):
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = TripSheet.objects.create(vehicle=self.vehicle, driver=self.driver, date="2026-08-02", opening_meter=100)
        TripLeg.objects.create(trip_sheet=ts, from_place="A", to_place="B", freight_amount=1000)
        TripLeg.objects.create(trip_sheet=ts, from_place="B", to_place="A", freight_amount=1000)
        client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        resp = client.post(f"/api/operations/trip-sheets/{ts.id}/approve-close/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("closing meter", str(resp.data))

    def test_approve_close_succeeds_once_closing_meter_added_after_submit(self):
        # The closing meter can be filled in on a submitted sheet - Approve
        # & Close then proceeds normally, including the vehicle rollforward.
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = TripSheet.objects.create(vehicle=self.vehicle, driver=self.driver, date="2026-08-02", opening_meter=100)
        TripLeg.objects.create(trip_sheet=ts, from_place="A", to_place="B", freight_amount=1000)
        TripLeg.objects.create(trip_sheet=ts, from_place="B", to_place="A", freight_amount=1000)
        client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        client.patch(f"/api/operations/trip-sheets/{ts.id}/", {"closing_meter": 150}, format="json")
        resp = client.post(f"/api/operations/trip-sheets/{ts.id}/approve-close/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.current_meter, 150)

    def test_model_level_guard_rejects_approve_close_without_closing_meter(self):
        # Defense in depth: even called directly, bypassing the view.
        ts = TripSheet.objects.create(vehicle=self.vehicle, driver=self.driver, date="2026-08-02", opening_meter=100)
        ts.status = TripSheetStatus.SUBMITTED
        ts.save()
        with self.assertRaises(ValueError):
            ts.approve_close()

    def test_submit_blocked_when_advance_unsettled(self):
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = self._complete_trip_sheet(self.owner)
        TripAdvance.objects.create(trip_sheet=ts, amount=500, date="2026-08-02")
        resp = client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("advance settlement", str(resp.data))

    def test_submit_succeeds_when_complete(self):
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = self._complete_trip_sheet(self.owner)
        resp = client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "submitted")

    def test_driver_can_submit_own_trip_sheet(self):
        client = APIClient()
        client.login(username="driveruser1", password="x")
        ts = self._complete_trip_sheet(self.driver_user)
        resp = client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_driver_cannot_submit_another_drivers_trip_sheet(self):
        ts = self._complete_trip_sheet(self.owner)
        client = APIClient()
        client.login(username="driveruser2", password="x")
        resp = client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        self.assertEqual(resp.status_code, 404)

    def test_owner_can_approve_close_balanced_trip(self):
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = self._complete_trip_sheet(self.owner)
        client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        resp = client.post(f"/api/operations/trip-sheets/{ts.id}/approve-close/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "closed")
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.current_meter, 150)

    def test_approve_close_blocked_when_unbalanced_without_override(self):
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = self._complete_trip_sheet(self.owner)
        TripAdvance.objects.create(trip_sheet=ts, amount=500, date="2026-08-02")
        ts.returned_amount = 0
        ts.save()
        client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        resp = client.post(f"/api/operations/trip-sheets/{ts.id}/approve-close/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("unaccounted", str(resp.data))

    def test_approve_close_succeeds_unbalanced_with_override(self):
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = self._complete_trip_sheet(self.owner)
        TripAdvance.objects.create(trip_sheet=ts, amount=500, date="2026-08-02")
        ts.returned_amount = 0
        ts.save()
        client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        resp = client.post(
            f"/api/operations/trip-sheets/{ts.id}/approve-close/", {"override_reason": "Cash still with driver"},
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "closed")

    def test_manager_cannot_approve_close_without_delegation(self):
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = self._complete_trip_sheet(self.owner)
        client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")

        manager_client = APIClient()
        manager_client.login(username="manager1", password="x")
        resp = manager_client.post(f"/api/operations/trip-sheets/{ts.id}/approve-close/")
        self.assertEqual(resp.status_code, 403)

    def test_manager_can_approve_close_when_delegated(self):
        set_current_user(self.owner)
        Permission.objects.create(
            organization=self.org, user=self.manager, section="trip_work_cards",
            action=PermissionAction.CHANGE_STATUS, allowed=True,
        )
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = self._complete_trip_sheet(self.owner)
        client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")

        manager_client = APIClient()
        manager_client.login(username="manager1", password="x")
        resp = manager_client.post(f"/api/operations/trip-sheets/{ts.id}/approve-close/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "closed")

    def test_only_creator_can_cancel(self):
        ts = self._complete_trip_sheet(self.driver_user)
        client = APIClient()
        client.login(username="driveruser2", password="x")
        resp = client.delete(f"/api/operations/trip-sheets/{ts.id}/")
        self.assertEqual(resp.status_code, 404)

        creator_client = APIClient()
        creator_client.login(username="driveruser1", password="x")
        resp = creator_client.delete(f"/api/operations/trip-sheets/{ts.id}/")
        self.assertEqual(resp.status_code, 204)
        ts.refresh_from_db()
        self.assertEqual(ts.status, TripSheetStatus.CANCELLED)

    def test_serializer_exposes_can_submit_can_approve_close_can_cancel(self):
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = self._complete_trip_sheet(self.owner)
        resp = client.get(f"/api/operations/trip-sheets/{ts.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["can_submit"])
        self.assertFalse(resp.data["can_approve_close"])  # still draft/open, nothing to approve yet
        self.assertTrue(resp.data["can_cancel"])

        manager_client = APIClient()
        manager_client.login(username="manager1", password="x")
        resp = manager_client.get(f"/api/operations/trip-sheets/{ts.id}/")
        self.assertFalse(resp.data["can_approve_close"])  # not delegated

    def test_cannot_cancel_once_approved_and_closed(self):
        client = APIClient()
        client.login(username="owner1", password="x")
        ts = self._complete_trip_sheet(self.owner)
        client.post(f"/api/operations/trip-sheets/{ts.id}/submit/")
        client.post(f"/api/operations/trip-sheets/{ts.id}/approve-close/")
        resp = client.delete(f"/api/operations/trip-sheets/{ts.id}/")
        self.assertEqual(resp.status_code, 403)


class FuelLogWorkflowTests(TestCase):
    """Open -> Submitted -> Approved/Rejected, terminal, plus a required
    driver field - mirrors Expense's approve/reject shape
    (economics.tests.ExpenseApprovalTests), with submit bumped to
    Manager-level trust via FuelLogTransitionPermission since fuel_log
    (unlike trip_work_cards) has no blanket change_status grant for
    Manager in ROLE_DEFAULTS to lean on."""

    def setUp(self):
        self.org = Organization.objects.create(name="Fuel Workflow Co")
        set_current_tenant(self.org)
        self.vehicle = Vehicle.objects.create(
            registration_number="TN-09-FL-0001", category="lorry", metering_unit="km",
        )
        self.driver = Driver.objects.create(code="DRV-11", name="Driver Eleven")
        self.other_driver = Driver.objects.create(code="DRV-12", name="Driver Twelve")
        self.owner = User.objects.create_user(
            username="fowner", email="fowner@test.local", password="x", organization=self.org, role=Role.OWNER,
        )
        self.manager = User.objects.create_user(
            username="fmanager", email="fmanager@test.local", password="x", organization=self.org, role=Role.MANAGER,
        )
        self.driver_user = User.objects.create_user(
            username="fdriveruser", email="fdriveruser@test.local", password="x",
            organization=self.org, role=Role.DRIVER, driver_id=self.driver.id,
        )
        self.other_driver_user = User.objects.create_user(
            username="fotherdriveruser", email="fotherdriveruser@test.local", password="x",
            organization=self.org, role=Role.DRIVER, driver_id=self.other_driver.id,
        )
        set_current_user(self.owner)
        self.addCleanup(clear)

    def _payload(self, **overrides):
        payload = {
            "vehicle": str(self.vehicle.id), "driver": str(self.driver.id), "filled_by": "Ramesh (driver)",
            "date": "2026-08-06", "litres": "40", "rate_per_litre": "95",
        }
        payload.update(overrides)
        return payload

    def test_driver_required_to_create(self):
        client = APIClient()
        client.login(username="fowner", password="x")
        payload = self._payload()
        del payload["driver"]
        resp = client.post("/api/operations/fuel-logs/", payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("driver", resp.data)

    def test_filled_by_required_to_create(self):
        client = APIClient()
        client.login(username="fowner", password="x")
        payload = self._payload()
        del payload["filled_by"]
        resp = client.post("/api/operations/fuel-logs/", payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("filled_by", resp.data)

    def test_create_starts_draft(self):
        client = APIClient()
        client.login(username="fowner", password="x")
        resp = client.post("/api/operations/fuel-logs/", self._payload())
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["status"], "draft")

    def test_manager_can_submit_without_delegation(self):
        client = APIClient()
        client.login(username="fowner", password="x")
        created = client.post("/api/operations/fuel-logs/", self._payload()).data

        manager_client = APIClient()
        manager_client.login(username="fmanager", password="x")
        resp = manager_client.post(f"/api/operations/fuel-logs/{created['id']}/submit/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "submitted")

    def test_driver_can_submit_own_fuel_log(self):
        client = APIClient()
        client.login(username="fowner", password="x")
        created = client.post("/api/operations/fuel-logs/", self._payload()).data

        driver_client = APIClient()
        driver_client.login(username="fdriveruser", password="x")
        resp = driver_client.post(f"/api/operations/fuel-logs/{created['id']}/submit/")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_driver_cannot_submit_another_drivers_fuel_log(self):
        client = APIClient()
        client.login(username="fowner", password="x")
        created = client.post("/api/operations/fuel-logs/", self._payload()).data

        other_client = APIClient()
        other_client.login(username="fotherdriveruser", password="x")
        resp = other_client.post(f"/api/operations/fuel-logs/{created['id']}/submit/")
        self.assertEqual(resp.status_code, 404)

    def test_manager_cannot_approve_without_delegation(self):
        client = APIClient()
        client.login(username="fowner", password="x")
        created = client.post("/api/operations/fuel-logs/", self._payload()).data
        client.post(f"/api/operations/fuel-logs/{created['id']}/submit/")

        manager_client = APIClient()
        manager_client.login(username="fmanager", password="x")
        resp = manager_client.post(f"/api/operations/fuel-logs/{created['id']}/approve/")
        self.assertEqual(resp.status_code, 403)

    def test_manager_can_approve_when_delegated(self):
        Permission.objects.create(
            organization=self.org, user=self.manager, section="fuel_log",
            action=PermissionAction.CHANGE_STATUS, allowed=True,
        )
        client = APIClient()
        client.login(username="fowner", password="x")
        created = client.post("/api/operations/fuel-logs/", self._payload()).data
        client.post(f"/api/operations/fuel-logs/{created['id']}/submit/")

        manager_client = APIClient()
        manager_client.login(username="fmanager", password="x")
        resp = manager_client.post(f"/api/operations/fuel-logs/{created['id']}/approve/")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_manager_cannot_approve_own_entry_even_when_delegated(self):
        # Delegation grants the section-level capability; it doesn't grant
        # approving your own record - see core.permissions.is_self_approval.
        Permission.objects.create(
            organization=self.org, user=self.manager, section="fuel_log",
            action=PermissionAction.CHANGE_STATUS, allowed=True,
        )
        manager_client = APIClient()
        manager_client.login(username="fmanager", password="x")
        created = manager_client.post("/api/operations/fuel-logs/", self._payload()).data
        manager_client.post(f"/api/operations/fuel-logs/{created['id']}/submit/")
        resp = manager_client.post(f"/api/operations/fuel-logs/{created['id']}/approve/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("own entry", str(resp.data))

    def test_owner_can_approve_directly(self):
        client = APIClient()
        client.login(username="fowner", password="x")
        created = client.post("/api/operations/fuel-logs/", self._payload()).data
        client.post(f"/api/operations/fuel-logs/{created['id']}/submit/")
        resp = client.post(f"/api/operations/fuel-logs/{created['id']}/approve/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "approved")

    def test_reject_requires_a_note(self):
        client = APIClient()
        client.login(username="fowner", password="x")
        created = client.post("/api/operations/fuel-logs/", self._payload()).data
        client.post(f"/api/operations/fuel-logs/{created['id']}/submit/")
        resp = client.post(f"/api/operations/fuel-logs/{created['id']}/reject/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("approval_note", resp.data)

    def test_reject_with_note_succeeds(self):
        client = APIClient()
        client.login(username="fowner", password="x")
        created = client.post("/api/operations/fuel-logs/", self._payload()).data
        client.post(f"/api/operations/fuel-logs/{created['id']}/submit/")
        resp = client.post(f"/api/operations/fuel-logs/{created['id']}/reject/", {"approval_note": "Duplicate"})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "rejected")

    def test_cannot_edit_after_submit(self):
        client = APIClient()
        client.login(username="fowner", password="x")
        created = client.post("/api/operations/fuel-logs/", self._payload()).data
        client.post(f"/api/operations/fuel-logs/{created['id']}/submit/")
        resp = client.patch(f"/api/operations/fuel-logs/{created['id']}/", {"litres": "50"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_draft_entry_stays_editable(self):
        client = APIClient()
        client.login(username="fowner", password="x")
        created = client.post("/api/operations/fuel-logs/", self._payload()).data
        resp = client.patch(f"/api/operations/fuel-logs/{created['id']}/", {"litres": "50"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_trip_sourced_fuel_log_gets_driver_populated(self):
        # Goes through TripExpenseSerializer, not a bare .objects.create() -
        # sync_trip_expense_posting only runs from the serializer's
        # create()/update() (see TripExpenseSerializer._sync_posting), same
        # as why economics.tests.ExpenseSourceTests.test_tyre_service_source
        # had to go through TyreServiceSerializer rather than the ORM
        # directly.
        from economics.models import ExpenseHead
        from economics.services import seed_expense_heads
        from .models import TripExpense
        from .serializers import TripExpenseSerializer

        seed_expense_heads(self.org)
        trip = TripSheet.objects.create(
            vehicle=self.vehicle, driver=self.driver, date="2026-08-06", opening_meter=100,
        )
        fuel_head = ExpenseHead.objects.get(slug="fuel")
        serializer = TripExpenseSerializer(data={
            "trip_sheet": str(trip.id), "expense_head": str(fuel_head.id), "paid_from": "company_direct",
            "amount": "1000", "litres": "10", "rate_per_litre": "100", "date": "2026-08-06",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        expense = serializer.save()
        expense = TripExpense.objects.get(pk=expense.pk)
        self.assertIsNotNone(expense.fuel_log_id)
        self.assertEqual(expense.fuel_log.driver_id, self.driver.id)
        self.assertEqual(expense.fuel_log.status, "draft")
