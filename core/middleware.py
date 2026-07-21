"""Sets the request-scoped tenant + user so the ORM can auto-scope and audit.

Add to settings MIDDLEWARE *after* AuthenticationMiddleware.
"""
from .tenancy import clear, set_current_tenant, set_current_user


class CurrentTenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            set_current_user(user)
            set_current_tenant(getattr(user, "organization", None))
        else:
            set_current_user(None)
            set_current_tenant(None)
        try:
            return self.get_response(request)
        finally:
            clear()
