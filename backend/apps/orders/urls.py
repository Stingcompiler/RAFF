from django.urls import URLPattern, URLResolver, path

from apps.orders import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("public/orders/", views.PlaceOrderView.as_view()),
    path("public/orders/track/", views.TrackOrderView.as_view()),
    path("public/orders/by-key/<str:key>/", views.OrderByKeyView.as_view()),
    path("public/orders/<str:token>/", views.PublicOrderView.as_view()),
    path("orders/", views.StaffOrderListView.as_view()),
    path("orders/summary/", views.OrdersSummaryView.as_view()),
    path("orders/<uuid:pk>/", views.StaffOrderView.as_view()),
    path("orders/<uuid:pk>/transition/", views.TransitionView.as_view()),
    path("orders/<uuid:pk>/lines/", views.EditLinesView.as_view()),
    path("orders/<uuid:pk>/note/", views.NoteView.as_view()),
]
