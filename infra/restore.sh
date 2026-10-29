#!/usr/bin/env bash
# Restore a backup — onto this server, or onto a clean replacement server in one command.
#
#   infra/restore.sh /path/raff-YYYYmmdd-HHMMSS.tar.enc --key /path/backup.key [--domain d | --http]
#   infra/restore.sh --verify-latest        (weekly drill: restore into a scratch database)
#
# On a clean server (no infra/prod/.env yet) the organization id is taken from the backup and
# fresh secrets are generated; give --domain (HTTPS) or --http as for install.sh.
. "$(dirname "$0")/lib.sh"

FILE="" ADDRESS="" VERIFY=0 BUILD=1
while [ $# -gt 0 ]; do
  case "$1" in
    --key) KEY_FILE="$2"; shift 2 ;;
    --domain) ADDRESS="$2"; shift 2 ;;
    --http) ADDRESS=":80"; shift ;;
    --verify-latest) VERIFY=1; shift ;;
    --no-build) BUILD=0; shift ;;
    -*) die "Unknown option $1" ;;
    *) FILE="$1"; shift ;;
  esac
done
require_docker

decrypt() {
  local file="$1" into="$2"
  [ -f "$KEY_FILE" ] || die "Backup key $KEY_FILE not found (give --key)."
  if [ -f "$file.sha256" ]; then
    (cd "$(dirname "$file")" && sha256sum --check --quiet "$(basename "$file").sha256") \
      || die "Checksum mismatch: $file is damaged."
  fi
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$file" \
    | tar -C "$into" -xf - || die "Could not decrypt $file (wrong key?)"
}

if [ "$VERIFY" = 1 ]; then
  load_env
  DIR="${RAFF_BACKUP_DIR:-/var/backups/raff}"
  FILE="$(ls -1t "$DIR"/raff-*.tar.enc 2>/dev/null | head -n 1)"
  [ -n "$FILE" ] || die "No backup in $DIR"
  WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
  decrypt "$FILE" "$WORK"
  log "Restore drill: $FILE → scratch database"
  compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists raff_restore_check
  compose exec -T postgres createdb -U "$POSTGRES_USER" raff_restore_check
  compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d raff_restore_check --no-owner <"$WORK/db.dump"
  ITEMS=$(compose exec -T postgres psql -U "$POSTGRES_USER" -d raff_restore_check -tAc \
    "SELECT count(*) FROM catalog_item")
  compose exec -T postgres dropdb -U "$POSTGRES_USER" raff_restore_check
  manage record_backup ok --kind restore_test --file "$(basename "$FILE")" \
    --detail "items=$ITEMS" >/dev/null
  log "Restore drill passed ($ITEMS items)."
  exit 0
fi

[ -n "$FILE" ] && [ -f "$FILE" ] || die "Give the backup file to restore."
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
decrypt "$FILE" "$WORK"
ORG_ID=$(sed -n 's/.*"org_id": *"\([^"]*\)".*/\1/p' "$WORK/meta.json")
[ -n "$ORG_ID" ] || die "The backup has no organization id."

if [ ! -f "$ENV_FILE" ]; then
  [ -n "$ADDRESS" ] || die "Clean server: give --domain your.domain or --http."
  write_env "$ADDRESS" "$ORG_ID"
  cp "$KEY_FILE" "$PROD/backup.key" 2>/dev/null || true
fi
load_env
[ "$SINGLE_ORG_ID" = "$ORG_ID" ] || die "This server serves organization $SINGLE_ORG_ID, the backup is $ORG_ID."

if [ "$BUILD" = 1 ]; then
  log "Building images…"
  compose build
fi
log "Starting the database…"
compose up -d postgres
until compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do sleep 2; done

# Review D-05: nothing current is touched until the backup has fully restored into a scratch
# database and its archives read back; then the databases are swapped, and the previous one is
# kept until the restored release is healthy.
pg() { compose exec -T postgres "$@"; }
sql() { pg psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -tAc "$1"; }
INCOMING="${POSTGRES_DB}_incoming"
PREVIOUS_DB="${POSTGRES_DB}_previous"

log "Restoring the database into a scratch copy…"
pg dropdb -U "$POSTGRES_USER" --if-exists --force "$INCOMING"
pg createdb -U "$POSTGRES_USER" "$INCOMING"
if ! pg pg_restore -U "$POSTGRES_USER" -d "$INCOMING" --no-owner <"$WORK/db.dump"; then
  pg dropdb -U "$POSTGRES_USER" --if-exists --force "$INCOMING"
  die "The backup's database could not be restored; the current data was not touched."
fi
ITEMS=$(pg psql -U "$POSTGRES_USER" -d "$INCOMING" -tAc "SELECT count(*) FROM django_migrations") \
  || { pg dropdb -U "$POSTGRES_USER" --force "$INCOMING"; die "The restored database is not a Raff database; nothing was changed."; }
log "Scratch copy restored ($ITEMS migrations recorded)."
log "Checking the file archives…"
tar -tf "$WORK/media.tar" >/dev/null || die "media.tar is damaged; the current data was not touched."
if [ -f "$WORK/private.tar" ]; then
  tar -tf "$WORK/private.tar" >/dev/null || die "private.tar is damaged; the current data was not touched."
fi

log "Switching to the restored database…"
compose stop caddy frontend backend >/dev/null 2>&1 || true
sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$POSTGRES_DB', '$INCOMING') AND pid <> pg_backend_pid()" >/dev/null
pg dropdb -U "$POSTGRES_USER" --if-exists --force "$PREVIOUS_DB"
HAD_CURRENT=$(sql "SELECT count(*) FROM pg_database WHERE datname = '$POSTGRES_DB'")
if [ "$HAD_CURRENT" = 1 ]; then
  sql "ALTER DATABASE \"$POSTGRES_DB\" RENAME TO \"$PREVIOUS_DB\"" >/dev/null
fi
sql "ALTER DATABASE \"$INCOMING\" RENAME TO \"$POSTGRES_DB\"" >/dev/null

log "Restoring listing images…"
compose run --rm --no-deps -T --entrypoint sh backend -c "rm -rf /media/* && tar -C /media --no-overwrite-dir -xf -" <"$WORK/media.tar"
# Backups made before receipts existed have no private.tar.
if [ -f "$WORK/private.tar" ]; then
  log "Restoring transfer receipts…"
  compose run --rm --no-deps -T --entrypoint sh backend -c "rm -rf /private/* && tar -C /private --no-overwrite-dir -xf -" <"$WORK/private.tar"
fi

compose up -d
if ! wait_healthy 600; then
  compose logs --tail 100
  if [ "$HAD_CURRENT" = 1 ]; then
    warn "The restored release is not healthy: putting the previous database back."
    compose stop caddy frontend backend >/dev/null 2>&1 || true
    sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid()" >/dev/null
    sql "ALTER DATABASE \"$POSTGRES_DB\" RENAME TO \"${POSTGRES_DB}_failed\"" >/dev/null
    sql "ALTER DATABASE \"$PREVIOUS_DB\" RENAME TO \"$POSTGRES_DB\"" >/dev/null
    compose up -d
  fi
  die "Restored, but the services are not healthy; the previous database was kept."
fi
pg dropdb -U "$POSTGRES_USER" --if-exists --force "$PREVIOUS_DB"
log "Restore complete from $(basename "$FILE")."
