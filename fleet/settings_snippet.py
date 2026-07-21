"""Key settings to merge into your Django project's settings.py.

This is a snippet, not a full settings file - copy the relevant parts in.
"""
import os

# 1. Custom user model (login = email).
AUTH_USER_MODEL = "core.User"

# 2. Apps.
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "core",
    "vehicles",
    "drivers",
    # more feature apps per phase: compliance, operations, economics, ...
]

# 3. Middleware - CurrentTenantMiddleware AFTER AuthenticationMiddleware.
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "core.middleware.CurrentTenantMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# 4. PostgreSQL (via env vars).
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "fleet"),
        "USER": os.environ.get("DB_USER", "fleet"),
        "PASSWORD": os.environ.get("DB_PASSWORD", ""),
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

# 5. Media (for the company logo + document uploads; swap for S3 in prod).
MEDIA_URL = "/media/"
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", "media")
