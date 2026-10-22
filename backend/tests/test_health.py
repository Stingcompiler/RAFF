import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_health_reports_ok_without_authentication() -> None:
    response = APIClient().get("/api/v1/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "version": "dev"}


def test_health_rejects_state_changes() -> None:
    response = APIClient().post("/api/v1/health/")
    assert response.status_code == 405
