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
compose stop caddy frontend backend >/dev/null 2>&1 || true

log "Restoring the database…"
compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB"
compose exec -T postgres createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner <"$WORK/db.dump"

log "Restoring listing images…"
compose run --rm --no-deps -T --entrypoint sh backend -c "rm -rf /media/* && tar -C /media --no-overwrite-dir -xf -" <"$WORK/media.tar"

compose up -d
wait_healthy 600 || { compose logs --tail 100; die "Restored, but the services are not healthy."; }
log "Restore complete from $(basename "$FILE")."
