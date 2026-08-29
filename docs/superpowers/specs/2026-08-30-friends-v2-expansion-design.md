# Друзья — расширение v2 (дизайн)

Дата: 2026-08-30  
Статус: черновик для ревью  
Продукт: Telegram-бот кальянной «Друзья»  
Базовый документ: `docs/superpowers/specs/2026-08-22-friends-loyalty-bot-design.md`

## Цель

Расширить текущий продукт (бонусы, касса, check-in, игры, турнир, TTL лотов) блоками для персонала, удержания гостей, маркетинга, новых игр и задела под полноценную платформу (веб-админка, филиалы, интеграции).

Поставка — **четыре фазы**. Каждая фаза сама по себе рабочая; более поздние фазы опираются на API и модели, заложенные в ранних.

## Принципы (общие для всего v2)

| Тема | Решение |
|---|---|
| Часовой пояс | Europe/Moscow |
| Язык UI | русский |
| Права | `User.role` — единственный источник |
| Транзакции | баланс, лоты, проводки — в одной транзакции |
| Аудит | любое действие персонала пишет `Ledger.actorId` или отдельный `StaffActionLog` |
| API-first для отчётов | статистика и экспорт — через HTTP + домен; бот — тонкий клиент |
| Задел под веб | JSON-эндпоинты с `initData`; без отдельной session-авторизации в v2 |

## Порядок поставки

```
Фаза 1 — Операционка персонала + отчёты (фундамент)
Фаза 2 — Удержание и маркетинг
Фаза 3 — Игры и античит
Фаза 4 — Платформа (вне текущего релиза, архитектурный задел)
```

---

# Фаза 1 — Операционка персонала и отчёты

## 1.1 Поиск гостя по имени

### Проблема

Касса ищет только по телефону и QR (`findGuest` в `src/http/cashier.ts`, staff-бот). В зале чаще помнят имя.

### Решение

**Бот (касса):** «Найти гостя» → три варианта: телефон / QR-токен / **имя**.

**Поиск по имени:**

- ввод: одна строка, минимум 2 символа
- нормализация: trim, lower case, схлопнуть пробелы
- матч: `firstName`, `lastName`, конкатенация `firstName + lastName`
- только `role = guest`
- лимит результатов: **10**
- сортировка: точное совпадение → prefix → contains; при равенстве — по `createdAt DESC`

**Если 1 результат** — сразу карточка гостя.  
**Если 2–10** — inline-кнопки: `Иван Петров · ***4567` (последние 4 цифры телефона).  
**Если 0** — «Гость не найден. Попробуйте телефон или QR».

**Mini App (касса):** поле «Имя или фамилия» рядом с телефоном; тот же API.

### API

```
GET /api/cashier/search?q=...&type=name|phone|qr
POST /api/cashier/guest  (расширить body: nameQuery?)
```

Ответ списка:

```ts
{ guests: Array<{ id, firstName, lastName, phoneMasked, balance, visitActive }> }
```

### Store

- `searchGuestsByName(query: string, limit: number): UserRecord[]`
- индекс: `User(role, firstName)`, `User(role, lastName)` или `pg_trgm` при росте базы

### Ошибки

| Код | Когда |
|---|---|
| `query_too_short` | < 2 символов |
| `not_found` | 0 результатов (единственный поиск) |

---

## 1.2 Кнопка «Продлить визит»

### Решение

В карточке гостя (бот + Mini App) для master/admin:

- кнопка **«Продлить визит»** — видна только если `visitActive === true`
- действие: `ends_at = now + visitHours` (из настроек), **не** `ends_at + hours` (как при чеке/check-in — единообразие с `openOrExtendVisit`)
- если визита нет — кнопка «Открыть визит» (уже есть через `staff:visit`; не дублировать, только продление)

### Domain

```ts
extendVisit(store, { guestId, actorId, now })
// → openOrExtendVisit с hours из settings
```

### Ledger

Проводка не создаётся. Опционально `StaffActionLog` (см. 1.3).

---

## 1.3 История действий персонала

### Решение

**Два уровня:**

1. **Быстрый (v2.1):** фильтр `Ledger` где `actorId IS NOT NULL` — типы `check`, `redeem`, `manual`, погашение купона.
2. **Полный аудит:** таблица `StaffActionLog` для всех staff-действий, включая продление визита, check-in (косвенно), поиск.

### Модель `StaffActionLog`

