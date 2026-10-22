from django.urls import URLPattern, URLResolver, path

from apps.finance import views

urlpatterns: list[URLPattern | URLResolver] = [
    path("finance/parties/", views.PartyListView.as_view()),
    path("finance/ledger/", views.LedgerView.as_view()),
    path("finance/payments/", views.PaymentView.as_view()),
    path("finance/bank-transfers/", views.BankTransferListView.as_view()),
    path("finance/bank-transfers/<uuid:pk>/verify/", views.BankTransferVerifyView.as_view()),
]
