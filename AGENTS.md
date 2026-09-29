# Агенты Cursor

Репозиторий `KazancevE/friendsBot`. Ветка `daddyson` — шаблон демо барбершопа. Кальянная «Друзья» живёт в `main`. Салонные ветки в `main` не вливать.

Владелец: Егор Казанцев, GitHub `KazancevE`. Продукт продаётся салонам и барбершопам как готовый комплект: бот записи в Telegram и MAX, бонусная карта в Mini App, сайт и админка.

Длинное описание текущего демо Daddyson — `README.md`. Как собрать следующее демо — `docs/new-client.md`. Бриф клиента — `docs/clients/<slug>/brief.md`.

## Жёсткие правила

- Не мержить ничего в `main`. Черновик PR салона целится в `daddyson`, не в `main`.
- Один клиент — одна ветка от `daddyson`. Не копить чужие салоны в `daddyson` и не ответвлять нового клиента от `bro`.
- Секреты только в `.env` на машине, где крутится этот клиент. В git не коммитить `.env`, дампы, токены, пароли. В логи и в PR их не писать.
- Сервер демо: `root@194.67.101.109`, каталог клиента `/opt/<slug>`. Чужие каталоги не трогать. `/opt/verstak` и сайт `crm.mieganalytics.online` — отдельная CRM, их не читать на запись, не перезапускать, не править nginx.
- На этом хосте порты 80 и 443 уже занимает nginx. Не запускать `scripts/bootstrap-ubuntu.sh` и не поднимать `docker-compose.prod.yml`: там Caddy публикует 80 и 443.
- Не писать реальным контактам салона: телефон, WhatsApp, почта, Telegram салона. Не делать рассылку по импортированной базе. `TELEGRAM_ADMIN_ID` и `DEV_ALERT_CHAT_ID` по умолчанию `500459806` — это чат разработчика, не салон.
- В текстах сайта, бота и админки только факты из брифа, и у каждого факта есть источник. Чего нет в брифе — не выдумывать: слоган, рейтинг, телефон, юрлицо, длительность, имя мастера.

## Что это за продукт

Один процесс Node, одна Postgres на салон. Гость один и тот же в Telegram и MAX: склейка по телефону, карта и записи общие.

Гостевой сценарий салона:

1. `/start` в Telegram или запуск бота в MAX.
2. Согласие на персональные данные (ссылки `/privacy` и `/consent`). Без него запись и карта закрыты.
3. Отдельное согласие на рекламу. Отказ не отключает сервисные сообщения: подтверждение, отмена, напоминания за 24 часа и за 2 часа.
4. Телефон, имя, день рождения по желанию.
5. Запись: филиал → услуга → мастер или «любой» → день → окно → подтверждение.
6. Карта: кэшбэк, реферал, бонус на день рождения, QR на кассе. «Пора стричься» уходит только при согласии на рекламу текущей версии `POLICY_VERSION`.

Импорт CSV/Excel уже есть в админке, раздел «Импорт». Образец выдуманных людей: `fixtures/dikidi-clients-sample.csv`. Импорт никому не пишет.

Игры, квиз, схема зала и бронь столов кальянной в гостевом меню салона выключены. Код «Друзей» в репозитории остаётся, старые тесты на него завязаны. Не вычищать его в клиентской ветке.

## Карта кода

