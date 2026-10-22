"""Request ids for logs and responses, and an alert when server errors pile up."""

from __future__ import annotations

import contextvars
import logging
import re
import uuid
from collections.abc import Callable

from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest, HttpResponse

_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
VALID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
ERRORS_KEY = "raff:errors:10m"
log = logging.getLogger("raff.requests")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id.get()
        return True


class RequestIdMiddleware:
    """Every response carries X-Request-ID (the client's, if well-formed, or a new one)."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        incoming = request.headers.get("X-Request-ID", "")
        rid = incoming if VALID.match(incoming) else uuid.uuid4().hex[:12]
        token = _request_id.set(rid)
        try:
            response = self.get_response(request)
            if response.status_code >= 500:
                server_error()
        finally:
            _request_id.reset(token)
        response["X-Request-ID"] = rid
        return response


def server_error() -> None:
    """Count 5xx responses; alert once when the 10-minute count reaches the threshold."""
    try:
        cache.add(ERRORS_KEY, 0, timeout=600)
        count = cache.incr(ERRORS_KEY)
    except Exception:  # the cache must never turn one error into two
        return
    if count == settings.RAFF_ALERT_ERRORS:
        log.error("server errors: %s in 10 minutes", count)
        from apps.notifications.services.notify import ops_alert

        ops_alert("errors", f"Raff: {count} server errors in the last 10 minutes")
