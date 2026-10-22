from django.conf import settings
from django.conf.urls.static import static
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
    path("", include("apps.finance.urls")),
    path("", include("apps.transfers.urls")),
    path("", include("apps.reports.urls")),
    path("", include("apps.audit.urls")),
    path("", include("apps.storefront.urls")),
    path("", include("apps.orders.urls")),
    path("", include("apps.backup.urls")),
]

urlpatterns: list[URLPattern | URLResolver] = [
    path("api/v1/", include(api_v1)),
]

if settings.DEBUG:
    # Listing images in development; Caddy serves /media/ in production (WO-10).
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
