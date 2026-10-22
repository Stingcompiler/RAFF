#!/bin/sh
# Create infra/compose/.env with fresh random secrets if it does not exist yet.
set -eu
env_file="$(dirname "$0")/.env"
[ -f "$env_file" ] && exit 0
rand() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
uuid() { cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen | tr 'A-Z' 'a-z'; }
sed -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(rand 32)/" \
    -e "s/^DJANGO_SECRET_KEY=.*/DJANGO_SECRET_KEY=$(rand 50)/" \
    -e "s/^SINGLE_ORG_ID=.*/SINGLE_ORG_ID=$(uuid)/" \
    -e "s/^RAFF_DEMO_PASSWORD=.*/RAFF_DEMO_PASSWORD=$(rand 12)/" \
    "$(dirname "$0")/.env.example" > "$env_file"
chmod 600 "$env_file"
echo "Created $env_file"
