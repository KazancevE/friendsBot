#!/bin/sh
# Восстановление из custom-дампа pg_dump.
# Запуск из каталога салона: ./scripts/restore.sh /var/backups/daddyson/daily/daily-2026-09-29.dump
set -eu
FILE=${1:?укажите файл дампа}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
if [ ! -f "$FILE" ]; then
  echo "Файл не найден: $FILE" >&2
  exit 1
fi
set -a
. ./.env
set +a
echo "Останавливаю приложение, база остаётся."
docker compose -f "$COMPOSE_FILE" stop app watchdog || true
docker compose -f "$COMPOSE_FILE" cp "$FILE" postgres:/tmp/restore.dump
set +e
docker compose -f "$COMPOSE_FILE" exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner --dbname "$POSTGRES_DB" --username "$POSTGRES_USER" /tmp/restore.dump'
status=$?
set -e
if [ "$status" -gt 1 ]; then
  echo "pg_restore завершился с ошибкой $status" >&2
  exit "$status"
fi
docker compose -f "$COMPOSE_FILE" start app watchdog || docker compose -f "$COMPOSE_FILE" up -d app watchdog
echo "Готово. Проверьте https://$CADDY_DOMAIN/health/ready"
