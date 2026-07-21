"""'enter_trip_sheets' is Owner/Admin/Manager in the capability matrix, plus
drivers entering their own (per the comment on that entry in
core/permissions.py) - that "own only" carve-out needs an object/queryset
check the generic HasCapability class doesn't do, so it lives here."""
from rest_framework.permissions import BasePermission

from core.models import Role
from core.permissions import can


def _driver_id_for(obj):
    """Resolve the owning driver's id for a TripSheet, or for a child record
    (TripLeg/FuelLog/DriverLedgerEntry) that reaches it via trip_sheet."""
    if hasattr(obj, "driver_id") and obj.driver_id:
        return obj.driver_id
    trip_sheet = getattr(obj, "trip_sheet", None)
    return trip_sheet.driver_id if trip_sheet else None


class CanEnterTripSheets(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return can(user, "enter_trip_sheets") or user.role == Role.DRIVER

    def has_object_permission(self, request, view, obj):
        user = request.user
        if can(user, "enter_trip_sheets"):
            return True
        return user.role == Role.DRIVER and _driver_id_for(obj) == user.driver_id


def own_trip_sheets_filter(queryset, user, driver_field="driver_id"):
    """Drivers only ever see their own trip sheets; everyone with the
    capability sees the tenant's full set (already scoped by TenantManager)."""
    if user.role == Role.DRIVER and not can(user, "enter_trip_sheets"):
        return queryset.filter(**{driver_field: user.driver_id})
    return queryset