```
id          uuid
actorId     → User
guestId     → User (nullable — рассылка без гостя)
action      enum (см. ниже)
payload     jsonb   — суммы, комментарии, couponId и т.д.
createdAt   datetime
```

**`StaffActionAction`:**  
`check` | `redeem` | `manual_adjust` | `visit_open` | `visit_extend` | `coupon_redeem` | `guest_search`

Запись создаётся **в той же транзакции**, что и основное действие.

### UI админа (бот)

«История персонала» → период (сегодня / 7 дней / ввод дат) → список:

```
30.08 19:42 · Мастер Анна · check · Иван П. · +200 (чек 2000 ₽)
30.08 19:40 · Мастер Анна · visit_extend · Иван П.
```

Пагинация по 20 строк. Фильтр по `actorId` (опционально v2.2).

### API (задел под веб)

```
GET /api/admin/staff-log?from=&to=&actorId=&limit=&offset=
```

Только `role = admin`, auth через `initData`.

---

## 1.4 Карточка гостя богаче

### Текущее

ФИО, телефон, баланс, визит да/нет, купоны (`formatGuestCard` в `src/bot/staff.ts`).

### Добавить

| Поле | Источник |
|---|---|
| Последний визит | `max(Visit.startedAt)` |
| Всего визитов | `count(Visit)` |
| Check-in сегодня | `CheckInLog` за сегодня МСК |
| Баланс по лотам | `BonusLot` grouped by category + nearest `expiresAt` |
| День рождения | `User.birthday`; флаг «неделя ДР» (`isBirthdayWeek`) |
| Рефералы | после фазы 2: «пригласил N, активировано M» |
| Заметка персонала | `User.staffNote` (см. ниже) |
| Статус рассылки | `broadcastOptOut` (только staff) |

**`User.staffNote`:** `String?`, max 500 символов. Редактирует master/admin из карточки → «Заметка» → текст. Видна только персоналу.

**Mini App:** те же блоки; лоты — компактно: «450 подарочных (до 05.09), 300 чековых (до 20.09)».

---

## 1.5 Уведомление мастеру о check-in

### Решение

После успешного `guestCheckIn`:

- найти получателей: все `User` с `role IN (master, admin)` и `telegramId`
- отправить сообщение (не broadcast, личные чаты):

```
🟢 Отметился в зале: Иван Петров
Баланс: 1200 · Визит до 22:30
```

### Настройки (админ)

| Ключ | Дефолт |
|---|---|
| `checkInNotifyEnabled` | `true` |
| `checkInNotifyTelegramIds` | JSON-массив `bigint[]`; пустой = всем master+admin |

Если `checkInNotifyEnabled === false` — тихо.

### Ограничения

- не слать гостю
- ошибка отправки одному мастеру — не откатывать check-in
- rate limit: не чаще 1 сообщения на гостя в 5 мин (debounce по `userId`)

---

## 1.6 Простая статистика в боте (+ задел под веб)

### Метрики (период: сегодня / 7 дней / 30 дней / произвольный)

**Гости:**

- новых регистраций
- check-in / открытых визитов
- уникальных гостей с визитом

**Бонусы:**

- начислено (по типам ledger)
- списано
- сгорело (`expire`)
- **liability** — сумма `BonusLot.remaining` где `expiresAt > now`

**Игры:**

- партий (оценка: при античите — `GameSessionLog`, до этого — прирост `GameScore.points` / эвристика)
- уникальных игроков

**Касса:**

- средний чек (`checkAmount` из ledger)
- операций персонала (`StaffActionLog`)

### UI бота (админ)

«Статистика» → выбор периода → текстовый дайджест + inline «Подробнее» (разбивка по дням, топ-5 мастеров по операциям).

### API (основа для веб-админки v4)

```
GET /api/admin/stats/summary?from=&to=
GET /api/admin/stats/timeseries?from=&to=&metric=visits|bonuses|checkins
GET /api/admin/stats/staff?from=&to=
```

Ответы — стабильные JSON-схемы; бот и будущий веб используют одни контракты.

**Auth v2:** Telegram `initData`, `role === admin`.  
**Auth v4 (веб):** session / API key — отдельная спека.

---

## 1.7 Экспорт в CSV

### Решение

Админ в боте: «Экспорт» → тип → период → файл.

| Тип | Колонки |
|---|---|
| `ledger` | дата, userId, ФИО, тип, сумма, actor, комментарий, checkAmount |
| `visits` | startedAt, endsAt, guest, opener, duration |
| `checkins` | дата, guest, method, visitId |
| `coupons` | title, guest, status, expiresAt, redeemedAt, redeemedBy |
| `staff_log` | дата, actor, action, guest, payload |

