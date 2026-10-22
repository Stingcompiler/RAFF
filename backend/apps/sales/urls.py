from django.urls import URLPattern, URLResolver, path

from apps.sales import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("pos/items/", views.PosItemsView.as_view()),
    path("pos/barcode/", views.PosBarcodeView.as_view()),
    path("pos/missing/", views.MissingItemView.as_view()),
    path("sales/quote/", views.QuoteView.as_view()),
    path("sales/", views.SaleListView.as_view()),
    path("sales/by-key/<str:key>/", views.SaleByKeyView.as_view()),
    path("sales/held/", views.HeldListView.as_view()),
    path("sales/held/<uuid:pk>/resume/", views.HeldResumeView.as_view()),
    path("sales/<uuid:pk>/", views.SaleDetailView.as_view()),
    path("sales/<uuid:pk>/receipt/", views.SaleReceiptView.as_view()),
    path("sales/<uuid:pk>/print/", views.SalePrintView.as_view()),
    path("shifts/current/", views.CurrentShiftView.as_view()),
    path("shifts/", views.ShiftOpenView.as_view()),
    path("shifts/<uuid:pk>/close/", views.ShiftCloseView.as_view()),
    path("customers/", views.CustomerListView.as_view()),
]