| Часть | Где | Как попадает наружу |
|---|---|---|
| Процесс | `src/index.ts` | Читает `.env`, проверяет прод-конфиг, поднимает HTTP, ботов и джобы |
| HTTP | `src/http/app.ts`, `src/http/salon.ts` | Hono. Салонные API `/api/salon/*`, страницы `/`, `/privacy`, `/consent`, статика `/site/*` |
| Здоровье | `GET /health`, `GET /health/ready` | Второй дергает `SELECT 1` |
| Telegram | `src/channels/telegram-salon.ts`, grammY | Webhook `POST /tg/webhook` на HTTPS, либо long polling при `TELEGRAM_TRANSPORT=polling` |
| MAX | `src/channels/max-salon.ts`, `@maxhub/max-bot-api` | Long polling, хост `platform-api2.max.ru`. Пустой `MAX_BOT_TOKEN` — бот не стартует |
| Сценарий записи | `src/salon/flow.ts`, `src/salon/service.ts`, `src/salon/slots.ts` | Тексты и слоты |
| Знакомство | `src/salon/onboarding.ts`, `src/prod/privacy.ts` | Версия политики: `POLICY_VERSION` или `2026-09-29` |
| Mini App | `miniapp/` → сборка `miniapp/dist` | `https://<домен>/app/`, демо без мессенджера `/app/?demo=1` |
| Админка | `admin/` → сборка `admin/dist` | `/admin/`. Роли `owner`, `branch_admin`, `master` — `README.md` |
| Сайт | `site/index.html`, `site/styles.css`, `site/app.js` | `GET /` читает HTML, прайс подгружается из `/api/salon/public` |
| База | `prisma/schema.prisma`, `prisma/migrations/` | Postgres 16. Старт контейнера: `npx prisma migrate deploy && npx prisma db seed && npx tsx src/index.ts` (`Dockerfile`) |
| Сид салона | `prisma/seed.ts` вызывает `prisma/seed-salon.ts` | Повторный сид не затирает цены и процент, если уже есть ключ `salon.seeded` |
| Прайс Daddyson | `prisma/data/prices_dikidi.csv`, разбор `src/salon/catalog.ts` | Парсер узнаёт только филиалы с «Василь» и «Училищ» в названии |
| Джобы салона | `src/salon/jobs.ts` | Напоминания и «пора стричься» |
| Джобы «Друзей» | `src/jobs/scheduler.ts` | Стартуют, только если есть токен Telegram и админские id |
| Прод-проверка | `src/prod/config.ts` | `APP_ENV=production`. `NODE_ENV` в образе всегда `production` и сам этот режим не включает |
| Часовой пояс | `VENUE_TIMEZONE`, по умолчанию в демо `Asia/Barnaul` | Тесты принудительно ставят `Europe/Moscow` в `vitest.config.ts` |

На ветке `daddyson` нет файла `src/venue/salon.ts`. Его добавила ветка `bro`: туда собраны филиалы, прайс, мастера и тексты. Для нового клиента это образец формы, не база для ветки.

## Локальный запуск и тесты

Нужны Node 22, npm и Docker, если поднимается весь стек.

```sh
cp .env.example .env
docker compose up -d --build
```

Без профиля `https` Caddy не стартует. Сайт: `http://localhost:3000/`. Админка: логин `admin`, пароль из `.env` (в примере `daddyson-demo`). Демо-карта: `http://localhost:3000/app/?demo=1`. Логи: `docker compose logs -f app`. Остановка: `docker compose down` (том `pgdata` остаётся).

Только Postgres для `npm run start`:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
```

В `DATABASE_URL` для npm хост `postgres` заменить на `localhost`.

Проверки, которые реально есть в `package.json`:

```sh
npm test
npm run build
curl -s http://localhost:3000/health
curl -s http://localhost:3000/health/ready
```

`npm test` — это `vitest run`, файлы `tests/**/*.test.ts`. База для них не нужна. `npm run build` собирает Mini App и админку Vite.

## Соглашения

- TypeScript, ESM, импорты с суффиксом `.ts`.
- Новый салон не получает новую миграцию, если не меняется схема. Смена города по умолчанию у `Branch.city` — это смена схемы: на `bro` для этого есть `prisma/migrations/20260929200000_bro_city_default`.
- Демо-пароли дописывать в набор в `src/prod/config.ts`, а не подменять единственный пароль Daddyson: иначе шаблонный пример перестанет ловиться.
- Коммит не должен содержать `.env`. Файл в `.gitignore`.

## Где лежат факты Daddyson

Пока ветка шаблонная, бренд не вынесен в один модуль. Менять при новом клиенте те файлы, которые печатает:

```sh
npx tsx scripts/client-touchpoints.ts
npx tsx scripts/client-touchpoints.ts --list
```

Первая команда показывает файлы с маркерами шаблона (`Daddyson`, `daddyson-demo`, `Васильева 55`, `Училищный пер`). Вторая — список путей, которые у второго клиента реально отличались. `docs/` и этот файл скрипт пропускает нарочно.
