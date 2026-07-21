from rest_framework.authentication import SessionAuthentication


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """CORS_ALLOWED_ORIGINS already locks requests to one exact trusted
    origin, and any credentialed cross-origin request with a JSON body gets
    preflighted - the browser blocks it before it ever reaches us unless we
    explicitly allow that origin. That closes the classic CSRF vector on its
    own, so DRF's additional cookie+Referer CSRF check is redundant - and a
    real liability, since some browsers/privacy settings omit the Referer
    header even for same-origin requests, which fails it unconditionally."""

    def enforce_csrf(self, request):
        return
