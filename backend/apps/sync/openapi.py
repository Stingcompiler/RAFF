"""OpenAPI: the error answers of the posting endpoints (review B-09).

Every operation that takes an Idempotency-Key can be refused (400, with a `detail` code) or
meet a key already used for another request (409); public ones are also rate limited (429).
Declaring them once here keeps each view's annotation about its success shape.
"""

from __future__ import annotations

from typing import Any

ERROR = {
    "type": "object",
    "properties": {"detail": {"type": "string", "description": "A stable error code"}},
    "required": ["detail"],
}
REF = {"$ref": "#/components/schemas/Error"}


def _answer(text: str) -> dict[str, Any]:
    return {"description": text, "content": {"application/json": {"schema": REF}}}


def idempotent_errors(result: dict[str, Any], **_: Any) -> dict[str, Any]:
    result.setdefault("components", {}).setdefault("schemas", {})["Error"] = ERROR
    for path, item in result.get("paths", {}).items():
        for op in item.values():
            if not isinstance(op, dict) or "responses" not in op:
                continue
            names = {p.get("name") for p in op.get("parameters", [])}
            if "Idempotency-Key" not in names:
                continue
            responses = op["responses"]
            responses.setdefault("400", _answer("Refused: nothing was recorded"))
            responses.setdefault(
                "409", _answer("This Idempotency-Key was used for another request")
            )
            if path.startswith("/api/v1/public/"):
                responses.setdefault("429", _answer("Too many requests"))
    return result
