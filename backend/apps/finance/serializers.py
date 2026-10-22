# Serializers validate shape only; business logic lives in services/.
from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.finance.models import PartyLedgerEntry, PartyPayment


class PartySerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name_ar = serializers.CharField()
    name_en = serializers.CharField()
    phone = serializers.CharField(allow_blank=True)
    balance = serializers.DecimalField(max_digits=18, decimal_places=4)
    credit_limit = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    last_activity = serializers.DateTimeField(allow_null=True)


class LedgerRowSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    date = serializers.DateTimeField()
    document_type = serializers.CharField()
    document_number = serializers.CharField(allow_blank=True)
    debit = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    credit = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    balance = serializers.DecimalField(max_digits=18, decimal_places=4)


class PartyPaymentInSerializer(serializers.Serializer[None]):
    party_type = serializers.ChoiceField(choices=PartyLedgerEntry.Party.choices)
    party_id = serializers.UUIDField()
    method = serializers.ChoiceField(choices=PartyPayment.Method.choices)
    amount = serializers.DecimalField(max_digits=18, decimal_places=4)
    reference = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class PartyPaymentResultSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    number = serializers.CharField()
    amount = serializers.DecimalField(max_digits=18, decimal_places=4)


class BankTransferSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    sale_number = serializers.CharField()
    posted_at = serializers.DateTimeField()
    bank_reference = serializers.CharField()
    bank_account = serializers.CharField(allow_blank=True)
    amount = serializers.DecimalField(max_digits=18, decimal_places=4)
    verification = serializers.CharField()


class VerifyResultSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    verification = serializers.CharField()
