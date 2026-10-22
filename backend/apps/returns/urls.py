from django.urls import URLPattern, URLResolver, path

from apps.returns import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("returns/", views.ReturnListView.as_view()),
    path("returns/lookup/", views.ReturnLookupView.as_view()),
    path("returns/quote/", views.ReturnQuoteView.as_view()),
]
