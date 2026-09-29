#!/bin/sh
# Первый запуск на чистой Ubuntu: Docker, файрвол, compose.
# Запускать из каталога проекта от root: ./scripts/bootstrap-ubuntu.sh
set -eu
if [ "$(id -u)" -ne 0 ]; then
  echo "Нужен root" >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl ufw
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Заполните .env (пароли, токен, домен, ИНН, DEV_ALERT_CHAT_ID) и запустите скрипт снова."
  exit 1
fi
docker compose -f docker-compose.prod.yml up -d --build
echo "Миграции и сид выполняет контейнер app при старте. Проверка: curl -fsS https://$(grep ^CADDY_DOMAIN= .env | cut -d= -f2)/health/ready"
