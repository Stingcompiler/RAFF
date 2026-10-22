import os

from .base import *  # noqa: F403

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Pin "today" for reproducible screenshots (never set in production settings).
RAFF_FIXED_TODAY = os.environ.get("RAFF_FIXED_TODAY") or None
