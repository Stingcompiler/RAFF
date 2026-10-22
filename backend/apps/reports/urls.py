from django.urls import URLPattern, URLResolver, path

from apps.reports import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("reports/<slug:name>/", views.ReportView.as_view()),
    path("dashboard/", views.OverviewView.as_view()),
]
