"""Session-based auth for the frontend: get a CSRF cookie, log in (creates a
session so CurrentTenantMiddleware can pick up the tenant), check who's
logged in, log out. Token auth was deliberately skipped - tenant-scoping
reads request.user off Django's own session middleware, which runs before
DRF's authentication step, so a session is what actually makes multi-tenancy
work end to end.

CsrfView returns the token in the response body, not just the cookie: once
frontend and backend are on different domains (Vercel/Render), JS on the
frontend page can't read a cookie that Django set for its own domain. The
cookie itself still gets stored and sent back on requests to Django - it's
only client-side *reading* of it that breaks cross-site - so the token comes
back in JSON instead, and the frontend echoes it as X-CSRFToken."""
from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import UserSerializer


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)
        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)
