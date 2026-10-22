from __future__ import annotations

import base64
import json
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from apps.licensing.services.license import canonical, read_license


def keypair() -> tuple[Ed25519PrivateKey, str]:
    key = Ed25519PrivateKey.generate()
    public = key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return key, base64.b64encode(public).decode()


def write_license(path: Path, key: Ed25519PrivateKey, payload: dict[str, object]) -> None:
    signature = base64.b64encode(key.sign(canonical(payload))).decode()
    path.write_text(json.dumps({"payload": payload, "signature": signature}), encoding="utf-8")


PAYLOAD = {"organization": "صيدلية الشفاء", "branches": 3, "issued": "2026-10-22"}


def test_valid_license(tmp_path: Path) -> None:
    key, public = keypair()
    write_license(tmp_path / "LICENSE.json", key, PAYLOAD)
    status = read_license(tmp_path / "LICENSE.json", public)
    assert status.state == "valid"
    assert status.organization == "صيدلية الشفاء"
    assert status.branches == 3


def test_tampered_license_is_invalid(tmp_path: Path) -> None:
    key, public = keypair()
    write_license(tmp_path / "LICENSE.json", key, PAYLOAD)
    doc = json.loads((tmp_path / "LICENSE.json").read_text())
    doc["payload"]["branches"] = 30
    (tmp_path / "LICENSE.json").write_text(json.dumps(doc))
    assert read_license(tmp_path / "LICENSE.json", public).state == "invalid"


def test_wrong_key_is_invalid(tmp_path: Path) -> None:
    key, _ = keypair()
    _, other_public = keypair()
    write_license(tmp_path / "LICENSE.json", key, PAYLOAD)
    assert read_license(tmp_path / "LICENSE.json", other_public).state == "invalid"


def test_missing_file_or_key(tmp_path: Path) -> None:
    _, public = keypair()
    assert read_license(tmp_path / "absent.json", public).state == "missing"
    assert read_license(tmp_path / "absent.json", "").state == "missing"


def test_garbage_is_invalid(tmp_path: Path) -> None:
    _, public = keypair()
    (tmp_path / "LICENSE.json").write_text("{not json")
    assert read_license(tmp_path / "LICENSE.json", public).state == "invalid"
