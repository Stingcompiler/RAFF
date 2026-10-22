"""Build guard: every model carries organization_id unless listed in EXEMPT.md."""

from __future__ import annotations

from pathlib import Path

import pytest
from django.apps import apps
from django.db import models
from django.test.utils import isolate_apps

from apps.tenancy.guard import find_violations, load_exempt
from apps.tenancy.models import Organization, OrgScopedModel


def test_every_installed_model_is_org_scoped() -> None:
    violations = find_violations(apps.get_models(), load_exempt())
    assert violations == [], "\n".join(violations)


def test_exempt_list_names_only_installed_models() -> None:
    installed = {f"{m._meta.app_label}.{m.__name__}" for m in apps.get_models()}
    stale = load_exempt() - installed
    assert stale == set(), f"EXEMPT.md lists models that do not exist: {sorted(stale)}"


# Negative tests: the guard must actually fail on bad models.


@isolate_apps("apps.tenancy")
def test_guard_rejects_model_without_organization() -> None:
    class Unscoped(models.Model):
        name = models.CharField(max_length=10)

        class Meta:
            app_label = "tenancy"

    violations = find_violations([Unscoped], load_exempt())
    assert violations == ["tenancy.Unscoped: no organization_id"]
    with pytest.raises(AssertionError):
        assert violations == []


@isolate_apps("apps.tenancy")
def test_guard_rejects_unique_constraint_without_organization() -> None:
    class Item(OrgScopedModel):
        code = models.CharField(max_length=10)
        sku = models.CharField(max_length=10, unique=True)

        class Meta:
            app_label = "tenancy"
            constraints = [models.UniqueConstraint(fields=["code"], name="item_code_uniq")]

    violations = find_violations([Item], load_exempt())
    assert "tenancy.Item: field sku is globally unique; scope it by organization" in violations
    assert "tenancy.Item: UNIQUE item_code_uniq lacks organization" in violations


@isolate_apps("apps.tenancy")
def test_guard_rejects_unindexed_or_foreign_organization_field() -> None:
    class Other(models.Model):
        class Meta:
            app_label = "tenancy"

    class WrongTarget(models.Model):
        organization = models.ForeignKey(Other, on_delete=models.CASCADE)

        class Meta:
            app_label = "tenancy"

    class Unindexed(models.Model):
        organization = models.ForeignKey(Organization, on_delete=models.PROTECT, db_index=False)

        class Meta:
            app_label = "tenancy"

    assert find_violations([WrongTarget, Unindexed], set()) == [
        "tenancy.WrongTarget: organization is not a FK to tenancy.Organization",
        "tenancy.Unindexed: organization_id is not indexed",
    ]


@isolate_apps("apps.tenancy")
def test_guard_accepts_properly_scoped_model() -> None:
    class Scoped(OrgScopedModel):
        code = models.CharField(max_length=10)

        class Meta:
            app_label = "tenancy"
            constraints = [
                models.UniqueConstraint(fields=["organization", "code"], name="scoped_code_uniq")
            ]

    assert find_violations([Scoped], set()) == []


def test_exempt_file_is_the_only_source_of_exemptions(tmp_path: Path) -> None:
    fake = tmp_path / "EXEMPT.md"
    fake.write_text("| Model | Reason |\n|---|---|\n| `tenancy.Organization` | tenant |\n")
    assert load_exempt(fake) == {"tenancy.Organization"}
    violations = find_violations(apps.get_models(), load_exempt(fake))
    assert "contenttypes.ContentType: no organization_id" in violations
