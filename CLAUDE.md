# Raff (رَفّ) — pharmacy management system

Standalone, single-organization deployment, SaaS-ready by design. This file is the operating contract for Claude Code. Read it fully before any task. The product spec lives in `docs/spec/`; the design system is `docs/design/` (Design Reference v2.2, Raff's `PROJECT_PROFILE.yaml` and `DECISIONS.md`); `design/handoff/` is the previous approved design, kept as an archive. When this file and a task prompt disagree, this file wins; when this file and `docs/spec/` disagree, stop and report.

## Stack

- Frontend: Next.js (App Router, TypeScript), Tailwind v4, Lucide, next-intl, TanStack Query, React Hook Form + Zod, types generated from OpenAPI.
- Backend: Django + DRF, PostgreSQL (never SQLite, including tests), psycopg. drf-spectacular for OpenAPI.
- Infra: Docker Compose, Caddy, Gunicorn. Playwright for e2e and visual tests.
- Package managers: pnpm (frontend), uv (backend). Lockfiles are committed. No `latest` tags anywhere.

## Commands

```
make dev          # compose up: postgres, backend, frontend
make test         # backend pytest on real Postgres
make e2e          # playwright journeys
make visual       # playwright screenshot comparison against the committed baselines
make visual-update # rewrite this machine's baselines (review the images before committing)
make tokens       # regenerate frontend/src/styles/tokens.css from design/system/build_tokens.py
make contrast     # tokens.css up to date + WCAG pairs in both themes (part of make lint)
make lint         # ruff, eslint, stylelint, prettier --check
make typecheck    # mypy --strict (backend), tsc --noEmit (frontend)
make openapi      # regenerate schema + frontend types; CI fails on undocumented diff
make check        # all of the above; must be green before any PR
```

## Non-negotiable rules

### Tenancy (SaaS readiness)
1. Every model that holds customer data has `organization_id` (FK, indexed, part of every UNIQUE constraint). Exceptions are listed explicitly in `backend/apps/tenancy/EXEMPT.md` and nowhere else. A test (`tests/test_tenancy_guard.py`) fails the build otherwise.
2. All reads go through `OrgScopedQuerySet`. All writes receive the organization from `OrgContext`, never from request data.
3. `OrgContext` resolves the organization from `SINGLE_ORG_ID` (settings) today. No code path may call `Organization.objects.first()` or hardcode an org id elsewhere.
4. Do not build: organization sign-up, org switcher, billing, subdomain routing, platform-operator screens. They are explicitly out of scope.

### Business logic
5. Business logic lives only in `apps/<app>/services/`. Serializers validate shape; views authorize and delegate; signals are forbidden for anything with financial or stock effect.
6. Every posting operation (`post_sale`, `post_receipt`, `post_return`, `close_shift`, `confirm_order`, `dispatch/receive_transfer`, `post_adjustment`) runs inside one `transaction.atomic()`, acquires row locks with `select_for_update()` in the fixed order documented in `apps/inventory/LOCKING.md`, and requires an `Idempotency-Key`. Same key + different payload → 409. Same key + same payload → cached result, no second effect.
7. Money: `Decimal` in Python, `NUMERIC(18,4)` in Postgres, transported as decimal strings. Quantities: integer base units. Rounding happens in services only, never in JS.
8. Posted documents are immutable. Corrections are reversing documents. No `DELETE` on posted rows; no silent re-edit.
9. Stock balance is a summary updated in the same transaction as the movement; the movement log is the source of truth. `CHECK (quantity_base >= 0)` on balances. Available-for-sale = balance − active reservations of other orders.
10. The server is the only source of truth. The frontend never computes totals for persistence, never shows success before the server reply, keeps the cart on failure, and resends with the same `Idempotency-Key`.

### Frontend

> **Transition (WO-15).** Rules 11, 16 and 23 are in force since WO-15a (tokens, contrast, app-generated baselines). Rule 14's density-based rows apply from WO-15b; until then rows stay 44px desktop / 48px mobile. WO-15b covers components and density, WO-15c connectivity and POS, WO-15d charts and the remaining baselines. The plan and its acceptance lists are in `docs/work-orders/WO-15-design-system-v2-2.md`.
11. Colors only via design tokens in `@theme`, named by role as in `docs/design/Design-Reference-v2.2.md` §1: `canvas surface surface-subtle surface-raised border border-strong text text-secondary text-muted text-disabled brand brand-hover brand-subtle on-brand selection-bg selection-border focus`, `success|warning|danger|info|pending` × `text|bg|border|solid`, `chart-1..5`, `scrim`, plus Raff's own `receipt-paper receipt-ink camera camera-ink`. `brand` is Raff green. `pending` is only for records saved locally and waiting to send, never a business state. No hex, rgb, or named colors outside `frontend/src/styles/tokens.css`, which is generated by `make tokens` and never edited by hand. Lint enforces it.
12. Logical CSS properties only (`ps-*`, `pe-*`, `ms-*`, `me-*`, `text-start`, `border-s`, `inset-inline-*`). `left`/`right`/`text-left`/`text-right` are forbidden. Stylelint enforces it.
13. Every user-visible string goes through next-intl (`messages/ar.json`, `messages/en.json`). No string literals in JSX except technical identifiers.
14. Type only from the named scale (`text-caption|label|body|lead|section|page|metric|total`, `text-land-*` on the storefront; `raff/no-raw-font` enforces it) and numbers, dates, ids and phones in `.num`; minimum functional text size 12px; row height follows the density mode (compact 32 / default 40 / comfortable 48), chosen app-wide in settings; touch targets ≥ 44px in every mode. State is always icon/symbol + text, never color alone. Dates render as `YYYY-MM-DD` inside a `dir="ltr"` isolated element; prices, barcodes and batch numbers likewise (`.num`).
15. Receipt/print views are always light theme and use the branch's receipt locale.
16. `docs/design/` is the reference, read in this order: `Design-Reference-v2.2.md`, `PROJECT_PROFILE.yaml`, `DECISIONS.md`. Do not change layout, copy, tokens or component states to "improve" them. A deviation that is local and reversible is allowed only when recorded in `docs/design/DECISIONS.md` in its format (what, why, scope, effect, how to reverse); a change of identity or navigation is recorded before it is built. If something is impossible or contradictory, stop and write it to `docs/spec/BACKLOG.md` with a proposal; do not improvise. Never build a feature, field or permission because it appears in a picture.

### Security
17. Session cookie HttpOnly + Secure + SameSite=Lax, CSRF on every state change including login/logout. No tokens in localStorage/sessionStorage/IndexedDB. CSP without `unsafe-inline` scripts.
18. Public storefront endpoints (`/api/v1/public/...`) are unauthenticated, rate-limited by IP and phone, and must never return stock quantities, cost, internal notes, staff names or other customers' data. A contract test asserts this.
19. Object lookups across organizations return 404, never 403. Tracking tokens are 32 random bytes, expiring; no PII in URLs.
20. Secrets only in environment files outside git. `DEBUG=False` in anything but `dev`.

### Testing
21. Every work order ends with its acceptance list green in CI. Tests are not weakened, skipped or marked flaky to pass.
22. Concurrency tests use two real DB connections (`transaction=True`, threads), not a single test transaction.
23. Visual tests compare each screen listed in `docs/spec/BUILD-SPEC-STANDALONE-AR.md` §4.4 against committed Playwright baselines (`ar-light`, `en-dark`, 1440 and 390). Tolerance 2% pixels. A baseline changes only through `make visual-update` in a PR whose description shows before/after and is reviewed by a person; baselines are never hand-edited. Baselines are committed only for Linux (`*-linux.png`, written by the "Visual baselines (Linux)" workflow); macOS runs write untracked local ones. The `design/handoff/reference/` PNGs are an archive.

### Process
24. One work order per branch (`wo/00-bootstrap`, `wo/05-pos`, …). The PR title is the WO id; the PR body contains the acceptance list with each item checked and the evidence (test name, screenshot path).
25. Stay inside the work order's scope even when you notice adjacent gaps. Write them to `docs/spec/BACKLOG.md` instead.
26. Never modify `design/handoff/*` (archive), `docs/design/*`, `docs/spec/*` (except `BACKLOG.md`), tokens, or message files' approved copy without a work order that says so. `frontend/src/styles/tokens.css` changes only by regenerating it.
27. Commit messages: `WO-05: post_sale locking and idempotency` — imperative, scoped, one concern per commit. Do not amend or force-push shared branches.
28. If a required decision is missing (e.g. cost policy, reservation TTL), do not pick one silently: implement behind a named setting with the documented default, and record the open decision in `BACKLOG.md`.

## Repository map

```
CLAUDE.md
docs/spec/                 BUILD-SPEC-STANDALONE-AR.md, UI-BUILD-BRIEF-AR.md, STOREFRONT-DESIGN-CHANGES-AR.md, PHARMACY-WEBSITE-AND-STORE-SPEC-AR.md, BACKLOG.md
docs/design/               Design Reference v2.2, PROJECT_PROFILE.yaml, DECISIONS.md (the design system)
docs/work-orders/          work order plans (WO-15 design system migration)
design/handoff/            archive: previous approved .dc.html package, HANDOFF.md, screenshots/, reference/, generate-reference.mjs, README.md
frontend/                  Next.js app
  src/app/(marketing)      product landing /ar /en
  src/app/(storefront)     public pharmacy site
  src/app/(auth)           login, branch/counter selection
  src/app/(workspace)      pos, dashboard, inventory, purchases, returns, stocktake, shifts, parties, transfers, reports, orders, storefront, settings
  src/features/*           feature modules (components, hooks, api)
  src/components/ui/*      design-system components, one file per component, all states
  src/lib/{api,auth,i18n,theme}
  src/styles/tokens.css    the only place with color values (generated from the design system)
  messages/{ar,en}.json
backend/
  config/settings/{base,dev,test,prod}.py
  apps/{tenancy,accounts,licensing,catalog,inventory,purchasing,sales,returns,finance,transfers,storefront,orders,notifications,audit,sync,backup}
    models.py  services/  selectors.py  serializers.py  views.py  urls.py  tests/
infra/                     compose/, caddy/, backup/, install.sh, restore.sh, update.sh
tests/e2e/                 playwright journeys + visual
.github/workflows/ci.yml
```

## Definition of done (per work order)

`make check` green in CI · acceptance list checked with evidence in the PR · no rule above violated · `docs/` updated if a contract or decision changed · `BACKLOG.md` updated with anything discovered and not done.
