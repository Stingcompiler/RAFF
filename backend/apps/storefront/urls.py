from django.urls import URLPattern, URLResolver, path

from apps.storefront import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("public/store/", views.PublicStoreView.as_view()),
    path("public/categories/", views.PublicCategoriesView.as_view()),
    path("public/products/", views.PublicProductsView.as_view()),
    path("public/products/<slug:slug>/", views.PublicProductView.as_view()),
    path("storefront/settings/", views.StorefrontSettingsView.as_view()),
    path("storefront/listings/", views.ListingListView.as_view()),
    path("storefront/listings/<uuid:pk>/", views.ListingDetailView.as_view()),
    path("storefront/listings/<uuid:pk>/image/", views.ListingImageView.as_view()),
]
