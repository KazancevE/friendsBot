#!/bin/sh
# Обновление: свежая копия базы, затем сборка и миграции (их делает старт app).
set -eu
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
docker compose -f "$COMPOSE_FILE" exec -T backup npx tsx scripts/backup.ts
git pull --ff-only
docker compose -f "$COMPOSE_FILE" up -d --build
docker compose -f "$COMPOSE_FILE" exec -T app npx prisma migrate deploy
echo "Обновлено. /health/ready должен ответить ok."