### Доставка

- до **10 000** строк — `sendDocument` в Telegram
- больше — ссылка на `GET /api/admin/export.csv?...&token=...` (one-time token, TTL 15 мин)

### API

```
GET /api/admin/export?type=ledger&from=&to=&format=csv
```

---

## 1.8 Очередь / бронь (лёгкая версия)

### Модель `BookingRequest`

```
id, userId, requestedFor DateTime (date+time МСК), partySize int, comment?,
status pending|confirmed|cancelled|completed,
handledBy?, handledAt?, createdAt
```

### Flow гостя

«Забронировать» → дата → время (слоты 18:00–02:00, шаг 30 мин) → кол-во гостей → комментарий → «Заявка отправлена».

### Flow админа/мастера

Уведомление в чат: «Заявка: Иван, 30.08 20:00, 4 чел.» → кнопки Подтвердить / Отменить / Связаться.

### Ограничения v1

- без оплаты
- без календаря занятости столов
- лимит: 1 pending заявка на гостя
- напоминание гостю за 2 часа (cron)

---

# Фаза 2 — Удержание и маркетинг

## 2.1 Реферальная программа

### Механика

1. У каждого гостя — **`referralCode`** (8 символов, unique, uppercase).
2. Ссылка: `https://t.me/{bot}?start=ref_{code}`.
3. Новый гость при регистрации сохраняет **`referredByUserId`** (nullable).
4. **Активация реферала** — первый квалифицирующий визит:
   - `CheckInLog` **или** проводка `check` от персонала
   - в течение **30 дней** после регистрации
5. При активации:
   - реферер: +`referralBonusReferrer` (default **300**)
   - реферал: +`referralBonusReferee` (default **300**)
   - проводки типа `referral` + category `gift` лот

6. Один реферал — одна активация. Self-referral запрещён.

### Модель

```
User.referralCode       String unique
User.referredByUserId   String? → User

ReferralActivation:
  id, referrerId, refereeId, activatedAt, visitId?, ledgerIdReferrer, ledgerIdReferee
  unique(refereeId)
```

### Settings

| Ключ | Дефолт |
|---|---|
| `referralBonusReferrer` | 300 |
| `referralBonusReferee` | 300 |
| `referralActivationDays` | 30 |
| `referralEnabled` | true |

### UI гостя

«Пригласить друга» → ссылка + «Вы пригласили: 2 · Активировано: 1 · Получено: 300 бонусов».

### UI админа

В статистике: рефералов за период, конверсия регистрация → активация.

---

## 2.2 День рождения — шире

### Текущее

Бонус 500 в окне ±3 дня, один раз в год (`birthday.ts`).

### Добавить

| Фича | Описание |
|---|---|
| Предупреждение гостю | За **7 дней** до ДР: «Скоро ваш день рождения — загляните в «Друзья»» |
| Купон на ДР | Опционально: админ включает `birthdayCouponTitle` (nullable); при начислении бонуса создаётся `Coupon` TTL = `birthdayCouponClaimDays` (default 14) |
| Подсказка персоналу | В карточке гостя: «🎂 Неделя ДР» / «🎂 ДР через N дней» |
| Поздравление в день ДР | Если сегодня = anniversary (календарный день МСК): персональное сообщение |

### Settings

| Ключ | Дефолт |
|---|---|
| `birthdayNotifyDaysBefore` | 7 |
| `birthdayCouponTitle` | null |
| `birthdayCouponClaimDays` | 14 |

Начисление бонуса — без изменений (идемпотентность по году сохраняется).

---

## 2.3 Акции с условиями

### Текущее

`Promo` — текст, фото, лента, рассылка. Без логики начисления.

### Расширение: `PromoRule`

Акция может иметь **0 или 1** активное правило начисления:

```
PromoRule:
  promoId     → Promo
  kind        enum
  params      jsonb
  active      boolean
  validFrom   DateTime?
  validUntil  DateTime?
  priority    int @default(0)
```

**Виды правил (v2):**

| kind | params | Когда срабатывает |
|---|---|---|
| `double_check_bonus` | `{}` | `applyCheck`: бонус ×2 в период valid |
| `min_check_bonus` | `{ minRubles, bonus }` | чек ≥ min → +bonus |
| `weekday_multiplier` | `{ weekday: 0-6, multiplier }` | бонус × multiplier (0=пн) |
| `promo_code` | `{ code, bonus }` | мастер вводит код при чеке |

