#!/bin/sh
set -eu
cd /app
while true; do
  npx tsx scripts/backup.ts || true
  npx tsx scripts/backup-wait.ts
done
