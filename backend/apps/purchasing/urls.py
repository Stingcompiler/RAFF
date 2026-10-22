from django.urls import URLPattern, URLResolver, path

from apps.purchasing import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("suppliers/", views.SupplierListView.as_view()),
    path("purchasing/receipts/", views.ReceiptListView.as_view()),
    path("purchasing/receipts/<uuid:pk>/", views.ReceiptDetailView.as_view()),
    path("purchasing/receipts/<uuid:pk>/post/", views.ReceiptPostView.as_view()),
]