**Промокод при чеке:** в conversation «Чек» — опциональный шаг «Промокод?» → если совпадает с активным rule → доп. начисление `promo_bonus`.

**Стек правил:** в v2 **не комбинируются** — применяется одно правило с наивысшим `priority`. Админ предупреждён в UI.

### UI админа

При создании/редактировании акции: «Добавить условие?» → wizard по kind.

---

## 2.4 Сегментированная рассылка

### Текущее

`recipientsForBroadcast` — все guest без opt-out.

### Сегменты (выбор в wizard рассылки)

| id | SQL-логика |
|---|---|
| `all` | все guest, !optOut |
| `inactive_30d` | нет Visit/CheckIn за 30 дней |
| `active_7d` | был визит/check-in за 7 дней |
| `balance_gt` | balance ≥ X (ввод) |
| `has_coupon` | active Coupon |
| `birthday_week` | `isBirthdayWeek` |
| `referrers` | есть ReferralActivation как referrer |
| `weekly_top` | place ≤ N в прошлой неделе (WeeklyAward) |

### UI

«Рассылка» → «Кому» → сегмент → превью «Получателей: 142» → текст/фото → отправить.

### Domain

```ts
recipientsForSegment(store, segment, params): bigint[]
```

### API

```
POST /api/admin/broadcast/preview  { segment, params }
POST /api/admin/broadcast/send     { segment, params, body, photoId? }
```

---

# Фаза 3 — Игры и античит

## 3.1 Игра 2048

### Каталог

```
Game: slug=game2048, title=«2048», maxScorePerSession=50000, active=true
```

### Mini App

- экран по паттерну `match3.ts` / `block-blast.ts`
- клиент шлёт **только итог партии** (`points`)
- тема: угли / дым / «Друзья» на плитках

### Domain

Без изменений — `submitScoreOrPractice`, общий турнирный зачёт.

---

## 3.2 Flappy-lite

### Каталог

```
Game: slug=flappy, title=«Flappy», maxScorePerSession=500, active=true
```

(низкий потолок — очки = пройденные препятствия)

### Особенности

- короткие сессии, высокая частота запросов → **античит обязателен** (3.4)
- минимальное время партии: **5 сек**
- server-side: отклонять `points > obstacles_max_for_duration`

---

## 3.3 Викторина (опционально, «режим мероприятия»)

> Часто провести сложно — включается только когда админ подготовил контент.

### Модель

```
Quiz:
  id, title, active, showInHub

QuizQuestion:
  id, quizId, sort, text, options jsonb [4 strings], correctIndex

QuizSession:  // запуск админом
  id, quizId, startedAt, endsAt, status draft|live|closed
```

### Flow

1. Админ: CRUD вопросов в боте (или импорт JSON).
2. «Запустить викторину» → `QuizSession live`, push гостям с активным визитом.
3. Mini App: 10 вопросов, 15 сек на ответ, очки за скорость + правильность.
4. Очки идут в **`Game` slug=quiz** только для sessionId текущей сессии.
5. После `endsAt` — session closed; без live-сессии игра **скрыта** в хабе.

### Античит

- один ответ на вопрос
- server хранит `QuizAnswer(userId, questionId, sessionId)`
- очки считает **сервер**, клиент шлёт только `{ questionId, optionIndex, elapsedMs }`

---

## 3.4 Античит усиленный

### Модель `GameSessionLog`

```
id, userId, gameId, slug, points, startedAt, endedAt, accepted, rejectReason?
```

### Правила (применяются в `submitScoreOrPractice` до записи очков)

| Правило | Параметр (Settings) | Дефолт |
|---|---|---|
| Потолок партии | `Game.maxScorePerSession` | per game |
| Макс. партий в час | `maxSessionsPerHour` | 30 |
| Мин. длительность | `minSessionSeconds` | 5 (flappy), 10 (match3), 15 (2048) |
| Макс. очков/сек | `maxPointsPerSecond` | per game table |
| Дубликат счёта | 3 одинаковых points подряд | флаг + reject |
| Резкий скачок | points > 2× личный рекорд недели | reject + log |

Клиент передаёт:

```json
{ slug, points, sessionStartedAt, sessionEndedAt }
```

**Staff/practice** — лог не пишется, `counted: false`.

### Админ

«Подозрительные партии» — последние rejected из `GameSessionLog` (бот или v4 веб).

---

# Фаза 4 — Платформа (roadmap, архитектурный задел)

