from django.urls import URLPattern, URLResolver, include, path
from drf_spectacular.views import SpectacularAPIView

from config.views import health

api_v1: list[URLPattern | URLResolver] = [
    path("health/", health, name="health"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("", include("apps.accounts.urls")),
    path("", include("apps.tenancy.urls")),
    path("", include("apps.licensing.urls")),
]

urlpatterns = [
    path("api/v1/", include(api_v1)),
]
