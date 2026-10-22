from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from config.views import health

api_v1 = [
    path("health/", health, name="health"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
]

urlpatterns = [
    path("api/v1/", include(api_v1)),
]