> Не входит в ближайший релиз v2. Фаза 1 закладывает API; здесь — целевая архитектура.

## 4.1 Веб-админка

**Стек (рекомендация):** React/Vite на `/admin/`, auth через Telegram Login Widget или одноразовый код из бота.

**Экраны v1 веба:**

- Dashboard (stats API фазы 1)
- Гости (поиск, карточка, ledger)
- Рассылки (сегменты)
- Меню / акции / настройки
- Staff log + export
- Игры / quiz sessions

**Бот остаётся** для быстрых операций в зале; веб — для аналитики и контента.

---

## 4.2 Несколько филиалов

### Модель

```
Branch: id, name, slug, timezone, active
User.homeBranchId?
Visit.branchId
CheckInLog.branchId
VenueCode.branchId
Setting: global vs branch-scoped (key prefix branch:{id}:...)
```

**Турнир:** global или per-branch — настройка `tournamentScope`.

**Миграция:** один default branch «Друзья»; все существующие записи → `branchId = default`.

---

## 4.3 Интеграция с POS / 1С

### Контур

- webhook `POST /api/integrations/pos/check` с HMAC
- payload: `{ externalId, phone|qrToken, checkRubles, branchId, timestamp }`
- идемпотентность по `externalId`
- автоматический `applyCheck` без ручного ввода мастера

**Fallback:** ручная касса в боте сохраняется.

---

## 4.4 Apple / Google Wallet (QR гостя)

- PassKit / Google Wallet API: QR = `User.qrToken`
- обновление баланса — push update pass (periodic или webhook)
- генерация pass — ссылка в боте «Добавить в Wallet»

**Зависимости:** сертификаты Apple, Google Cloud project.

---

## 4.5 Оплата в боте

- Telegram Payments / внешний эквайринг
- сценарии: предоплата брони, мерч, подарочный сертификат
- **не смешивать** с бонусным балансом без явной конверсии

Рекомендация: отложить до бронирования (1.8) и юридического контрагента.

---

# Сводная модель данных (новое)

```
User.staffNote, referralCode, referredByUserId
StaffActionLog
ReferralActivation
PromoRule
BookingRequest
GameSessionLog
Quiz, QuizQuestion, QuizSession, QuizAnswer
Branch (фаза 4)
Setting keys: +20 новых (см. разделы)
LedgerType.referral, promo_bonus
```

---

# Новые типы Ledger

| type | category lot | Когда |
|---|---|---|
| `referral` | gift | активация реферала |
| `promo_bonus` | gift | срабатывание PromoRule |

---

# Jobs (планировщик)

| Cron | Job |
|---|---|
| 02:00 МСК | birthday notify (новое) |
| */5 min | booking reminders |
| существующие | birthday grant, expiry, weekly, venue code |

---

# Ошибки (новые)

| Код | Когда |
|---|---|
| `referral_invalid` | битый код / self-referral |
| `referral_already_active` | повторная активация |
| `promo_code_invalid` | код не найден / expired |
| `booking_pending_exists` | уже есть заявка |
| `session_rate_limit` | античит: слишком много партий |
| `session_too_fast` | античит: короткая партия |
| `session_suspicious` | античит: аномалия очков |
| `quiz_not_live` | нет активной QuizSession |

---

# Тесты (минимум)

**Фаза 1:** search by name; extend visit; staff log; rich card fields; check-in notify debounce; stats aggregation; CSV rows.

**Фаза 2:** referral activation on check-in; birthday coupon; promo rule double bonus; segment inactive_30d; broadcast preview count.

**Фаза 3:** 2048/flappy score submit; quiz server scoring; anti-cheat rate limit + min duration.

---

# Вне объёма v2

- Комбинирование нескольких PromoRule
- Публичные ФИО в guest leaderboard
- Автоматическая бронь с календарём столов
- Полноценный POS без webhook-контракта
- Оплата в боте

---

# Рекомендуемый порядок реализации внутри фаз

```
1. StaffActionLog + extend visit + rich card
2. Name search
3. Stats API + bot + CSV export
4. Check-in notify + booking
5. Referral
6. Birthday extended + segments + promo rules
7. Anti-cheat foundation
8. 2048 → Flappy
9. Quiz (когда готов контент)
10. Platform specs → отдельные документы перед стартом фазы 4
```

---

## Связь с исходным дизайном

Дополняет `2026-08-22-friends-loyalty-bot-design.md` и `2026-08-28-bonus-expiry-deduction-design.md`.
