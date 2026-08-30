# Друзья — бот лояльности

Telegram-бот кальянной «Друзья»: бонусы, касса, Mini App с игрой «три в ряд».

Процесс стартует через `tsx` (`npm run start` → `tsx src/index.ts`). `tsc` не используется: импорты с расширением `.ts` не собираются (`TS5097`, нужен `allowImportingTsExtensions`). Mini App собирает Vite (`npm run build`).

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `BOT_TOKEN` | токен бота от BotFather |
| `TELEGRAM_ADMIN_ID` | Telegram ID первого админа (роль `admin` всегда) |
| `PUBLIC_URL` | публичный HTTPS URL сервиса, без webhook-пути (`https://` + `CADDY_DOMAIN`) |
| `CADDY_DOMAIN` | домен для Caddy и Let's Encrypt, без `https://` |
| `PORT` | порт HTTP приложения внутри compose, по умолчанию `3000` |
| `POSTGRES_USER` | пользователь Postgres (docker compose) |
| `POSTGRES_PASSWORD` | пароль Postgres — только в `.env`, не в git |
| `POSTGRES_DB` | имя базы Postgres |
| `DATABASE_URL` | строка подключения; в compose: `@postgres:5432`, локально: `@localhost:5432` |
| `S3_BUCKET` | bucket Yandex Object Storage для фото меню; если пусто — локальная папка `uploads/menu/` |
| `S3_ENDPOINT` | `https://storage.yandexcloud.net` |
| `S3_REGION` | `ru-central1` |
| `S3_ACCESS_KEY_ID` | ключ сервисного аккаунта |
| `S3_SECRET_ACCESS_KEY` | секрет ключа |
| `S3_PUBLIC_BASE_URL` | публичный URL bucket (по умолчанию `{S3_ENDPOINT}/{S3_BUCKET}`) |
| `S3_KEY_PREFIX` | префикс ключей, по умолчанию `menu` |

Пример: `.env.example`. Файл `.env` в git не попадает — все секреты только там.

### Yandex Object Storage (галерея меню)

1. Создайте bucket в Object Storage, включите **публичный доступ на чтение** объектов.
2. Сервисный аккаунт → статический ключ → роль `storage.editor` на bucket.
3. Заполните `S3_*` в `.env` или в Timeweb App Platform.
4. После деплоя загрузите фото в админке — в БД сохранится URL вида `https://storage.yandexcloud.net/<bucket>/menu/<uuid>.jpg`.
5. Telegram и админка открывают фото по этому URL напрямую; локальный `/uploads/*` нужен только для старых записей и dev без S3.

## Docker Compose (рекомендуется)

Postgres, приложение и Caddy (HTTPS) одной командой:

```sh
cp .env.example .env   # заполните все поля
chmod 600 .env
docker compose up -d --build
```

`POSTGRES_PASSWORD` в `.env` должен совпадать с паролем в `DATABASE_URL`. Если volume `pgdata` уже существует, пароль должен быть **тот же**, что при первом запуске Postgres (иначе P1000).

`CADDY_DOMAIN` — домен без схемы, например `bot.example.com`. `PUBLIC_URL` — тот же хост с `https://`.

Сид один раз на пустую базу:

```sh
docker compose run --rm app npx prisma db seed
```

Проверка:

```sh
curl -s https://ваш-домен/health   # → {"ok":true}
docker compose logs -f app
docker compose restart app         # перерегистрирует webhook после смены PUBLIC_URL
```

Логи: `docker compose logs -f app caddy`. Остановка: `docker compose down` (данные БД в volume `pgdata`, сертификаты Caddy в `caddy_data`).

Caddy проксирует `443` → `app:3000`. Telegram webhook и Mini App ходят на `PUBLIC_URL`.

При старте контейнер `app` выполняет `prisma migrate deploy`, затем запускает бот. Mini App собирается на этапе `docker compose build`.

## Postgres (только БД, без compose)

Если приложение запускаете отдельно (`npm run start`), поднимите Postgres:

```sh
docker compose up -d postgres
```

Или свой инстанс; строка подключения — в `DATABASE_URL` (для локального npm: `@localhost:5432`).

## Миграции и сид

```sh
npx prisma migrate deploy
npx prisma db seed
```

Сид записывает настройки по умолчанию, страницы контактов/маршрута и игру `match3` (потолок партии 50 000).

## Mini App

В BotFather укажите URL Mini App: `PUBLIC_URL/app/` (со слэшем). Тот же URL открывают кнопки «Игры» (гость) и «Приложение» (персонал) через inline-кнопку в чате. Webhook бота: `PUBLIC_URL/tg/<BOT_TOKEN>` — ставится при старте процесса.

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

Планировщик в том же процессе: день рождения каждую ночь 02:00 МСК, закрытие недели в понедельник 00:00 МСК, ротация кода зала каждые 2 часа МСK.

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

## Docker (образ без compose)

```sh
docker build -t friends-bot .
docker run --env-file .env -p 3000:3000 friends-bot
```

Образ на старте делает `prisma migrate deploy` и запускает `tsx src/index.ts`. Сид один раз: `docker run --rm --env-file .env friends-bot npx prisma db seed`.

Для Postgres + app вместе используйте `docker compose up -d --build` (см. выше).
