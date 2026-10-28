#!/usr/bin/env bash
# Encrypted backup of the database and listing images, with an optional off-site copy.
# Prints the archive path on its last line. Records the result for Settings › backups.
#
#   infra/backup/backup.sh            (cron runs it nightly; see install.sh)
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"

load_env
require_docker
[ -f "$KEY_FILE" ] || die "Backup key $KEY_FILE is missing."
DIR="${RAFF_BACKUP_DIR:-/var/backups/raff}"
KEEP="${RAFF_BACKUP_KEEP:-14}"
mkdir -p "$DIR"
chmod 700 "$DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
OUT="$DIR/raff-$STAMP.tar.enc"

fail() {
  local reason="$1"
  rm -rf "$WORK"
  manage record_backup failed --detail "$reason" >/dev/null 2>&1 || true
  die "Backup failed: $reason"
}
trap 'fail "unexpected error on line $LINENO"' ERR

log "Dumping the database…"
compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc >"$WORK/db.dump" \
  || fail "pg_dump"
log "Copying listing images…"
compose exec -T backend tar -C /media -cf - . >"$WORK/media.tar" || fail "media"
log "Copying transfer receipts…"
compose exec -T backend tar -C /private -cf - . >"$WORK/private.tar" || fail "private"
# Receipts of orders closed long ago are deleted (RAFF_RECEIPT_RETENTION_DAYS), here and not
# in a separate timer: the backup already runs on a schedule.
manage purge_receipts >/dev/null 2>&1 || warn "Could not purge old receipts."
cat >"$WORK/meta.json" <<META
{"created": "$STAMP", "version": "${RAFF_VERSION:-dev}", "org_id": "$SINGLE_ORG_ID",
 "postgres_db": "$POSTGRES_DB", "postgres_user": "$POSTGRES_USER"}
META
tar -C "$WORK" -cf "$WORK/bundle.tar" db.dump media.tar private.tar meta.json
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$KEY_FILE" \
  -in "$WORK/bundle.tar" -out "$OUT" || fail "encryption"
(cd "$DIR" && sha256sum "$(basename "$OUT")" >"$(basename "$OUT").sha256")
rm -rf "$WORK"
trap - ERR
SIZE=$(stat -c %s "$OUT" 2>/dev/null || stat -f %z "$OUT")

OFFSITE=""
if [ -n "${RAFF_BACKUP_REMOTE:-}" ]; then
  log "Copying off-site to $RAFF_BACKUP_REMOTE…"
  case "$RAFF_BACKUP_REMOTE" in
    rclone:*) rclone copy "$OUT" "${RAFF_BACKUP_REMOTE#rclone:}" && rclone copy "$OUT.sha256" "${RAFF_BACKUP_REMOTE#rclone:}" && OFFSITE=1 ;;
    *) rsync -a "$OUT" "$OUT.sha256" "$RAFF_BACKUP_REMOTE/" && OFFSITE=1 ;;
  esac || warn "Off-site copy failed; the local backup is still good."
fi

# Keep the newest $KEEP archives.
ls -1t "$DIR"/raff-*.tar.enc 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old" "$old.sha256"
done

manage record_backup ok --file "$(basename "$OUT")" --bytes "$SIZE" ${OFFSITE:+--offsite} >/dev/null
log "Backup written: $OUT ($SIZE bytes)"
echo "$OUT"
