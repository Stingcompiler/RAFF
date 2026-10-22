# Raff (رَفّ) — pharmacy management system

Standalone, single-organization deployment, SaaS-ready by design. This file is the operating contract for Claude Code. Read it fully before any task. The product spec lives in `docs/spec/`; the approved UI lives in `design/handoff/`. When this file and a task prompt disagree, this file wins; when this file and `docs/spec/` disagree, stop and report.

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
make visual       # playwright screenshot comparison against design/handoff reference shots
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
11. Colors only via design tokens in `@theme` (`bg surface surface-raised sidebar ink muted line primary primary-ink accent success success-bg warn warn-bg danger danger-bg info info-bg focus brand brand-ink`). No hex, rgb, or named colors outside `frontend/src/styles/tokens.css`. Lint enforces it.
12. Logical CSS properties only (`ps-*`, `pe-*`, `ms-*`, `me-*`, `text-start`, `border-s`, `inset-inline-*`). `left`/`right`/`text-left`/`text-right` are forbidden. Stylelint enforces it.
13. Every user-visible string goes through next-intl (`messages/ar.json`, `messages/en.json`). No string literals in JSX except technical identifiers.
14. Minimum functional text size 12px; rows 44px desktop / 48px mobile; touch targets ≥ 44px. State is always icon/symbol + text, never color alone. Dates render as `YYYY-MM-DD` inside a `dir="ltr"` isolated element; prices, barcodes and batch numbers likewise.
15. Receipt/print views are always light theme and use the branch's receipt locale.
16. The approved design in `design/handoff/` is the reference. Do not change layout, copy, tokens or component states to "improve" them. If something in the design is impossible or contradictory, stop and write it to `docs/spec/BACKLOG.md` with a proposal; do not improvise.

### Security
17. Session cookie HttpOnly + Secure + SameSite=Lax, CSRF on every state change including login/logout. No tokens in localStorage/sessionStorage/IndexedDB. CSP without `unsafe-inline` scripts.
18. Public storefront endpoints (`/api/v1/public/...`) are unauthenticated, rate-limited by IP and phone, and must never return stock quantities, cost, internal notes, staff names or other customers' data. A contract test asserts this.
19. Object lookups across organizations return 404, never 403. Tracking tokens are 32 random bytes, expiring; no PII in URLs.
20. Secrets only in environment files outside git. `DEBUG=False` in anything but `dev`.

### Testing
21. Every work order ends with its acceptance list green in CI. Tests are not weakened, skipped or marked flaky to pass.
22. Concurrency tests use two real DB connections (`transaction=True`, threads), not a single test transaction.
23. Visual tests compare each screen listed in `docs/spec/BUILD-SPEC-STANDALONE-AR.md` §4.4 against the reference PNGs in `design/handoff/reference/` (`ar-light`, `en-dark`, 1440 and 390). Tolerance 2% pixels. Reference PNGs are generated only by `design/handoff/generate-reference.mjs`, never hand-edited.

### Process
24. One work order per branch (`wo/00-bootstrap`, `wo/05-pos`, …). The PR title is the WO id; the PR body contains the acceptance list with each item checked and the evidence (test name, screenshot path).
25. Stay inside the work order's scope even when you notice adjacent gaps. Write them to `docs/spec/BACKLOG.md` instead.
26. Never modify `design/handoff/*`, `docs/spec/*` (except `BACKLOG.md`), tokens, or message files' approved copy without a work order that says so.
27. Commit messages: `WO-05: post_sale locking and idempotency` — imperative, scoped, one concern per commit. Do not amend or force-push shared branches.
28. If a required decision is missing (e.g. cost policy, reservation TTL), do not pick one silently: implement behind a named setting with the documented default, and record the open decision in `BACKLOG.md`.

## Repository map

```
CLAUDE.md
docs/spec/                 BUILD-SPEC-STANDALONE-AR.md, UI-BUILD-BRIEF-AR.md, STOREFRONT-DESIGN-CHANGES-AR.md, PHARMACY-WEBSITE-AND-STORE-SPEC-AR.md, BACKLOG.md
design/handoff/            approved .dc.html package, HANDOFF.md, screenshots/, reference/, generate-reference.mjs, README.md
frontend/                  Next.js app
  src/app/(marketing)      product landing /ar /en
  src/app/(storefront)     public pharmacy site
  src/app/(auth)           login, branch/counter selection
  src/app/(workspace)      pos, dashboard, inventory, purchases, returns, stocktake, shifts, parties, transfers, reports, orders, storefront, settings
  src/features/*           feature modules (components, hooks, api)
  src/components/ui/*      design-system components, one file per component, all states
  src/lib/{api,auth,i18n,theme}
  src/styles/tokens.css    the only place with color values
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
