from django.urls import URLPattern, URLResolver, path

from apps.inventory import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("inventory/items/", views.StockListView.as_view()),
    path("inventory/items/<uuid:pk>/", views.ItemStockView.as_view()),
    path("inventory/items/<uuid:pk>/batches/", views.ItemBatchesView.as_view()),
    path("inventory/items/<uuid:pk>/movements/", views.ItemMovementsView.as_view()),
    path("inventory/batches/<uuid:pk>/release/", views.ReleaseBatchView.as_view()),
]
