"""Static checks that every model is organization-scoped (CLAUDE.md rule 1)."""

from __future__ import annotations

import re
from collections.abc import Iterable
from pathlib import Path

from django.core.exceptions import FieldDoesNotExist
from django.db import models

EXEMPT_FILE = Path(__file__).with_name("EXEMPT.md")
_EXEMPT_ROW = re.compile(r"^\|\s*`([a-z_]+\.[A-Za-z0-9_]+)`\s*\|")


def load_exempt(path: Path = EXEMPT_FILE) -> set[str]:
    """Parse `app_label.ModelName` entries from the table in EXEMPT.md."""
    exempt: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        match = _EXEMPT_ROW.match(line)
        if match:
            exempt.add(match.group(1))
    return exempt


def model_violations(model: type[models.Model]) -> list[str]:
    """Return the tenancy rule violations of one concrete model."""
    label = f"{model._meta.app_label}.{model.__name__}"
    try:
        field = model._meta.get_field("organization")
    except FieldDoesNotExist:
        return [f"{label}: no organization_id"]

    problems: list[str] = []
    remote = getattr(field, "related_model", None)
    if (
        not isinstance(field, models.ForeignKey)
        or remote is None
        or (f"{remote._meta.app_label}.{remote.__name__}" != "tenancy.Organization")
    ):
        problems.append(f"{label}: organization is not a FK to tenancy.Organization")
    elif not getattr(field, "db_index", False):
        problems.append(f"{label}: organization_id is not indexed")

    for f in model._meta.local_fields:
        if f.unique and not f.primary_key:
            problems.append(f"{label}: field {f.name} is globally unique; scope it by organization")
    for fields in model._meta.unique_together:
        if "organization" not in fields:
            problems.append(f"{label}: unique_together {tuple(fields)} lacks organization")
    for constraint in model._meta.constraints:
        if not isinstance(constraint, models.UniqueConstraint):
            continue
        if "organization" not in constraint.fields:
            problems.append(f"{label}: UNIQUE {constraint.name} lacks organization")
    return problems


def find_violations(model_list: Iterable[type[models.Model]], exempt: set[str]) -> list[str]:
    problems: list[str] = []
    for model in model_list:
        meta = model._meta
        if meta.abstract or meta.proxy or not meta.managed:
            continue
        if meta.auto_created:  # implicit M2M through tables follow their owner
            continue
        if f"{meta.app_label}.{model.__name__}" in exempt:
            continue
        problems.extend(model_violations(model))
    return problems
