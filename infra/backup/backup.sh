#!/usr/bin/env bash
# Encrypted backup of the database and listing images, with an optional off-site copy.
# Prints the archive path on its last line. Records the result for Settings › backups.
#
#   infra/backup/backup.sh             nightly: kept RAFF_BACKUP_KEEP days, copied off-site
#   infra/backup/backup.sh --frequent  every 15 minutes: local only, kept for a day (spec §1)
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"

FREQUENT=0
[ "${1:-}" = "--frequent" ] && FREQUENT=1
load_env
require_docker
[ -f "$KEY_FILE" ] || die "Backup key $KEY_FILE is missing."
# One backup at a time: a frequent run that meets the nightly one simply skips this turn.
exec 9>/var/lock/raff-backup.lock 2>/dev/null || exec 9>/tmp/raff-backup.lock
if ! flock -n 9; then
  log "Another backup is running; skipping this one."
  exit 0
fi
DIR="${RAFF_BACKUP_DIR:-/var/backups/raff}"
KEEP="${RAFF_BACKUP_KEEP:-14}"
if [ "$FREQUENT" = 1 ]; then
  DIR="$DIR/frequent"
  KEEP="${RAFF_BACKUP_FREQUENT_KEEP:-96}"
fi
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

# Receipts of orders closed long ago are deleted (RAFF_RECEIPT_RETENTION_DAYS) before the
# copy, so an archive never brings back a photo that was due to go (review B-12).
manage purge_receipts >/dev/null 2>&1 || warn "Could not purge old receipts."
log "Dumping the database…"
compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc >"$WORK/db.dump" \
  || fail "pg_dump"
log "Copying listing images…"
compose exec -T backend tar -C /media -cf - . >"$WORK/media.tar" || fail "media"
log "Copying transfer receipts…"
compose exec -T backend tar -C /private -cf - . >"$WORK/private.tar" || fail "private"
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
OFFSITE_ERROR=""
if [ "$FREQUENT" = 1 ]; then
  : # Local only; the nightly run carries the off-site copy.
elif [ -n "${RAFF_BACKUP_REMOTE:-}" ]; then
  log "Copying off-site to $RAFF_BACKUP_REMOTE…"
  if case "$RAFF_BACKUP_REMOTE" in
    rclone:*) rclone copy "$OUT" "${RAFF_BACKUP_REMOTE#rclone:}" && rclone copy "$OUT.sha256" "${RAFF_BACKUP_REMOTE#rclone:}" ;;
    *) rsync -a "$OUT" "$OUT.sha256" "$RAFF_BACKUP_REMOTE/" ;;
  esac; then
    OFFSITE=1
  else
    OFFSITE_ERROR="the copy to $RAFF_BACKUP_REMOTE failed"
  fi
else
  OFFSITE_ERROR="no off-site destination is configured (RAFF_BACKUP_REMOTE)"
fi

# Keep the newest $KEEP archives.
ls -1t "$DIR"/raff-*.tar.enc 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old" "$old.sha256"
done

DETAIL=""
[ "$FREQUENT" = 1 ] && DETAIL="frequent"
manage record_backup ok --file "$(basename "$OUT")" --bytes "$SIZE" ${OFFSITE:+--offsite} \
  --detail "$DETAIL" >/dev/null
# The local copy is good either way; a missing off-site copy is its own failure, with its own
# alert, so days without one never pass as success (review D-03).
if [ -n "$OFFSITE_ERROR" ]; then
  warn "Off-site copy: $OFFSITE_ERROR. The local backup is still good."
  manage record_backup failed --kind offsite --file "$(basename "$OUT")" --detail "$OFFSITE_ERROR" >/dev/null || true
fi
log "Backup written: $OUT ($SIZE bytes)"
echo "$OUT"
