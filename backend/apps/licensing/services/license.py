"""LICENSE.json: a signed statement of the licensee and allowed branches.

Read at start-up and shown in settings. It never blocks selling (build spec §3).
Format: {"payload": {"organization": str, "branches": int, "issued": "YYYY-MM-DD"},
         "signature": base64(Ed25519 over the canonical JSON of payload)}
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from django.conf import settings


@dataclass(frozen=True)
class LicenseStatus:
    state: str  # "valid" | "missing" | "invalid"
    organization: str | None = None
    branches: int | None = None
    issued: str | None = None


def canonical(payload: dict[str, object]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def verify(document: dict[str, object], public_key_b64: str) -> LicenseStatus:
    payload = document.get("payload")
    signature = document.get("signature")
    if not isinstance(payload, dict) or not isinstance(signature, str):
        return LicenseStatus("invalid")
    try:
        key = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_b64))
        key.verify(base64.b64decode(signature), canonical(payload))
    except InvalidSignature, ValueError:
        return LicenseStatus("invalid")
    return LicenseStatus(
        "valid",
        organization=str(payload.get("organization", "")),
        branches=int(payload.get("branches", 0)),
        issued=str(payload.get("issued", "")),
    )


def read_license(path: Path | None = None, public_key_b64: str | None = None) -> LicenseStatus:
    path = path or Path(settings.RAFF_LICENSE_FILE)
    key = public_key_b64 if public_key_b64 is not None else settings.RAFF_LICENSE_PUBLIC_KEY
    if not path.exists() or not key:
        return LicenseStatus("missing")
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except OSError, json.JSONDecodeError:
        return LicenseStatus("invalid")
    return verify(document, key) if isinstance(document, dict) else LicenseStatus("invalid")


@lru_cache(maxsize=1)
def current_license() -> LicenseStatus:
    """Read once per process (start-up), as the build spec requires."""
    return read_license()
