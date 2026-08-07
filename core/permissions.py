"""Owner-editable, DB-backed permissions.

Every check is `can(user, section, action)` - one of the SECTIONS below,
one of the three PermissionAction values (view / add_edit / change_status).
Resolution order: a user-level `core.models.Permission` override, then a
role-level one, then the hard-coded ROLE_DEFAULTS below. The owner edits
overrides through the Users screen (core.views.PermissionViewSet); nobody
edits ROLE_DEFAULTS except in code - it's the floor everyone starts from
when a role is first picked.
"""
from .models import Permission, PermissionAction, Role

# Sections gated across the app. "Company & users" is the one section that
# stays owner/admin-only in the defaults below - everything else varies by
# role. Parts inventory rides along with `vehicles` (it's maintenance-
# adjacent, not a section the build asked for on its own).
VEHICLES = "vehicles"
DRIVERS = "drivers"
EXPENSES = "expenses"
TRIP_WORK_CARDS = "trip_work_cards"
FUEL_LOG = "fuel_log"
MONEY_BOX_SETTLEMENT = "money_box_settlement"
REPORTS = "reports"
CUSTOMERS_VENDORS = "customers_vendors"
COMPANY_USERS = "company_users"

SECTIONS = [
    VEHICLES, DRIVERS, EXPENSES, TRIP_WORK_CARDS, FUEL_LOG,
    MONEY_BOX_SETTLEMENT, REPORTS, CUSTOMERS_VENDORS, COMPANY_USERS,
]

VIEW = PermissionAction.VIEW
ADD_EDIT = PermissionAction.ADD_EDIT
CHANGE_STATUS = PermissionAction.CHANGE_STATUS


def _all(allowed):
    return {VIEW: allowed, ADD_EDIT: allowed, CHANGE_STATUS: allowed}


def _grid(view=False, add_edit=False, change_status=False):
    return {VIEW: view, ADD_EDIT: add_edit, CHANGE_STATUS: change_status}


# role -> section -> action -> bool. A role/section combination missing
# from here defaults to fully closed (see `can()`'s final fallback).
ROLE_DEFAULTS = {
    Role.OWNER: {section: _all(True) for section in SECTIONS},
    Role.ADMIN: {section: _all(True) for section in SECTIONS},
    Role.MANAGER: {
        VEHICLES: _grid(view=True, add_edit=True),
        DRIVERS: _grid(view=True, add_edit=True),
        EXPENSES: _grid(view=True, add_edit=True),
        # Manager both enters trip/work cards AND approves them.
        TRIP_WORK_CARDS: _grid(view=True, add_edit=True, change_status=True),
        FUEL_LOG: _grid(view=True, add_edit=True),
        MONEY_BOX_SETTLEMENT: _grid(view=True),
        REPORTS: _grid(view=True),
        CUSTOMERS_VENDORS: _grid(view=True, add_edit=True),
        COMPANY_USERS: _grid(),
    },
    Role.ACCOUNTANT: {
        VEHICLES: _grid(view=True),
        DRIVERS: _grid(view=True),
        EXPENSES: _grid(view=True, add_edit=True),
        # Accountant reconciles trips, doesn't create them.
        TRIP_WORK_CARDS: _grid(view=True),
        FUEL_LOG: _grid(view=True),
        MONEY_BOX_SETTLEMENT: _grid(view=True, add_edit=True, change_status=True),
        REPORTS: _grid(view=True),
        CUSTOMERS_VENDORS: _grid(view=True, add_edit=True, change_status=True),
        COMPANY_USERS: _grid(),
    },
    # Driver gets nothing at the section-grid level - their access to their
    # own trip sheets/fuel logs is a row-level carve-out (own records only),
    # handled by operations.permissions, not a section-wide grant.
    Role.DRIVER: {section: _grid() for section in SECTIONS},
}


def _role_default(role, section, action):
    return ROLE_DEFAULTS.get(role, {}).get(section, {}).get(action, False)


def can(user, section, action=VIEW):
    """The one check used everywhere. `action` defaults to `view` since
    that's what most read-path checks want; write paths pass add_edit or
    change_status explicitly."""
    if user is None or not user.is_authenticated:
        return False
    if user.is_superuser and not user.organization_id:
        # A platform-level console admin with no tenant of their own (see
        # the `console` app) isn't a role this matrix knows how to grade -
        # they operate outside any single org's permission grid entirely.
        return True

    org = user.organization_id
    user_override = Permission.all_objects.filter(
        organization_id=org, user_id=user.id, section=section, action=action,
    ).first()
    if user_override is not None:
        return user_override.allowed

    role_override = Permission.all_objects.filter(
        organization_id=org, role=user.role, user__isnull=True, section=section, action=action,
    ).first()
    if role_override is not None:
        return role_override.allowed

    return _role_default(user.role, section, action)


def is_self_approval(user, obj):
    """True when `user` both created `obj` and is now the one trying to
    approve/reject it - the one segregation-of-duties gap `can()` alone
    doesn't cover (it answers "can this role act on this section", not
    "should this specific person act on this specific record"). The owner
    is exempt: an owner-operated fleet routinely has the owner both
    entering a record and signing off on it, by design - this exists to
    catch a delegated manager approving their own entry, not to block the
    person the whole delegation chain answers to."""
    return user.role != Role.OWNER and obj.created_by_id == user.id


def effective_permissions(user):
    """The full section x action grid for `user`, resolved - what the Users
    screen renders and what /auth/me/ hands the frontend so it can gate nav
    without a second round-trip."""
    return {
        section: {action.value: can(user, section, action) for action in PermissionAction}
        for section in SECTIONS
    }


# --- optional DRF integration ---------------------------------------------
try:
    from rest_framework.permissions import SAFE_METHODS, BasePermission

    # view.action names that represent a status/lifecycle transition rather
    # than an ordinary write - everything else non-safe is add_edit.
    CHANGE_STATUS_ACTIONS = {
        "destroy", "retire", "activate", "rejoin", "renew", "mark_paid",
        "mark_in_service", "mark_active", "mark_sold", "mark_scrapped", "change_status",
        "submit", "approve_close", "approve", "reject",
    }

    def action_for_request(request, view):
        if request.method in SAFE_METHODS:
            return VIEW
        if getattr(view, "action", None) in CHANGE_STATUS_ACTIONS:
            return CHANGE_STATUS
        return ADD_EDIT

    class HasCapability(BasePermission):
        """Usage: permission_classes = [HasCapability]; set `required_section`
        on the view. The action (view/add_edit/change_status) is derived
        from the request itself - see action_for_request()."""

        def has_permission(self, request, view):
            section = getattr(view, "required_section", None)
            if section is None:
                return True
            return can(request.user, section, action_for_request(request, view))

    # Same class, clearer name for new code - HasCapability is kept as an
    # alias so the many existing `from core.permissions import HasCapability`
    # imports don't all need touching just to rename.
    HasSectionPermission = HasCapability
except ImportError:  # DRF not installed yet
    HasCapability = None
    HasSectionPermission = None
