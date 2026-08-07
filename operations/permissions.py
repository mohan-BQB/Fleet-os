"""Trip/work cards and fuel log both have a "driver: own records only"
carve-out beyond the ordinary section grid (a driver has no `trip_work_cards`
or `fuel_log` grant in ROLE_DEFAULTS at all - see core.permissions - their
access is row-scoped, not section-wide). That carve-out needs an object/
queryset check the generic HasCapability class doesn't do, so it lives here.
`OwnRecordsPermission` is shared by both sections; each view sets its own
`required_section`."""
from rest_framework.permissions import BasePermission

from core.models import Role
from core.permissions import action_for_request, can


def _driver_id_for(obj):
    """Resolve the owning driver's id for a TripSheet/FuelLog, or for a
    child record (TripLeg/DriverLedgerEntry) that reaches it via trip_sheet."""
    if hasattr(obj, "driver_id") and obj.driver_id:
        return obj.driver_id
    trip_sheet = getattr(obj, "trip_sheet", None)
    return trip_sheet.driver_id if trip_sheet else None


class OwnRecordsPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        section = view.required_section
        if can(user, section, action_for_request(request, view)):
            return True
        return user.role == Role.DRIVER

    def has_object_permission(self, request, view, obj):
        user = request.user
        section = view.required_section
        if can(user, section, action_for_request(request, view)):
            return True
        return user.role == Role.DRIVER and _driver_id_for(obj) == user.driver_id


def own_trip_sheets_filter(queryset, user, section="trip_work_cards", driver_field="driver_id"):
    """Drivers only ever see their own trip sheets/fuel logs; everyone with
    the section grant sees the tenant's full set (already scoped by
    TenantManager)."""
    if user.role == Role.DRIVER and not can(user, section):
        return queryset.filter(**{driver_field: user.driver_id})
    return queryset


def _delegated_approve_close(user):
    """True only if THIS specific user has an explicit user-level
    Permission override granting trip_work_cards/change_status - deliberately
    bypasses can()'s role-default fallback rather than calling can() itself,
    because Role.MANAGER's ROLE_DEFAULTS already grants change_status on
    trip_work_cards (it still gates several unrelated retire actions on trip
    legs/advances/expenses - see TripLegViewSet etc., all sharing this same
    section). Going through can() here would make every manager "delegated"
    by default, which defeats the point. An owner delegates by granting one
    specific manager this override from Masters -> Users, same screen as
    every other permission override in the app."""
    from core.models import Permission

    return Permission.all_objects.filter(
        organization_id=user.organization_id, user_id=user.id,
        section="trip_work_cards", action="change_status", allowed=True,
    ).exists()


class TripSheetTransitionPermission(OwnRecordsPermission):
    """Layers three trip-sheet-specific transition rules on top of
    OwnRecordsPermission's ordinary view/add_edit/own-records checks -
    special-cased here rather than widening core.permissions.PermissionAction
    (a generic 3-value enum shared across all 9 sections) with concepts that
    only make sense for this one state machine:

    - submit: owner, admin, manager, or the assigned driver (reuses the
      existing own-records carve-out for that last case).
    - approve_close: owner/admin, or a manager specifically delegated the
      capability (see _delegated_approve_close).
    - destroy (the retire/cancel path): only the trip sheet's own creator,
      and only before it's been approved & closed.

    Everything else (view/add_edit, and the other trip_work_cards viewsets
    that don't set this permission class) falls through to
    OwnRecordsPermission unchanged."""

    def has_object_permission(self, request, view, obj):
        action = getattr(view, "action", None)
        user = request.user

        if action == "submit":
            if user.role in (Role.OWNER, Role.ADMIN, Role.MANAGER):
                return True
            return user.role == Role.DRIVER and _driver_id_for(obj) == user.driver_id

        if action == "approve_close":
            if user.role in (Role.OWNER, Role.ADMIN):
                return True
            return user.role == Role.MANAGER and _delegated_approve_close(user)

        if action == "destroy":
            from .models import TripSheetStatus

            if obj.status in (TripSheetStatus.APPROVED, TripSheetStatus.CLOSED):
                return False
            return obj.created_by_id == user.id

        return super().has_object_permission(request, view, obj)


class FuelLogTransitionPermission(OwnRecordsPermission):
    """submit needs Manager-level trust (same as add_edit), not the
    change_status trust approve/reject require - unlike TripSheet, Manager
    has no blanket change_status grant on fuel_log in ROLE_DEFAULTS to lean
    on (fuel_log stops at add_edit for Manager), so submit is special-cased
    at both has_permission (the coarse "can this action be attempted at
    all" gate that OwnRecordsPermission alone would fail for a Manager,
    since action_for_request classifies submit as change_status) and
    has_object_permission. approve/reject and everything else fall through
    to OwnRecordsPermission unchanged - fuel_log's change_status is
    correctly owner/admin-by-default-or-delegated already, no existing
    blanket grant to route around the way TripSheet's approve_close needs
    (see _delegated_approve_close's docstring for that contrast)."""

    def has_permission(self, request, view):
        if getattr(view, "action", None) == "submit":
            user = request.user
            if not user or not user.is_authenticated:
                return False
            return user.role in (Role.OWNER, Role.ADMIN, Role.MANAGER, Role.DRIVER)
        return super().has_permission(request, view)

    def has_object_permission(self, request, view, obj):
        if getattr(view, "action", None) == "submit":
            user = request.user
            if user.role in (Role.OWNER, Role.ADMIN, Role.MANAGER):
                return True
            return user.role == Role.DRIVER and _driver_id_for(obj) == user.driver_id
        return super().has_object_permission(request, view, obj)
