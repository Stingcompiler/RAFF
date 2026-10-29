#!/usr/bin/env bash
# Update to a new release with a backup first and an automatic rollback on failure.
# Run it after the counters have closed their shifts.
#
#   infra/update.sh origin/main      (or a tag / commit; fetched after the running release is kept)
#   infra/update.sh                  (builds the current checkout)
#
# The rollback returns to the commit recorded in infra/prod/DEPLOYED (the release that was
# running), not to the checkout, which `git pull` may already have moved (review D-02).
. "$(dirname "$0")/lib.sh"

REF="${1:-}"
load_env
require_docker
git -C "$ROOT" diff --quiet || die "The checkout has local changes; commit or stash them first."
check_env
PREVIOUS="$(deployed_commit)"
if [ "$PREVIOUS" != "$(git -C "$ROOT" rev-parse HEAD)" ] && [ -z "$REF" ]; then
  warn "The checkout ($(git -C "$ROOT" rev-parse --short HEAD)) is not the running release ($PREVIOUS); a failure returns to the running one."
fi
PREVIOUS_VERSION="${RAFF_VERSION:-dev}"

log "1/4 Backup before updating…"
BACKUP="$("$ROOT/infra/backup/backup.sh" | tail -n 1)"
[ -f "$BACKUP" ] || die "Backup failed; nothing was changed."

log "2/4 Keeping the running images for rollback…"
docker image tag raff/backend:current raff/backend:rollback
docker image tag raff/frontend:current raff/frontend:rollback

rollback() {
  warn "Update failed: $1 — rolling back to $PREVIOUS_VERSION."
  git -C "$ROOT" checkout --quiet "$PREVIOUS"
  set_env RAFF_VERSION "$PREVIOUS_VERSION"
  docker image tag raff/backend:rollback raff/backend:current
  docker image tag raff/frontend:rollback raff/frontend:current
  # The new release may have migrated the database: put back the pre-update copy.
  "$ROOT/infra/restore.sh" "$BACKUP" --key "$KEY_FILE" --no-build >/dev/null
  wait_healthy 600 || die "Rollback finished but the services are not healthy — see docs/runbooks/update.md."
  die "Rolled back to $PREVIOUS_VERSION; data restored from $(basename "$BACKUP")."
}

log "3/4 Building the new release…"
if [ -n "$REF" ]; then
  git -C "$ROOT" fetch --quiet --tags origin || true
  git -C "$ROOT" checkout --quiet "$REF" || rollback "cannot check out $REF"
fi
NEW_VERSION="$(git -C "$ROOT" describe --tags --always)"
set_env RAFF_VERSION "$NEW_VERSION"
load_env
compose build || rollback "build failed"
compose up -d || rollback "start failed"
# The proxy's config is a single bind-mounted file: a checkout replaces it, and only a new
# container reads the new one (found when the browser-policy fix did not reach production).
compose up -d --no-deps --force-recreate caddy || rollback "proxy restart failed"

log "4/4 Checking the new release…"
if [ "${RAFF_UPDATE_SIMULATE_FAILURE:-0}" = 1 ] || ! wait_healthy 300; then
  rollback "health check failed"
fi
git -C "$ROOT" rev-parse HEAD >"$DEPLOYED_FILE"
# Keep the backup schedule current with this release.
[ -f /etc/cron.d/raff ] && write_cron
log "Updated $PREVIOUS_VERSION → $NEW_VERSION."
