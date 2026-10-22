from django.urls import URLPattern, URLResolver, path

from apps.backup import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("backup/status/", views.BackupStatusView.as_view()),
]
