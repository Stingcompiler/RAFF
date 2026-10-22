from django.urls import URLPattern, URLResolver, path

from apps.tenancy import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("devices/", views.DeviceListView.as_view()),
    path("devices/<uuid:pk>/register/", views.DeviceRegisterView.as_view()),
]
