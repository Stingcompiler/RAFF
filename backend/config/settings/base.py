"""Settings shared by every environment. Secrets come from the environment only."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None:
        raise RuntimeError(f"Missing required environment variable {name}")
    return value


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in env(name, default).split(",") if item.strip()]


SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = False
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

# The one organization this deployment serves (CLAUDE.md rule 3).
SINGLE_ORG_ID = os.environ.get("SINGLE_ORG_ID") or None

# Open business decisions kept behind named settings (CLAUDE.md rule 28; see BACKLOG.md).
# How bonus units affect cost: "distribute" spreads the invoice cost over paid + bonus
# units (10 + 2 at 144 → 12 each); "bonus_as_income" keeps the paid unit cost and records
# the bonus value separately.
RAFF_BONUS_COST_POLICY = env("RAFF_BONUS_COST_POLICY", "distribute")
# Largest line discount a cashier with pos.discount may give, in percent.
RAFF_MAX_LINE_DISCOUNT_PCT = int(env("RAFF_MAX_LINE_DISCOUNT_PCT", "20"))
# A batch is "near expiry" within this many days.
RAFF_NEAR_EXPIRY_DAYS = int(env("RAFF_NEAR_EXPIRY_DAYS", "90"))
# A stocktake variance needs a written reason when it is at least this share of the system
# quantity (in percent), or whenever the system quantity is zero.
RAFF_STOCKTAKE_REASON_PCT = int(env("RAFF_STOCKTAKE_REASON_PCT", "10"))

# Signed license (apps/licensing); missing or invalid never blocks selling.
RAFF_LICENSE_FILE = env("RAFF_LICENSE_FILE", str(BASE_DIR / "LICENSE.json"))
RAFF_LICENSE_PUBLIC_KEY = env("RAFF_LICENSE_PUBLIC_KEY", "")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "rest_framework",
    "drf_spectacular",
    "apps.tenancy",
    "apps.accounts",
    "apps.licensing",
    "apps.catalog",
    "apps.inventory",
    "apps.purchasing",
    "apps.sales",
    "apps.returns",
    "apps.finance",
    "apps.transfers",
    "apps.storefront",
    "apps.orders",
    "apps.notifications",
    "apps.reports",
    "apps.audit",
    "apps.sync",
    "apps.backup",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Before sessions/auth so the user lookup already runs inside the org context.
    "apps.tenancy.middleware.OrgContextMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

AUTH_USER_MODEL = "accounts.User"
# Usernames are unique per organization, so authentication is org-aware.
AUTHENTICATION_BACKENDS = ["apps.accounts.backends.OrgUserBackend"]
# username is unique per organization (UniqueConstraint), not globally; the backend
# above resolves it within the org in context.
SILENCED_SYSTEM_CHECKS = ["auth.W004"]
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": ["django.template.context_processors.request"]},
    }
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "raff"),
        "USER": env("POSTGRES_USER", "raff"),
        "PASSWORD": env("POSTGRES_PASSWORD", ""),
        "HOST": env("POSTGRES_HOST", "localhost"),
        "PORT": env("POSTGRES_PORT", "5432"),
        "ATOMIC_REQUESTS": False,
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "ar"
LANGUAGES = [("ar", "العربية"), ("en", "English")]
TIME_ZONE = "Africa/Khartoum"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Storefront listing images. Served by Caddy in production (WO-10), by Django when DEBUG.
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(env("RAFF_MEDIA_ROOT", str(BASE_DIR / "media")))
# Outbound order alerts; unset means badge only.
RAFF_TELEGRAM_BOT_TOKEN = env("RAFF_TELEGRAM_BOT_TOKEN", "")

# Sessions and CSRF (CLAUDE.md rule 17).
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 12 * 60 * 60  # one working day
DEVICE_COOKIE_NAME = "raff_device"
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "")
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "COERCE_DECIMAL_TO_STRING": True,
    # Public storefront endpoints (no session) are rate limited per client address.
    "DEFAULT_THROTTLE_RATES": {
        "storefront": env("RAFF_THROTTLE_STOREFRONT", "120/min"),
        "orders": env("RAFF_THROTTLE_ORDERS", "20/hour"),
        "track": env("RAFF_THROTTLE_TRACK", "10/min"),
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Raff API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api/v1",
    # Several serializers have a `status` choice field; give each enum a stable name.
    "ENUM_NAME_OVERRIDES": {
        "StockStatusEnum": ["good", "near_expiry", "low", "out", "expired"],
        "BatchStatusEnum": ["good", "near_expiry", "expired", "held", "quarantined"],
        "ImportStatusEnum": "apps.catalog.models.ImportBatch.Status",
        "ReceiptStatusEnum": "apps.purchasing.models.GoodsReceipt.Status",
        "LicenseStateEnum": ["valid", "missing", "invalid"],
        "LocaleEnum": [("ar", "ar"), ("en", "en")],
        "RefundMethodEnum": "apps.returns.models.SaleReturn.Refund",
        "OrderStatusEnum": [
            "new",
            "needs_contact",
            "confirmed",
            "preparing",
            "ready",
            "out_for_delivery",
            "completed",
            "cancelled",
        ],
    },
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
