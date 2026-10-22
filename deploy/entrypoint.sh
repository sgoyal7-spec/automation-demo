#!/bin/sh
# Copy the pre-seeded database into the persistent volume on first boot, then start.
set -e
if [ ! -f /app/data/demo.db ]; then
  echo "[entrypoint] initializing database from seed"
  cp /app/seed/demo.db /app/data/demo.db
fi
exec node server.js
