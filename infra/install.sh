#!/usr/bin/env bash
# Install Raff on the pharmacy's server (Ubuntu 22.04/24.04 with Docker). Idempotent:
# running it again keeps the existing secrets, data and users.
#
#   sudo infra/install.sh --domain pharmacy.example.com --email owner@example.com \
#     --org "صيدلية الشفاء" --branch-code KRT --branch-ar "فرع الخرطوم" --branch-en "Khartoum" \
#     --owner admin --owner-ar "المالك" --owner-en "Owner" [--license LICENSE.json] [--no-cron]
#
# Use --http instead of --domain for a plain-HTTP trial on a test machine.
# Behind another web server on the same host (docs/runbooks/shared-host.md):
#   --behind-proxy raff.example.com [--http-port 8400] [--https-port 8443] [--trusted-proxies CIDR]
# The owner's password is read from RAFF_OWNER_PASSWORD, or generated and printed once.
. "$(dirname "$0")/lib.sh"

ADDRESS="" EMAIL="" ORG="" BCODE="" BAR="" BEN="" OWNER="" OAR="" OEN="" LICENSE="" CRON=1
PROXY_HOST="" HTTP_PORT=8400 HTTPS_PORT=8443 TRUSTED="172.16.0.0/12"
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) ADDRESS="$2"; shift 2 ;;
    --http) ADDRESS=":80"; shift ;;
    --email) EMAIL="$2"; shift 2 ;;
    --org) ORG="$2"; shift 2 ;;
    --branch-code) BCODE="$2"; shift 2 ;;
    --branch-ar) BAR="$2"; shift 2 ;;
    --branch-en) BEN="$2"; shift 2 ;;
    --owner) OWNER="$2"; shift 2 ;;
    --owner-ar) OAR="$2"; shift 2 ;;
    --owner-en) OEN="$2"; shift 2 ;;
    --license) LICENSE="$2"; shift 2 ;;
    --no-cron) CRON=0; shift ;;
    --behind-proxy) PROXY_HOST="$2"; ADDRESS=":80"; shift 2 ;;
    --http-port) HTTP_PORT="$2"; shift 2 ;;
    --https-port) HTTPS_PORT="$2"; shift 2 ;;
    --trusted-proxies) TRUSTED="$2"; shift 2 ;;
    *) die "Unknown option $1 (see the header of this script)" ;;
  esac
done
[ -n "$ADDRESS" ] || die "Give --domain your.domain (HTTPS) or --http"
[ -n "$ORG" ] && [ -n "$BCODE" ] && [ -n "$OWNER" ] || die "--org, --branch-code and --owner are required"

require_docker
write_env "$ADDRESS"
[ -n "$EMAIL" ] && set_env ACME_EMAIL "$EMAIL"
if [ -n "$PROXY_HOST" ]; then
  # Raff's own proxy on loopback, TLS at the front web server (shared-host.md).
  set_env SITE_HOST "$PROXY_HOST"
  set_env SITE_ORIGIN "https://$PROXY_HOST"
  set_env RAFF_BIND 127.0.0.1
  set_env RAFF_HTTP_PORT "$HTTP_PORT"
  set_env RAFF_HTTPS_PORT "$HTTPS_PORT"
  set_env RAFF_TRUSTED_PROXIES "$TRUSTED"
fi
ensure_key
load_env
check_env
if [ -n "$LICENSE" ]; then
  install -m 644 "$LICENSE" "$PROD/license/LICENSE.json"
  log "License installed."
fi

log "Building images (release $RAFF_VERSION)…"
compose build
compose up -d
wait_healthy 600 || { compose logs --tail 100; die "The services did not become healthy."; }

if ! manage shell -c "from apps.tenancy.models import Organization; import sys; sys.exit(0 if Organization.objects.filter(pk='$SINGLE_ORG_ID').exists() else 1)" >/dev/null 2>&1; then
  manage create_organization --name "$ORG" --id "$SINGLE_ORG_ID" >/dev/null
  log "Organization created."
fi
manage create_branch --code "$BCODE" --name-ar "${BAR:-$BCODE}" --name-en "${BEN:-$BCODE}"

has_users=$(manage shell -c "from apps.accounts.models import User; from apps.tenancy.context import org_context; import uuid
with org_context(uuid.UUID('$SINGLE_ORG_ID')): print(User.objects.exists())" 2>/dev/null | tail -n 1)
if [ "$has_users" != "True" ]; then
  password="${RAFF_OWNER_PASSWORD:-$(rand 14)}"
  compose exec -T -e RAFF_OWNER_PASSWORD="$password" backend python manage.py create_owner \
    --username "$OWNER" --name-ar "${OAR:-$OWNER}" --name-en "${OEN:-$OWNER}" >/dev/null
  log "Owner '$OWNER' created."
  [ -n "${RAFF_OWNER_PASSWORD:-}" ] || log "Owner password (shown once, change it after signing in): $password"
fi

if [ "$CRON" = 1 ]; then
  write_cron
  log "Backups scheduled: every 15 minutes locally, nightly with the off-site copy, weekly restore drill."
fi

log "Done. Open ${SITE_ORIGIN} and sign in as '$OWNER'."
