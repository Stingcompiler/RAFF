from __future__ import annotations

from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

from .context import _current_org_id, resolve_org_id


class OrgContextMiddleware:
    """Bind the request to its organization for the duration of the request."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        org_id = resolve_org_id()
        request.org_id = org_id  # type: ignore[attr-defined]
        token = _current_org_id.set(org_id)
        try:
            return self.get_response(request)
        finally:
            _current_org_id.reset(token)
