from django.urls import URLPattern, URLResolver, path

from apps.catalog import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("catalog/items/", views.ItemListView.as_view()),
    path("catalog/items/<uuid:pk>/", views.ItemDetailView.as_view()),
    path("catalog/items/<uuid:pk>/prices/", views.ItemPriceView.as_view()),
    path("catalog/barcode/", views.BarcodeLookupView.as_view()),
    path("catalog/export/", views.ExportView.as_view()),
    path("catalog/categories/", views.CategoryListView.as_view()),
    path("catalog/price-lists/", views.PriceListListView.as_view()),
    path("catalog/imports/", views.ImportView.as_view()),
    path("catalog/imports/<uuid:pk>/", views.ImportDetailView.as_view()),
    path("catalog/imports/<uuid:pk>/apply/", views.ImportApplyView.as_view()),
]
