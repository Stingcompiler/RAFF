from django.urls import URLPattern, URLResolver, include, path
from drf_spectacular.views import SpectacularAPIView

from config.views import health

api_v1: list[URLPattern | URLResolver] = [
    path("health/", health, name="health"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("", include("apps.accounts.urls")),
    path("", include("apps.tenancy.urls")),
    path("", include("apps.licensing.urls")),
    path("", include("apps.catalog.urls")),
    path("", include("apps.inventory.urls")),
    path("", include("apps.purchasing.urls")),
    path("", include("apps.sales.urls")),
    path("", include("apps.returns.urls")),
]

urlpatterns = [
    path("api/v1/", include(api_v1)),
]
