"""Role-based permissions, encoded from the spec's matrix.

Each capability maps to the set of roles allowed to perform it. `can(user, cap)`
is the single check used everywhere; the DRF permission class wraps it.
"""
from .models import Role

# capability -> allowed roles
MATRIX = {
    "manage_users":            {Role.OWNER, Role.ADMIN},
    "edit_vehicles_drivers":   {Role.OWNER, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT},
    "retire_masters":          {Role.OWNER, Role.ADMIN, Role.ACCOUNTANT},
    "set_tracking_mode":       {Role.OWNER, Role.ADMIN},
    "build_sop_templates":     {Role.OWNER, Role.ADMIN, Role.ACCOUNTANT},
    "enter_trip_sheets":       {Role.OWNER, Role.ADMIN, Role.MANAGER},  # + driver: own only
    "complete_sop":            {Role.OWNER, Role.ADMIN, Role.MANAGER, Role.DRIVER},
    "driver_ledger":           {Role.OWNER, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT},
    "compliance_maintenance":  {Role.OWNER, Role.ADMIN, Role.MANAGER},
    "manage_expenses":         {Role.OWNER, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT},
    "view_pnl_reports":        {Role.OWNER, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT},
    "edit_company_profile":    {Role.ADMIN},          # incl. uploading the logo
    "upload_logo":             {Role.ADMIN},
}


def can(user, capability):
    if user is None or not user.is_authenticated:
        return False
    allowed = MATRIX.get(capability, set())
    return user.role in allowed


# --- optional DRF integration ---------------------------------------------
try:
    from rest_framework.permissions import BasePermission

    class HasCapability(BasePermission):
        """Usage: permission_classes = [HasCapability]; set `required_capability`
        on the view."""

        def has_permission(self, request, view):
            cap = getattr(view, "required_capability", None)
            if cap is None:
                return True
            return can(request.user, cap)
except ImportError:  # DRF not installed yet
    HasCapability = None
