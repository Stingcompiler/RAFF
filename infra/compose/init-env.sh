#!/bin/sh
# Create infra/compose/.env with fresh random secrets if it does not exist yet.
set -eu
env_file="$(dirname "$0")/.env"
[ -f "$env_file" ] && exit 0
rand() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
sed -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(rand 32)/" \
    -e "s/^DJANGO_SECRET_KEY=.*/DJANGO_SECRET_KEY=$(rand 50)/" \
    "$(dirname "$0")/.env.example" > "$env_file"
chmod 600 "$env_file"
echo "Created $env_file"
