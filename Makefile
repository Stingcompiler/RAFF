# Raff — every command CI runs is runnable here. `make check` = the whole CI.
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

ENV_FILE := infra/compose/.env
COMPOSE := docker compose -f infra/compose/compose.yaml --env-file $(ENV_FILE)

# Local runs read database credentials from the Compose env file when present;
# CI sets the same variables directly.
-include $(ENV_FILE)
POSTGRES_HOST ?= localhost
POSTGRES_PORT ?= 5432
POSTGRES_DB ?= raff
POSTGRES_USER ?= raff
POSTGRES_PASSWORD ?=
DJANGO_SECRET_KEY ?= local-only-not-a-secret
export POSTGRES_HOST POSTGRES_PORT POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DJANGO_SECRET_KEY
# The frontend dev container runs as the owner of the checkout.
export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)

MANAGE := uv run --directory backend python manage.py

.PHONY: install dev demo down test perf e2e visual lint typecheck openapi openapi-check reference check

install:
	uv sync --directory backend
	pnpm install --frozen-lockfile
	pnpm exec playwright install chromium

dev:
	./infra/compose/init-env.sh
	$(COMPOSE) up --detach --build --wait --wait-timeout 300 || ($(COMPOSE) logs --tail 200 && exit 1)
	@echo "frontend http://localhost:3000/  ·  api http://localhost:8000/api/v1/health/"

# Sample organization, branches, counters and users (password: RAFF_DEMO_PASSWORD in the env file).
demo:
	$(COMPOSE) exec backend python manage.py seed_demo
	@echo "sign in at http://localhost:3000/login as admin, mazin, salma or huda"

down:
	$(COMPOSE) down

test:
	cd backend && uv run pytest

# Performance targets on generated data (search p95 <= 1 s, approval p95 <= 2 s; 50k movements).
perf:
	cd backend && uv run pytest -m perf -s tests/test_performance.py

# Build (with /api pointed at the Playwright backend, port 8100) and run the browser tests.
# The same pnpm scripts run in CI, inside the Playwright image (which has no make).
e2e:
	pnpm e2e

visual:
	pnpm visual

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	pnpm --dir frontend lint
	pnpm format:check

typecheck:
	cd backend && uv run mypy .
	pnpm --dir frontend typecheck
	pnpm exec tsc --noEmit -p tsconfig.json

openapi:
	$(MANAGE) spectacular --file openapi/schema.yaml --validate --fail-on-warn
	pnpm --dir frontend openapi

# Fails when the committed schema or generated types are out of date.
openapi-check: openapi
	git diff --exit-code -- backend/openapi frontend/src/lib/api/schema.d.ts
	@test -z "$$(git ls-files --others --exclude-standard -- backend/openapi frontend/src/lib/api)" \
		|| (echo "Untracked OpenAPI output; commit it." && exit 1)

# Canonical references come from CI (.github/workflows/references.yml, Linux).
# Locally this makes the macOS copy used by `make visual` on a Mac.
reference:
	node design/handoff/generate-reference.mjs --local

check: lint typecheck test openapi-check e2e visual
