"""A row lock must cover the document being posted, never the rows it is joined to.

`select_for_update()` next to `select_related()` locks every joined table too. Locking
the branch, batch or location row serialises unrelated postings and, because the foreign
key checks at COMMIT need those rows, deadlocks a goods receipt against a sale on the same
shelf (seen in e2e: "deadlock detected ... inventory_location FOR KEY SHARE").
LOCKING.md orders the locks; this keeps each lock to the row it names.
"""

import ast
import pathlib

APPS = pathlib.Path(__file__).resolve().parent.parent / "apps"


def _chain(node: ast.Call) -> list[ast.Call]:
    """Every call in a method chain like a.b().c().d(), from the outermost inwards."""
    calls = []
    current: ast.AST = node
    while isinstance(current, ast.Call):
        calls.append(current)
        func = current.func
        current = func.value if isinstance(func, ast.Attribute) else None  # type: ignore[assignment]
    return calls


def _method(call: ast.Call) -> str:
    return call.func.attr if isinstance(call.func, ast.Attribute) else ""


def test_select_for_update_with_joins_names_its_own_table() -> None:
    offenders = []
    for path in sorted(APPS.rglob("*.py")):
        if "tests" in path.parts or "migrations" in path.parts:
            continue
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            chain = _chain(node)
            names = {_method(c) for c in chain}
            if "select_for_update" not in names or "select_related" not in names:
                continue
            lock = next(c for c in chain if _method(c) == "select_for_update")
            if not any(k.arg == "of" for k in lock.keywords):
                offenders.append(f"{path.relative_to(APPS.parent)}:{lock.lineno}")
    assert sorted(set(offenders)) == [], (
        'select_for_update() with select_related() must pass of=("self",): ' + ", ".join(offenders)
    )
