from django.urls import URLPattern, URLResolver, path

from apps.accounts import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("auth/csrf/", views.CsrfView.as_view()),
    path("auth/device/", views.DeviceInfoView.as_view()),
    path("auth/login/", views.LoginView.as_view()),
    path("auth/logout/", views.LogoutView.as_view()),
    path("auth/me/", views.MeView.as_view()),
    path("auth/context/", views.ContextView.as_view()),
    path("branches/", views.BranchListView.as_view()),
    path("branches/<uuid:pk>/", views.BranchDetailView.as_view()),
    path("roles/", views.RoleListView.as_view()),
    path("users/", views.UserListView.as_view()),
    path("users/<uuid:pk>/", views.UserDetailView.as_view()),
]
