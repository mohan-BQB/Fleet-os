"""Request-scoped tenant + user context.

The middleware sets these at the start of each request from the authenticated
user; models read them to auto-scope queries and stamp audit records. Using a
thread-local keeps the current tenant available deep in the ORM without
threading it through every call.
"""
import threading

_state = threading.local()


def set_current_tenant(organization):
    _state.tenant = organization


def get_current_tenant():
    return getattr(_state, "tenant", None)


def set_current_user(user):
    _state.user = user


def get_current_user():
    user = getattr(_state, "user", None)
    # Treat AnonymousUser as no user for stamping purposes.
    if user is not None and getattr(user, "is_authenticated", False):
        return user
    return None


def clear():
    _state.tenant = None
    _state.user = None
