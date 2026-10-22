from django.urls import URLPattern, URLResolver, path

from apps.audit import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("audit/events/", views.AuditEventListView.as_view()),
]
