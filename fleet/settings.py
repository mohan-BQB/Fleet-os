"""
Django settings for fleet project.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/topics/settings/
"""

import os
from pathlib import Path

import environ

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DEBUG=(bool, True))
environ.Env.read_env(BASE_DIR / ".env")  # optional, for local overrides

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env(
    "SECRET_KEY", default="django-insecure-n-i&2l@sm_%jzy$-k&^ppxl%($q(u6+@-bu@#^9ox6)ag!p89#"
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env.bool("DEBUG", default=True)

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

# In dev, the Vite dev server proxies /api and /admin to this backend (see
# frontend/vite.config.ts) so everything is same-origin. In production the
# frontend (Vercel) and backend (Render) are on different domains, so this
# needs the deployed frontend URL, and cookies need SameSite=None + Secure to
# survive that cross-origin round trip - only turned on when DEBUG is off,
# since Secure cookies don't work over the plain http of local dev.
def _strip_trailing_slash(origins):
    # Browsers send Origin with no trailing slash; a pasted-in URL often has
    # one, which would otherwise silently fail to match.
    return [o.rstrip("/") for o in origins]


CSRF_TRUSTED_ORIGINS = _strip_trailing_slash(
    env.list("CSRF_TRUSTED_ORIGINS", default=["http://localhost:5173"])
)
CORS_ALLOWED_ORIGINS = _strip_trailing_slash(
    env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"])
)
CORS_ALLOW_CREDENTIALS = True

if not DEBUG:
    SESSION_COOKIE_SAMESITE = "None"
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SAMESITE = "None"
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")


# Application definition

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
    "corsheaders",
    "core",
    "vehicles",
    "drivers",
    "compliance",
    "operations",
    "economics",
]

# 3. Middleware - CurrentTenantMiddleware AFTER AuthenticationMiddleware.
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "core.middleware.CurrentTenantMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = 'fleet.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'fleet.wsgi.application'


# 4. PostgreSQL. DATABASE_URL (Render sets this automatically) wins; falls
# back to the local Homebrew instance for local dev.
_local_db_url = f"postgres://{os.environ.get('USER', 'fleet')}@localhost:5432/fleet"
DATABASES = {"default": env.db("DATABASE_URL", default=_local_db_url)}


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# 5. Media (for the company logo + document uploads; swap for S3 in prod).
MEDIA_URL = "/media/"
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", str(BASE_DIR / "media"))

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
