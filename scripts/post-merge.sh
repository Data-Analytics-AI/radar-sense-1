#!/bin/bash
set -e
npm install
if [ -n "$HUAWEI_PGHOST" ] && [ -n "$HUAWEI_PGDATABASE" ]; then
  for f in drizzle/*.sql; do
    echo "[post-merge] applying $f"
    node scripts/apply-schema.mjs "$f" || true
  done
fi
