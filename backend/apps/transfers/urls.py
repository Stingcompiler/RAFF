from django.urls import URLPattern, URLResolver, path

from apps.transfers import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("transfers/", views.TransferListView.as_view()),
    path("transfers/<uuid:pk>/", views.TransferDetailView.as_view()),
    path("transfers/<uuid:pk>/send/", views.TransferSendView.as_view()),
    path("transfers/<uuid:pk>/receive/", views.TransferReceiveView.as_view()),
]
