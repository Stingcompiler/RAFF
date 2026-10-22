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

MANAGE := uv run --directory backend python manage.py

.PHONY: install dev down test e2e visual lint typecheck openapi openapi-check reference frontend-build check

install:
	uv sync --directory backend
	pnpm install --frozen-lockfile
	pnpm exec playwright install chromium

dev:
	./infra/compose/init-env.sh
	$(COMPOSE) up --detach --build --wait
	@echo "frontend http://localhost:3000/  ·  api http://localhost:8000/api/v1/health/"

down:
	$(COMPOSE) down

test:
	cd backend && uv run pytest

frontend-build:
	pnpm --dir frontend build

e2e: frontend-build
	pnpm exec playwright test --project=e2e

visual: frontend-build
	pnpm exec playwright test --project=visual

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

reference:
	node design/handoff/generate-reference.mjs

check: lint typecheck test openapi-check e2e visual
