import os

from .base import *  # noqa: F403

DEBUG = True
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Pin "today" for reproducible screenshots (never set in production settings).
RAFF_FIXED_TODAY = os.environ.get("RAFF_FIXED_TODAY") or None
