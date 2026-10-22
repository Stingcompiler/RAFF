from django.urls import URLPattern, URLResolver, path

from apps.licensing import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("licensing/status/", views.LicenseStatusView.as_view()),
]
