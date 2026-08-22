# Друзья — бот лояльности

Telegram-бот кальянной «Друзья»: бонусы, касса, Mini App с игрой «три в ряд».

Процесс стартует через `tsx` (`npm run start` → `tsx src/index.ts`). `tsc` не используется: импорты с расширением `.ts` не собираются (`TS5097`, нужен `allowImportingTsExtensions`). Mini App собирает Vite (`npm run build`).

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `BOT_TOKEN` | токен бота от BotFather |
| `TELEGRAM_ADMIN_ID` | Telegram ID первого админа (роль `admin` всегда) |
| `DATABASE_URL` | Postgres, например `postgresql://friends:friends@localhost:5432/friends` |
| `PUBLIC_URL` | публичный HTTPS URL сервиса, без webhook-пути |
| `PORT` | порт HTTP, по умолчанию `3000` |

Пример: `.env.example`.

## Postgres

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: friends
      POSTGRES_PASSWORD: friends
      POSTGRES_DB: friends
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

Запуск: `docker compose up -d`.

## Миграции и сид

```sh
npx prisma migrate deploy
npx prisma db seed
```

Сид записывает настройки по умолчанию, страницы контактов/маршрута и игру `match3` (потолок партии 50 000).

## Mini App

В BotFather укажите URL Mini App: `PUBLIC_URL/app/` (со слэшем). Тот же URL открывают кнопки «Игры» (гость) и «Касса QR» (персонал). Webhook бота: `PUBLIC_URL/tg/<BOT_TOKEN>` — ставится при старте процесса.

## Как добавить мастера

1. Админ пишет боту и нажимает «Роли».
2. Вводит Telegram ID сотрудника.
3. Указывает роль `master` (снять роль — снова `guest`).

Первый админ — `TELEGRAM_ADMIN_ID`, отдельная запись не нужна.

## Запуск

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run build
npm run start
```

Локально без webhook: `npx tsx src/dev-polling.ts`.

Планировщик в том же процессе: день рождения каждую ночь 02:00 МСК, закрытие недели в понедельник 00:00 МСК.

## Timeweb Cloud Apps

Деплой из Git через [App Platform + Dockerfile](https://timeweb.cloud/docs/apps/deploying-with-dockerfile). База — отдельно: [облачный PostgreSQL](https://timeweb.cloud/docs/dbaas/postgresql).

1. Залейте этот репозиторий на GitHub / GitLab (`main`).
2. В Timeweb: **Базы данных** → PostgreSQL (минимум). Скопируйте строку подключения. Если кластер требует TLS, добавьте `?sslmode=require` к `DATABASE_URL`.
3. **App Platform** → создать приложение → тип **Dockerfile** → подключить репозиторий, ветка `main`.
4. Регион тот же, что у базы. Приватную сеть выберите ту же, что у Postgres (потом её не сменить).
5. Переменные:

   | Ключ | Значение |
   |---|---|
   | `BOT_TOKEN` | токен BotFather |
   | `TELEGRAM_ADMIN_ID` | ваш числовой Telegram ID |
   | `DATABASE_URL` | строка из шага 2 (внутренний хост, если есть приватная сеть) |
   | `PUBLIC_URL` | пока заглушка `https://placeholder.twc1.net` — после первого деплоя замените на технический домен с Дашборда |
   | `PORT` | `3000` |

   Путь проверки состояния: `/health`.

6. Запустить деплой. В логе должно быть `listening 3000`.
7. На Дашборде скопируйте технический домен (`https://….twc1.net`), пропишите его в `PUBLIC_URL` без слэша в конце и передеплойте (чтобы webhook и Mini App смотрели на правильный URL).
8. Один раз сид: в приложении откройте консоль / разовую команду  
   `npx prisma db seed`  
   или локально: `DATABASE_URL=... npx prisma db seed`.
9. BotFather → Mini App URL: `https://ваш-домен.twc1.net/app/`
10. Напишите боту с аккаунта `TELEGRAM_ADMIN_ID`, добавьте мастеров через «Роли».

Проверка: `https://ваш-домен.twc1.net/health` → `{"ok":true}`.

## Docker

```sh
docker build -t friends-bot .
docker run --env-file .env -p 3000:3000 friends-bot
```

Образ на старте делает `prisma migrate deploy` и запускает `tsx src/index.ts`. Сид выполните один раз отдельно: `docker run --env-file .env friends-bot npx prisma db seed`.
