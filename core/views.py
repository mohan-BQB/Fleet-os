"""Session-based auth for the frontend: log in (creates a session so
CurrentTenantMiddleware can pick up the tenant), check who's logged in, log
out. Token auth was deliberately skipped - tenant-scoping reads request.user
off Django's own session middleware, which runs before DRF's authentication
step, so a session is what actually makes multi-tenancy work end to end.

No CSRF token endpoint: CORS_ALLOWED_ORIGINS already locks writes to one
trusted origin (see core.authentication.CsrfExemptSessionAuthentication for
why that's sufficient on its own)."""
from django.contrib.auth import authenticate, login, logout
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import UserSerializer


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
