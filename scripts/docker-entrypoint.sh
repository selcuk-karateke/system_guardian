#!/bin/sh
set -e

if [ "${SKIP_DB_MIGRATE:-0}" != "1" ]; then
  echo "migrate-prod: starting…"
  node /app/scripts/migrate-prod.mjs
fi

exec "$@"
