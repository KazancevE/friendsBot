# Новый клиент

Демо салона собирается из ветки `daddyson`. Кальянную в `main` не трогать. Второй уже собранный салон — ветка `bro` (черновик PR в `main`, не мержить): по ней видно, какие файлы меняются. Новую ветку от `bro` не делать: там чужой прайс и чужие тексты.

## 1. Бриф

Скопировать `docs/clients/_template/brief.md` в `docs/clients/<slug>/brief.md` и заполнить только проверяемыми фактами. Пустое поле — не выдумывать слоган, рейтинг, телефон, юрлицо, длительность или имя мастера.

Слаг — латиница, он же каталог `/opt/<slug>` и имя compose-проекта.

## 2. Ветка

От актуальной `daddyson`:

```sh
git fetch origin daddyson
git checkout daddyson
git checkout -b cursor/<slug>-<суффикс>
```

Один клиент — одна ветка. В `daddyson` чужой салон не коммитить.

## 3. Что менять

На `daddyson` факты разложены по файлам. На `bro` они собраны в `src/venue/salon.ts`, сид читает этот модуль, CSV прайса удалён. Для нового салона повторить эту форму, а не править бийские массивы вручную и не надеяться, что CSV подхватится сам.

`src/salon/catalog.ts`, функция `branchFromLabel`, принимает только подписи с «Василь» и «Училищ». Чужие строки CSV отбрасываются. Пока парсер не расширен, прайс нового салона класть в `src/venue/salon.ts`, как на `bro`.

Файлы, которые отличались у `bro` от `daddyson` и которые есть на шаблоне:

| Файл | Что там клиентское |
|---|---|
| `src/venue/salon.ts` | Создать. На `daddyson` файла нет. Филиалы, прайс, мастера, тексты, цвета, бонусы |
| `prisma/seed-salon.ts` | Филиалы, мастера, настройки, текст контактов. На `bro` читает `venue` |
| `prisma/data/prices_dikidi.csv` | Прайс шаблона. На `bro` файл удалён |
| `prisma/schema.prisma` | `Branch.city` по умолчанию `Бийск`. Смена города — новая миграция, образец `prisma/migrations/20260929200000_bro_city_default` на ветке `bro` |
| `src/salon/flow.ts` | Приветствие и шапка меню |
| `src/salon/service.ts` | Текст «пора стричься» |
| `src/domain/birthday.ts` | Тексты бонуса на день рождения |
| `src/salon/catalog.ts` | Парсер CSV шаблона. Не расширять молча под новый город, если прайс уже в `venue` |
| `src/http/salon.ts` | Публичные данные для сайта |
| `src/index.ts` | Запасной демо-пароль, если в окружении пусто |
| `src/prod/config.ts` | Набор демо-паролей. Новый пароль дописать, `daddyson-demo` оставить |
| `site/index.html`, `site/app.js`, `site/styles.css` | Тексты и цвета. Акцент шаблона `#c44650` / `#ad2323`, фон `#141414` |
| `site/logo.png` | Только если файл логотипа есть в брифе. На `daddyson` логотип — слово шрифтом Great Vibes, файла нет |
| `admin/index.html`, `admin/src/salon-admin.ts`, `admin/src/salon.css` | Название и цвета кабинета |
| `miniapp/index.html`, `miniapp/src/salon-app.ts`, `miniapp/src/salon.css` | Название, город, ключ `sessionStorage` |
| `.env.example` | Имена базы, демо-пароль, `BACKUP_S3_PREFIX`. Токены пустые |
| `docker-compose.yml`, `docker-compose.prod.yml` | Имена Postgres и каталог бэкапа. На хосте с nginx порт только `127.0.0.1` |
| `scripts/backup.ts`, `scripts/watchdog.ts`, `scripts/restore.sh` | Каталог `/var/backups/<slug>` и префикс тревоги |
| `README.md` | Название салона, город, пароль демо, допущения |
| `fixtures/dikidi-clients-sample.csv` | Учебный импорт. В шаблоне там филиал «Васильева 55» и имя «Денис» |
| `tests/domain/onboarding-flow.test.ts` | Ждёт имя шаблона в тексте акции. Поменять ожидание на новый текст, не удалять тест |

Список путей, который сверяется тестом:

```sh
npx tsx scripts/client-touchpoints.ts --list
```

После правок маркеры шаблона в коде:

```sh
npx tsx scripts/client-touchpoints.ts
```

Пустой вывод — в продуктовых файлах не осталось `Daddyson`, `daddyson-demo`, `Васильева 55`, `Училищный пер`. Каталог `docs/` и `AGENTS.md` скрипт не смотрит.

Ключ `salon.seeded` не даёт повторному сиду затереть процент и тексты настроек. Смена прайса в уже накатанной базе через сид не приедет: сид пишет услуги, только если таблица пустая. Для чистого демо — новый том Postgres.

## 4. Тесты

```sh
npm test
npm run build
```

`npm test` не требует Docker. Часовой пояс тестов — `Europe/Moscow` в `vitest.config.ts`, его не переключать на пояс салона.

Локально, если нужен сайт:

```sh
cp .env.example .env
docker compose up -d --build
curl -s http://localhost:3000/health
curl -s http://localhost:3000/health/ready
```

