#!/usr/bin/env bash
# Shared helpers for install.sh, backup/backup.sh, restore.sh and update.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD="$ROOT/infra/prod"
ENV_FILE="$PROD/.env"
KEY_FILE="${RAFF_BACKUP_KEY:-$PROD/backup.key}"

log() { printf '\033[1;32m[raff]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[raff]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[raff]\033[0m %s\n' "$*" >&2; exit 1; }

compose() { docker compose -p raff -f "$PROD/compose.yaml" --env-file "$ENV_FILE" "$@"; }

require_docker() {
  command -v docker >/dev/null || die "Docker is not installed. See docs/runbooks/install.md (step 1)."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (docker compose)."
}

load_env() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE not found: run infra/install.sh first."
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

# `head` closes the pipe early by design; under pipefail that SIGPIPE must not count as failure.
rand() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c "$1" || true; }
new_uuid() { cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen | tr 'A-Z' 'a-z'; }

# Replace KEY=... in the env file (or append it).
set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    local tmp; tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" -F= 'BEGIN{OFS="="} $1==k {print k, v; next} {print}' "$ENV_FILE" >"$tmp"
    cat "$tmp" >"$ENV_FILE" && rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

# Create infra/prod/.env with fresh secrets for this address (no-op if it exists).
write_env() {
  local address="$1" org_id="${2:-}"
  [ -f "$ENV_FILE" ] && return 0
  umask 077
  cp "$PROD/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  local host origin
  if [ "$address" = ":80" ] || [ "${address#http://}" != "$address" ]; then
    host="localhost"; origin="http://localhost"
  else
    host="$address"; origin="https://$address"
  fi
  set_env SITE_ADDRESS "$address"
  set_env SITE_HOST "$host"
  set_env SITE_ORIGIN "$origin"
  set_env POSTGRES_PASSWORD "$(rand 32)"
  set_env DJANGO_SECRET_KEY "$(rand 50)"
  set_env SINGLE_ORG_ID "${org_id:-$(new_uuid)}"
  set_env RAFF_VERSION "$(git -C "$ROOT" describe --tags --always 2>/dev/null || echo dev)"
  log "Wrote $ENV_FILE"
}

# The backup encryption key: generated once, must be kept off this server too.
ensure_key() {
  [ -f "$KEY_FILE" ] && return 0
  umask 077
  rand 64 >"$KEY_FILE"
  chmod 600 "$KEY_FILE"
  warn "Created the backup key $KEY_FILE — copy it somewhere safe OFF this server."
  warn "Without it no backup can be restored."
}

# Wait until Django and Next answer inside their containers.
wait_healthy() {
  local deadline=$((SECONDS + ${1:-300}))
  log "Waiting for the services to become healthy…"
  until compose exec -T backend python -c \
      "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/', timeout=3)" \
      >/dev/null 2>&1 \
    && compose exec -T frontend node -e \
      "fetch('http://127.0.0.1:3000/login').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))" \
      >/dev/null 2>&1; do
    [ $SECONDS -lt "$deadline" ] || return 1
    sleep 3
  done
  log "Healthy."
}

manage() { compose exec -T backend python manage.py "$@"; }

# Refuse to start with the example file's placeholders (review D-01): an empty organization id
# or a "change-me" secret means the environment was copied by hand and never generated.
check_env() {
  local bad=""
  [ -n "${SINGLE_ORG_ID:-}" ] || bad="$bad SINGLE_ORG_ID(empty)"
  for key in DJANGO_SECRET_KEY POSTGRES_PASSWORD; do
    case "${!key:-}" in ""|change-me) bad="$bad $key(placeholder)" ;; esac
  done
  [ -z "$bad" ] || die "infra/prod/.env still has placeholders:$bad. Run infra/install.sh (it generates them)."
}

# The commit that is running now (review D-02): written after a healthy start, read by the
# next update for its rollback — never the checkout, which a `git pull` may already have moved.
DEPLOYED_FILE="$PROD/DEPLOYED"
deployed_commit() { [ -f "$DEPLOYED_FILE" ] && cat "$DEPLOYED_FILE" || git -C "$ROOT" rev-parse HEAD; }

# Backup schedule (reviews D-04): a local copy every 15 minutes kept for a day, the nightly
# copy with the off-site upload, and the weekly restore drill.
write_cron() {
  [ -d /etc/cron.d ] && [ -w /etc/cron.d ] || return 0
  cat >/etc/cron.d/raff <<CRON
# Raff backups (see docs/runbooks/backup-restore.md).
SHELL=/bin/bash
*/15 * * * * root $ROOT/infra/backup/backup.sh --frequent >>/var/log/raff-backup.log 2>&1
30 2 * * * root $ROOT/infra/backup/backup.sh >>/var/log/raff-backup.log 2>&1
30 3 * * 0 root $ROOT/infra/restore.sh --verify-latest >>/var/log/raff-backup.log 2>&1
CRON
  chmod 644 /etc/cron.d/raff
}
