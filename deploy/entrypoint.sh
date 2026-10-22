#!/bin/sh
# Apply schema and seed prospects on first boot, then start the server.
set -e
if [ ! -f /app/data/demo.db ]; then
  echo "[entrypoint] creating database"
  node node_modules/prisma/build/index.js db push --skip-generate
  node node_modules/tsx/dist/cli.mjs prisma/seed.ts
fi
exec node server.js