Пароль админки в примере шаблона — `daddyson-demo`, логин `admin`. Для нового салона в `.env.example` свой демо-пароль, в git только пример, не боевой секрет.

## 5. Сервер

Хост `root@194.67.101.109`. На нём уже nginx на 80/443. `scripts/bootstrap-ubuntu.sh` и `docker compose -f docker-compose.prod.yml up` здесь не запускать: боевой compose публикует 80 и 443 через Caddy и заденет чужие сайты.

Не открывать `/opt/verstak` и не править `/etc/nginx/sites-available/crm.mieganalytics.online` (прокси на `127.0.0.1:43123`).

Как выложены текущие демо (проверено по процессам, без чтения секретов):

| Салон | Каталог | Compose | Порт на хосте | Сайт |
|---|---|---|---|---|
| Daddyson | `/opt/daddyson`, git-ветка `daddyson` | `docker-compose.yml` + серверный `docker-compose.override.yml` | `127.0.0.1:3020` | `https://daddy.mieganalytics.online` |
| BRO | `/opt/bro`, копия файлов без `.git` | `docker-compose.yml` (`HOST_PORT`) | `127.0.0.1:3021` | `https://bro.mieganalytics.online` |

Оба с `ALLOW_DEMO_GUEST=true` и `TELEGRAM_TRANSPORT=polling`. Это не боевой режим `APP_ENV=production`.

У daddyson на сервере, и только там, лежит `docker-compose.override.yml`. Он подменяет публикацию порта на `127.0.0.1:3020:3000`, задаёт `extra_hosts` для `api.telegram.org` и выключает IPv6 в контейнере приложения. В git файла нет. У bro override нет: порт берётся из `HOST_PORT`. IP из `extra_hosts` в репозиторий не копировать.

Порядок для следующего салона:

1. Свободный порт: `ss -ltnp`. 3020 и 3021 заняты. В `docker-compose.yml` публикация `127.0.0.1:${HOST_PORT:-3000}:3000`, в `.env` на сервере свой `HOST_PORT`. Не биндить `0.0.0.0`.
2. Каталог `/opt/<slug>`. Удобнее git-клон ветки клиента: `/opt/bro` без `.git`, и `scripts/update.sh` там не работает (`git pull`).
3. `.env` из `.env.example` только на сервере. `PUBLIC_URL=https://<домен>`, `CADDY_DOMAIN` тем же именем (переменная нужна приложению, даже если Caddy не запущен). `ALLOW_DEMO_GUEST=true`, пока это показ. Токены пустые, если бота ещё нет: сайт и админка стартуют без них.
4. Из каталога: `docker compose up -d --build`. Имя проекта берётся из каталога. Миграции и сид выполняет команда контейнера в `Dockerfile`.
5. Nginx по образцу `/etc/nginx/sites-available/bro.mieganalytics.online`: `server_name` домена, редирект 80 → HTTPS, `location /.well-known/acme-challenge/` с корнем `/var/www/certbot`, прокси `https` на `http://127.0.0.1:<HOST_PORT>` с `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`. Файл в `sites-available`, ссылка в `sites-enabled`. Чужие файлы в `sites-enabled` не менять.
6. Сертификат тем же способом, что уже стоит у демо: certbot, authenticator `webroot`, путь `/var/www/certbot` (см. `/etc/letsencrypt/renewal/bro.mieganalytics.online.conf`).

```sh
certbot certonly --webroot -w /var/www/certbot -d <домен>
nginx -t && systemctl reload nginx
```

7. Дым:

```sh
curl -fsS https://<домен>/health/ready
```

Ожидается `{"ok":true}`. Дальше открыть `/`, `/app/?demo=1` (запись до конца), `/admin/` (вход демо-паролем из серверного `.env`), `/privacy`. Если задан токен — `/start` в боте, не отправляя сообщений клиентам салона.

`scripts/update.sh` на этом хосте не использовать: по умолчанию он берёт `docker-compose.prod.yml`. Обновление клона: из `/opt/<slug>` сделать `git pull --ff-only` и `docker compose up -d --build`.

## 6. Снимки для коммерческого предложения

Страницы, которые уже показывали на BRO:

- лендинг, широкое окно и узкое;
- карта Mini App `/app/?demo=1`;
- запись: филиал, услуга, мастер, время;
- календарь `/admin/`;
- диалог знакомства. На `bro` для этого есть статическая страница `site/chat.html` (`/site/chat.html`), на `daddyson` её нет.

В кадр не попадают чужие телефоны из `.env`, токены и база клиентов.

## Что не зафиксировано

- Домен Daddyson на сервере — `daddy.mieganalytics.online`, не `daddyson.mieganalytics.online`. Шаблон `<slug>.mieganalytics.online` сам собой не применяется.
- Порт следующему салону заранее не назначен. Смотреть `ss -ltnp`.
- Юрлицо и ИНН ни у Daddyson, ни у BRO в репозитории не заданы.
- Username ботов лежат только в серверном `.env` (`geo_opti_bot`, `Demo_bro_bot`), в git их нет.
- `/opt/bro` выложен копией без git. Повторять ли так — не решено; для `update.sh` нужен клон, но сам скрипт на этом хосте целится в prod-compose.
