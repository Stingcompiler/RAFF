"""Collections from customers, payments to suppliers, and bank-transfer verification."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.audit.services.log import record
from apps.finance.models import Customer, PartyLedgerEntry, PartyPayment
from apps.finance.money import money
from apps.finance.services.ledger import charge_customer, charge_supplier, post_journal
from apps.sync.services.idempotency import run_once
from apps.sync.services.sequences import next_number
from apps.tenancy import clock
from apps.tenancy.models import Branch

CASH_OR_BANK = {"cash": "1000", "bank": "1010"}


class PaymentError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def payment_payload(
    party_type: str,
    party_id: uuid.UUID,
    method: str,
    amount: Decimal,
    reference: str,
    branch_id: uuid.UUID,
    note: str,
) -> dict[str, Any]:
    """Every field the payment records: the same key with any of them changed is a 409 (B-05)."""
    return {
        "party_type": party_type,
        "party": str(party_id),
        "method": method,
        "amount": str(money(amount)),
        "reference": reference,
        "branch": str(branch_id),
        "note": note.strip(),
    }


@transaction.atomic
def record_payment(
    *,
    branch: Branch,
    party_type: str,
    party_id: uuid.UUID,
    method: str,
    amount: Decimal,
    reference: str,
    note: str,
    idempotency_key: str | None,
    user: User,
) -> dict[str, Any]:
    """A customer pays us (receivable down) or we pay a supplier (payable down)."""
    amount = money(amount)

    def action() -> dict[str, Any]:
        if amount <= 0:
            raise PaymentError("invalid_amount")
        if method not in CASH_OR_BANK:
            raise PaymentError("invalid_method")
        if method == "bank" and not reference.strip():
            raise PaymentError("bank_reference_required")
        payment = PartyPayment.objects.create(
            number=next_number("party_payment", "PAY"),
            branch=branch,
            party_type=party_type,
            party_id=party_id,
            method=method,
            amount=amount,
            reference=reference.strip(),
            note=note,
            idempotency_key=idempotency_key or "",
            created_by=user,
        )
        money_account = CASH_OR_BANK[method]
        if party_type == PartyLedgerEntry.Party.CUSTOMER:
            customer = Customer.objects.filter(pk=party_id).first()
            if customer is None:
                raise PaymentError("unknown_party")
            lines = [(money_account, amount, Decimal(0)), ("1100", Decimal(0), amount)]
            post_journal(
                branch=branch,
                date=clock.today(),
                document_type="party_payment",
                document_id=payment.pk,
                lines=lines,
                memo=payment.number,
            )
            charge_customer(
                customer,
                -amount,
                document_type="party_payment",
                document_id=payment.pk,
                enforce_limit=False,
            )
        elif party_type == PartyLedgerEntry.Party.SUPPLIER:
            from apps.purchasing.models import Supplier

            if not Supplier.objects.filter(pk=party_id).exists():
                raise PaymentError("unknown_party")
            post_journal(
                branch=branch,
                date=clock.today(),
                document_type="party_payment",
                document_id=payment.pk,
                lines=[("2000", amount, Decimal(0)), (money_account, Decimal(0), amount)],
                memo=payment.number,
            )
            charge_supplier(
                party_id, -amount, document_type="party_payment", document_id=payment.pk
            )
        else:
            raise PaymentError("invalid_party")
        record(
            "post",
            "party_payment",
            payment.pk,
            actor=user,
            branch=branch,
            party_type=party_type,
            amount=str(amount),
            method=method,
        )
        return {"id": str(payment.pk), "number": payment.number, "amount": str(amount)}

    return run_once(
        "party_payment",
        idempotency_key,
        payment_payload(party_type, party_id, method, amount, reference, branch.pk, note),
        action,
    )


@transaction.atomic
def verify_transfer(payment_id: uuid.UUID, user: User) -> dict[str, Any]:
    """Confirm a bank transfer arrived: move it from 'awaiting verification' to the bank."""
    from apps.sales.models import Payment

    payment = (
        Payment.objects.select_for_update(of=("self",))
        .select_related("sale__branch")
        .get(pk=payment_id)
    )
    if payment.method != Payment.Method.BANK:
        raise PaymentError("not_a_transfer")
    if payment.verification == Payment.Verification.CONFIRMED:
        return {"id": str(payment.pk), "verification": payment.verification}
    post_journal(
        branch=payment.sale.branch,
        date=clock.today(),
        document_type="bank_verify",
        document_id=payment.pk,
        lines=[("1010", payment.amount, Decimal(0)), ("1020", Decimal(0), payment.amount)],
        memo=payment.bank_reference,
    )
    payment.verification = Payment.Verification.CONFIRMED
    payment.save(update_fields=["verification"])
    record(
        "verify",
        "bank_transfer",
        payment.pk,
        actor=user,
        branch=payment.sale.branch,
        amount=str(payment.amount),
        at=timezone.now().isoformat(),
    )
    return {"id": str(payment.pk), "verification": payment.verification}
