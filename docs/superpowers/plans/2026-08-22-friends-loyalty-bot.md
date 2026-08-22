# Друзья — бот лояльности Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram-бот лояльности кальянной «Друзья»: бонусы, касса в чате и Mini App, контент, рассылки, визиты и недельные игры.

**Architecture:** Домен чистыми функциями + порт `Store` (MemoryStore в тестах, PrismaStore в проде). Один Node-процесс: Hono отдаёт webhook grammY, JSON API Mini App и статику. Джобы (ДР, закрытие недели) крутятся в том же процессе. Клиент Mini App не меняет баланс сам.

**Tech Stack:** TypeScript, grammY, `@grammyjs/conversations`, Hono, Prisma 6 + PostgreSQL, Vitest, Vite (Mini App), Luxon, `qrcode`, `nanoid`

**Spec:** `docs/superpowers/specs/2026-08-22-friends-loyalty-bot-design.md`

Четыре среза спеки — последовательные задачи ниже. После Task 8 касса в боте уже работает. Не пропускать тесты.

---

## File map

| Path | Responsibility |
|---|---|
| `package.json` | scripts: `dev`, `test`, `build`, `start`, prisma seed |
| `tsconfig.json` | Node16, strict |
| `vitest.config.ts` | `tests/**/*.test.ts` |
| `.env.example` | `BOT_TOKEN`, `TELEGRAM_ADMIN_ID`, `DATABASE_URL`, `PUBLIC_URL`, `PORT` |
| `prisma/schema.prisma` | все модели из спеки |
| `prisma/seed.ts` | настройки, `match3`, пустые contacts/directions |
| `src/config.ts` | env |
| `src/db.ts` | PrismaClient |
| `src/domain/errors.ts` | `DomainError` |
| `src/domain/types.ts` | Role, LedgerType, модели портов |
| `src/domain/phone.ts` | нормализация телефона |
| `src/domain/settings.ts` | дефолты и парсинг prize_table |
| `src/domain/week.ts` | понедельник 00:00 МСК |
| `src/domain/birthday.ts` | окно ДР ±3 дня |
| `src/domain/qr-token.ts` | короткий токен |
| `src/domain/users.ts` | регистрация, профиль |
| `src/domain/ledger.ts` | чек / списание / ручное / регистрация |
| `src/domain/roles.ts` | назначение ролей |
| `src/domain/visits.ts` | открыть / продлить / активен ли |
| `src/domain/content.ts` | меню и страницы |
| `src/domain/broadcast.ts` | получатели рассылки |
| `src/domain/coupons.ts` | гашение |
| `src/domain/games.ts` | приём очков |
| `src/domain/weekly.ts` | закрытие недели |
| `src/store/types.ts` | интерфейс `Store` |
| `src/store/memory.ts` | in-memory для тестов |
| `src/store/prisma-store.ts` | прод |
| `src/bot/context.ts` | flavor + Store |
| `src/bot/create-bot.ts` | сборка бота |
| `src/bot/keyboards.ts` | клавиатуры |
| `src/bot/register.ts` | диалог регистрации |
| `src/bot/guest.ts` | меню гостя |
| `src/bot/staff.ts` | касса в чате |
| `src/bot/admin.ts` | настройки, роли, контент, рассылка |
| `src/http/app.ts` | Hono: webhook, API, static |
| `src/http/auth.ts` | проверка initData |
| `src/http/cashier.ts` | API кассы |
| `src/http/games.ts` | API игр и рейтинга |
| `src/jobs/scheduler.ts` | cron |
| `src/index.ts` | вход |
| `miniapp/` | Vite: касса, хаб, три в ряд |
| `tests/domain/*.test.ts` | доменные тесты |
| `tests/http/auth.test.ts` | подпись initData |

---

### Task 1: Каркас репозитория

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: `git init` и файлы каркаса**

```json
{
  "name": "friends-bot",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json && vite build --config miniapp/vite.config.ts",
    "start": "node dist/index.js",
    "prisma": "prisma"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

`.gitignore`: `node_modules`, `dist`, `.env`, `src/generated`

`.env.example`:

```
BOT_TOKEN=
TELEGRAM_ADMIN_ID=
DATABASE_URL=postgresql://friends:friends@localhost:5432/friends
PUBLIC_URL=https://example.com
PORT=3000
```

`tests/smoke.test.ts`:

```ts
import { expect, test } from "vitest";

test("vitest runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 2: Установить зависимости**

```bash
npm install grammy @grammyjs/conversations hono @hono/node-server @prisma/client luxon nanoid qrcode
npm install -D typescript tsx vitest prisma @types/node @types/luxon @types/qrcode vite
```

Версии Prisma: `prisma@6` и `@prisma/client@6` (классический `prisma-client-js`, URL в schema).

- [ ] **Step 3: Прогнать тест**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .env.example .gitignore tests/smoke.test.ts
git commit -m "chore: scaffold friends bot"
```

---

### Task 2: Ошибки, телефон, настройки, неделя

**Files:**
- Create: `src/domain/errors.ts`
- Create: `src/domain/types.ts`
- Create: `src/domain/phone.ts`
- Create: `src/domain/settings.ts`
- Create: `src/domain/week.ts`
- Test: `tests/domain/phone.test.ts`
- Test: `tests/domain/settings.test.ts`
- Test: `tests/domain/week.test.ts`

- [ ] **Step 1: Пишущие тесты**

`tests/domain/phone.test.ts`:

```ts
import { expect, test } from "vitest";
import { normalizePhone } from "../../src/domain/phone.ts";

test("normalizes RU 8 and plus-7 to 11 digits", () => {
  expect(normalizePhone("8 (999) 123-45-67")).toBe("79991234567");
  expect(normalizePhone("+7 999 123 45 67")).toBe("79991234567");
});

test("rejects short numbers", () => {
  expect(() => normalizePhone("123")).toThrow();
});
```

`tests/domain/settings.test.ts`:

```ts
import { expect, test } from "vitest";
import { DEFAULT_SETTINGS, parsePrizeTable } from "../../src/domain/settings.ts";

test("defaults match spec", () => {
  expect(DEFAULT_SETTINGS.percent).toBe(10);
  expect(DEFAULT_SETTINGS.registrationBonus).toBe(500);
  expect(DEFAULT_SETTINGS.birthdayBonus).toBe(500);
  expect(DEFAULT_SETTINGS.visitHours).toBe(4);
  expect(DEFAULT_SETTINGS.winnersCount).toBe(3);
});

test("prize table place 1 can mix bonuses and coupon", () => {
  const table = parsePrizeTable(
    JSON.stringify([{ place: 1, bonuses: 1000, couponTitle: "Кальян" }]),
  );
  expect(table[0]).toEqual({ place: 1, bonuses: 1000, couponTitle: "Кальян" });
});
```

`tests/domain/week.test.ts`:

```ts
import { expect, test } from "vitest";
import { DateTime } from "luxon";
import { weekStartMoscow } from "../../src/domain/week.ts";

test("Saturday Aug 22 2026 belongs to week starting Monday Aug 17 2026 00:00 MSK", () => {
  const t = DateTime.fromISO("2026-08-22T15:00:00", { zone: "Europe/Moscow" });
  const start = weekStartMoscow(t);
  expect(start.toISO()).toBe("2026-08-17T00:00:00.000+03:00");
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/domain/phone.test.ts tests/domain/settings.test.ts tests/domain/week.test.ts`
Expected: FAIL cannot find module

- [ ] **Step 3: Реализация**

`src/domain/errors.ts`:

```ts
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
```

`src/domain/types.ts`:

```ts
export type Role = "guest" | "master" | "admin";

export type LedgerType =
  | "check"
  | "manual"
  | "registration"
  | "birthday"
  | "weekly_prize"
  | "redeem"
  | "coupon_redeem";

export type PrizePlace = {
  place: number;
  bonuses: number;
  couponTitle: string | null;
};

export type Settings = {
  percent: number;
  registrationBonus: number;
  birthdayBonus: number;
  visitHours: number;
  winnersCount: number;
  prizeTable: PrizePlace[];
};
```

`src/domain/phone.ts`:

```ts
import { DomainError } from "./errors.ts";

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let n = digits;
  if (n.length === 11 && n.startsWith("8")) n = `7${n.slice(1)}`;
  if (n.length === 10) n = `7${n}`;
  if (n.length !== 11 || !n.startsWith("7")) {
    throw new DomainError("bad_phone", "Некорректный телефон");
  }
  return n;
}
```

`src/domain/settings.ts`:

```ts
import type { PrizePlace, Settings } from "./types.ts";

export const DEFAULT_SETTINGS: Settings = {
  percent: 10,
  registrationBonus: 500,
  birthdayBonus: 500,
  visitHours: 4,
  winnersCount: 3,
  prizeTable: [
    { place: 1, bonuses: 1000, couponTitle: null },
    { place: 2, bonuses: 500, couponTitle: null },
    { place: 3, bonuses: 300, couponTitle: null },
  ],
};

export function parsePrizeTable(json: string): PrizePlace[] {
  const raw = JSON.parse(json) as PrizePlace[];
  return raw.map((row) => ({
    place: Number(row.place),
    bonuses: Number(row.bonuses),
    couponTitle: row.couponTitle ?? null,
  }));
}

export function calculateCheckBonus(checkRubles: number, percent: number): number {
  return Math.floor((checkRubles * percent) / 100);
}
```

`src/domain/week.ts`:

```ts
import { DateTime } from "luxon";

export const MOSCOW = "Europe/Moscow";

export function weekStartMoscow(at: DateTime): DateTime {
  const local = at.setZone(MOSCOW);
  const weekday = local.weekday; // 1 = Monday
  return local.startOf("day").minus({ days: weekday - 1 });
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run tests/domain`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain tests/domain
git commit -m "feat: domain helpers for phone, settings, week"
```

---

### Task 3: Store, MemoryStore, Prisma-схема

**Files:**
- Create: `src/store/types.ts`
- Create: `src/store/memory.ts`
- Create: `prisma/schema.prisma`
- Create: `src/config.ts`
- Create: `src/db.ts`
- Test: `tests/store/memory.test.ts`

- [ ] **Step 1: Тест MemoryStore**

```ts
import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";

test("creates user and finds by telegram id", async () => {
  const store = new MemoryStore();
  const user = await store.createUser({
    telegramId: 1n,
    role: "guest",
    firstName: "Иван",
    lastName: "Петров",
    birthday: new Date("1990-05-12"),
    phone: "79991234567",
    qrToken: "abc12345",
  });
  expect(user.balance).toBe(0);
  const found = await store.findUserByTelegramId(1n);
  expect(found?.id).toBe(user.id);
  const byPhone = await store.findUserByPhone("79991234567");
  expect(byPhone?.id).toBe(user.id);
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npx vitest run tests/store/memory.test.ts`
Expected: FAIL

- [ ] **Step 3: Типы Store, MemoryStore, schema**

`src/domain/types.ts` — добавить (не ломая предыдущее):

```ts
export type UserRecord = {
  id: string;
  telegramId: bigint;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  birthday: Date | null;
  phone: string | null;
  balance: number;
  qrToken: string;
  broadcastOptOut: boolean;
  createdAt: Date;
};

export type LedgerRecord = {
  id: string;
  userId: string;
  type: LedgerType;
  amount: number;
  actorId: string | null;
  comment: string | null;
  checkAmount: number | null;
  createdAt: Date;
};

export type VisitRecord = {
  id: string;
  userId: string;
  openedBy: string;
  startedAt: Date;
  endsAt: Date;
};

export type CouponRecord = {
  id: string;
  userId: string;
  title: string;
  weekId: string | null;
  status: "active" | "redeemed";
  redeemedBy: string | null;
  redeemedAt: Date | null;
};

export type GameRecord = {
  id: string;
  slug: string;
  title: string;
  active: boolean;
  maxScorePerSession: number;
};

export type GameWeekRecord = {
  id: string;
  gameId: string;
  weekStart: Date;
  closedAt: Date | null;
};

export type GameScoreRecord = {
  weekId: string;
  userId: string;
  points: number;
  updatedAt: Date;
};

export type MenuItemRecord = {
  id: string;
  title: string;
  description: string;
  priceRubles: number | null;
  sort: number;
  active: boolean;
};

export type PromoRecord = {
  id: string;
  body: string;
  photos: string[];
  showInFeed: boolean;
  createdAt: Date;
};

export type ContentPageRecord = {
  slug: "contacts" | "directions";
  body: string;
  mapUrl: string | null;
};
```

`src/store/types.ts` — полный порт (все методы, которые появятся в задачах):

```ts
import type {
  ContentPageRecord,
  CouponRecord,
  GameRecord,
  GameScoreRecord,
  GameWeekRecord,
  LedgerRecord,
  LedgerType,
  MenuItemRecord,
  PromoRecord,
  Role,
  Settings,
  UserRecord,
  VisitRecord,
} from "../domain/types.ts";

export type NewUser = {
  telegramId: bigint;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  birthday: Date | null;
  phone: string | null;
  qrToken: string;
};

export interface Store {
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  createUser(input: NewUser): Promise<UserRecord>;
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByTelegramId(telegramId: bigint): Promise<UserRecord | null>;
  findUserByPhone(phone: string): Promise<UserRecord | null>;
  findUserByQrToken(token: string): Promise<UserRecord | null>;
  updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord>;
  listGuestTelegramIdsForBroadcast(): Promise<bigint[]>;

  addLedger(input: {
    userId: string;
    type: LedgerType;
    amount: number;
    actorId: string | null;
    comment: string | null;
    checkAmount: number | null;
  }): Promise<LedgerRecord>;
  listLedger(userId: string): Promise<LedgerRecord[]>;
  hasBirthdayLedgerInYear(userId: string, year: number): Promise<boolean>;
  listUsersWithBirthday(): Promise<UserRecord[]>;

  getActiveVisit(userId: string, now: Date): Promise<VisitRecord | null>;
  createVisit(input: {
    userId: string;
    openedBy: string;
    startedAt: Date;
    endsAt: Date;
  }): Promise<VisitRecord>;
  updateVisitEndsAt(id: string, endsAt: Date): Promise<VisitRecord>;

  listMenu(): Promise<MenuItemRecord[]>;
  upsertMenuItem(item: Omit<MenuItemRecord, "id"> & { id?: string }): Promise<MenuItemRecord>;
  deleteMenuItem(id: string): Promise<void>;
  getPage(slug: "contacts" | "directions"): Promise<ContentPageRecord | null>;
  upsertPage(page: ContentPageRecord): Promise<ContentPageRecord>;

  createPromo(input: { body: string; photos: string[]; showInFeed: boolean }): Promise<PromoRecord>;
  listFeedPromos(): Promise<PromoRecord[]>;

  listActiveGames(): Promise<GameRecord[]>;
  findGameBySlug(slug: string): Promise<GameRecord | null>;
  getOrCreateOpenWeek(gameId: string, weekStart: Date): Promise<GameWeekRecord>;
  addScore(weekId: string, userId: string, delta: number, at: Date): Promise<GameScoreRecord>;
  listWeekScores(weekId: string): Promise<GameScoreRecord[]>;
  closeWeek(weekId: string, at: Date): Promise<void>;
  hasWeeklyAward(weekId: string, userId: string): Promise<boolean>;
  addWeeklyAward(weekId: string, userId: string, place: number): Promise<void>;

  createCoupon(input: {
    userId: string;
    title: string;
    weekId: string | null;
  }): Promise<CouponRecord>;
  listActiveCoupons(userId: string): Promise<CouponRecord[]>;
  findCoupon(id: string): Promise<CouponRecord | null>;
  redeemCoupon(id: string, by: string, at: Date): Promise<CouponRecord>;

  withTransaction<T>(fn: (store: Store) => Promise<T>): Promise<T>;
}
```

`src/store/memory.ts` — полная реализация ниже, после schema. Без урезания методов: тесты всех следующих задач ходят в этот класс.

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  guest
  master
  admin
}

enum LedgerType {
  check
  manual
  registration
  birthday
  weekly_prize
  redeem
  coupon_redeem
}

enum CouponStatus {
  active
  redeemed
}

model User {
  id               String    @id @default(uuid())
  telegramId       BigInt    @unique
  role             Role      @default(guest)
  firstName        String?
  lastName         String?
  birthday         DateTime? @db.Date
  phone            String?   @unique
  balance          Int       @default(0)
  qrToken          String    @unique
  broadcastOptOut  Boolean   @default(false)
  createdAt        DateTime  @default(now())
  ledger           Ledger[]  @relation("UserLedger")
  actedLedger      Ledger[]  @relation("ActorLedger")
  visits           Visit[]   @relation("VisitGuest")
  openedVisits     Visit[]   @relation("VisitOpener")
  coupons          Coupon[]
  scores           GameScore[]
  awards           WeeklyAward[]
}

model Ledger {
  id          String     @id @default(uuid())
  user        User       @relation("UserLedger", fields: [userId], references: [id])
  userId      String
  type        LedgerType
  amount      Int
  actor       User?      @relation("ActorLedger", fields: [actorId], references: [id])
  actorId     String?
  comment     String?
  checkAmount Int?
  createdAt   DateTime   @default(now())
}

model Visit {
  id        String   @id @default(uuid())
  user      User     @relation("VisitGuest", fields: [userId], references: [id])
  userId    String
  opener    User     @relation("VisitOpener", fields: [openedBy], references: [id])
  openedBy  String
  startedAt DateTime
  endsAt    DateTime
}

model Setting {
  key   String @id
  value String
}

model ContentPage {
  slug   String  @id
  body   String  @default("")
  mapUrl String?
}

model MenuItem {
  id           String  @id @default(uuid())
  title        String
  description  String  @default("")
  priceRubles  Int?
  sort         Int     @default(0)
  active       Boolean @default(true)
}

model Promo {
  id         String   @id @default(uuid())
  body       String
  photos     String[]
  showInFeed Boolean  @default(true)
  createdAt  DateTime @default(now())
}

model Game {
  id                  String     @id @default(uuid())
  slug                String     @unique
  title               String
  active              Boolean    @default(true)
  maxScorePerSession  Int
  weeks               GameWeek[]
}

model GameWeek {
  id        String      @id @default(uuid())
  game      Game        @relation(fields: [gameId], references: [id])
  gameId    String
  weekStart DateTime
  closedAt  DateTime?
  scores    GameScore[]
  coupons   Coupon[]
  awards    WeeklyAward[]
  @@unique([gameId, weekStart])
}

model GameScore {
  week      GameWeek @relation(fields: [weekId], references: [id])
  weekId    String
  user      User     @relation(fields: [userId], references: [id])
  userId    String
  points    Int      @default(0)
  updatedAt DateTime
  @@id([weekId, userId])
}

model Coupon {
  id         String       @id @default(uuid())
  user       User         @relation(fields: [userId], references: [id])
  userId     String
  title      String
  week       GameWeek?    @relation(fields: [weekId], references: [id])
  weekId     String?
  status     CouponStatus @default(active)
  redeemedBy String?
  redeemedAt DateTime?
}

model WeeklyAward {
  week   GameWeek @relation(fields: [weekId], references: [id])
  weekId String
  user   User     @relation(fields: [userId], references: [id])
  userId String
  place  Int
  @@id([weekId, userId])
}
```

`src/config.ts` читает env, кидает если нет `BOT_TOKEN` / `TELEGRAM_ADMIN_ID` / `DATABASE_URL` / `PUBLIC_URL` в проде. В тестах config не обязателен.

`src/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

`src/store/memory.ts` (полный класс):

```ts
import { DEFAULT_SETTINGS } from "../domain/settings.ts";
import type {
  ContentPageRecord,
  CouponRecord,
  GameRecord,
  GameScoreRecord,
  GameWeekRecord,
  LedgerRecord,
  LedgerType,
  MenuItemRecord,
  PromoRecord,
  Settings,
  UserRecord,
  VisitRecord,
} from "../domain/types.ts";
import type { NewUser, Store } from "./types.ts";

export class MemoryStore implements Store {
  settings: Settings = structuredClone(DEFAULT_SETTINGS);
  users = new Map<string, UserRecord>();
  ledger: LedgerRecord[] = [];
  visits = new Map<string, VisitRecord>();
  menu = new Map<string, MenuItemRecord>();
  pages = new Map<string, ContentPageRecord>();
  promos = new Map<string, PromoRecord>();
  games = new Map<string, GameRecord>();
  weeks = new Map<string, GameWeekRecord>();
  scores = new Map<string, GameScoreRecord>();
  coupons = new Map<string, CouponRecord>();
  awards = new Set<string>();

  constructor() {
    const id = crypto.randomUUID();
    this.games.set(id, {
      id,
      slug: "match3",
      title: "Три в ряд",
      active: true,
      maxScorePerSession: 50000,
    });
  }

  async withTransaction<T>(fn: (store: Store) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async getSettings() {
    return structuredClone(this.settings);
  }
  async updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    return this.getSettings();
  }

  async createUser(input: NewUser): Promise<UserRecord> {
    const user: UserRecord = {
      id: crypto.randomUUID(),
      telegramId: input.telegramId,
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
      birthday: input.birthday,
      phone: input.phone,
      balance: 0,
      qrToken: input.qrToken,
      broadcastOptOut: false,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async findUserById(id: string) {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }
  async findUserByTelegramId(telegramId: bigint) {
    return [...this.users.values()].find((u) => u.telegramId === telegramId) ?? null;
  }
  async findUserByPhone(phone: string) {
    return [...this.users.values()].find((u) => u.phone === phone) ?? null;
  }
  async findUserByQrToken(token: string) {
    return [...this.users.values()].find((u) => u.qrToken === token) ?? null;
  }
  async updateUser(id: string, patch: Partial<UserRecord>) {
    const cur = this.users.get(id);
    if (!cur) throw new Error("user missing");
    const next = { ...cur, ...patch, id: cur.id };
    this.users.set(id, next);
    return { ...next };
  }
  async listGuestTelegramIdsForBroadcast() {
    return [...this.users.values()]
      .filter((u) => u.role === "guest" && !u.broadcastOptOut)
      .map((u) => u.telegramId);
  }

  async addLedger(input: {
    userId: string;
    type: LedgerType;
    amount: number;
    actorId: string | null;
    comment: string | null;
    checkAmount: number | null;
  }) {
    const row: LedgerRecord = { id: crypto.randomUUID(), createdAt: new Date(), ...input };
    this.ledger.push(row);
    return row;
  }
  async listLedger(userId: string) {
    return this.ledger.filter((l) => l.userId === userId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async hasBirthdayLedgerInYear(userId: string, year: number) {
    return this.ledger.some(
      (l) => l.userId === userId && l.type === "birthday" && l.createdAt.getUTCFullYear() === year,
    );
  }
  async listUsersWithBirthday() {
    return [...this.users.values()].filter((u) => u.birthday);
  }

  async getActiveVisit(userId: string, now: Date) {
    return (
      [...this.visits.values()].find((v) => v.userId === userId && now < v.endsAt) ?? null
    );
  }
  async createVisit(input: { userId: string; openedBy: string; startedAt: Date; endsAt: Date }) {
    const row: VisitRecord = { id: crypto.randomUUID(), ...input };
    this.visits.set(row.id, row);
    return row;
  }
  async updateVisitEndsAt(id: string, endsAt: Date) {
    const v = this.visits.get(id)!;
    const next = { ...v, endsAt };
    this.visits.set(id, next);
    return next;
  }

  async listMenu() {
    return [...this.menu.values()].filter((m) => m.active).sort((a, b) => a.sort - b.sort);
  }
  async upsertMenuItem(item: Omit<MenuItemRecord, "id"> & { id?: string }) {
    const id = item.id ?? crypto.randomUUID();
    const row = { ...item, id };
    this.menu.set(id, row);
    return row;
  }
  async deleteMenuItem(id: string) {
    this.menu.delete(id);
  }
  async getPage(slug: "contacts" | "directions") {
    return this.pages.get(slug) ?? null;
  }
  async upsertPage(page: ContentPageRecord) {
    this.pages.set(page.slug, page);
    return page;
  }

  async createPromo(input: { body: string; photos: string[]; showInFeed: boolean }) {
    const row: PromoRecord = { id: crypto.randomUUID(), createdAt: new Date(), ...input };
    this.promos.set(row.id, row);
    return row;
  }
  async listFeedPromos() {
    return [...this.promos.values()].filter((p) => p.showInFeed);
  }

  async listActiveGames() {
    return [...this.games.values()].filter((g) => g.active);
  }
  async findGameBySlug(slug: string) {
    return [...this.games.values()].find((g) => g.slug === slug) ?? null;
  }
  async getOrCreateOpenWeek(gameId: string, weekStart: Date) {
    const found = [...this.weeks.values()].find(
      (w) => w.gameId === gameId && w.weekStart.getTime() === weekStart.getTime() && !w.closedAt,
    );
    if (found) return found;
    const row: GameWeekRecord = {
      id: crypto.randomUUID(),
      gameId,
      weekStart,
      closedAt: null,
    };
    this.weeks.set(row.id, row);
    return row;
  }
  async addScore(weekId: string, userId: string, delta: number, at: Date) {
    const key = `${weekId}:${userId}`;
    const cur = this.scores.get(key);
    const row: GameScoreRecord = {
      weekId,
      userId,
      points: (cur?.points ?? 0) + delta,
      updatedAt: at,
    };
    this.scores.set(key, row);
    return row;
  }
  async listWeekScores(weekId: string) {
    return [...this.scores.values()].filter((s) => s.weekId === weekId);
  }
  async closeWeek(weekId: string, at: Date) {
    const w = this.weeks.get(weekId)!;
    this.weeks.set(weekId, { ...w, closedAt: at });
  }
  async hasWeeklyAward(weekId: string, userId: string) {
    return this.awards.has(`${weekId}:${userId}`);
  }
  async addWeeklyAward(weekId: string, userId: string, _place: number) {
    this.awards.add(`${weekId}:${userId}`);
  }

  async createCoupon(input: { userId: string; title: string; weekId: string | null }) {
    const row: CouponRecord = {
      id: crypto.randomUUID(),
      status: "active",
      redeemedBy: null,
      redeemedAt: null,
      ...input,
    };
    this.coupons.set(row.id, row);
    return row;
  }
  async listActiveCoupons(userId: string) {
    return [...this.coupons.values()].filter((c) => c.userId === userId && c.status === "active");
  }
  async findCoupon(id: string) {
    return this.coupons.get(id) ?? null;
  }
  async redeemCoupon(id: string, by: string, at: Date) {
    const c = this.coupons.get(id)!;
    const next = { ...c, status: "redeemed" as const, redeemedBy: by, redeemedAt: at };
    this.coupons.set(id, next);
    return next;
  }
}
```

PrismaStore — в Task 7, те же методы через PrismaClient. Сейчас достаточно MemoryStore + schema.

- [ ] **Step 4: Тест MemoryStore зелёный**

Run: `npx vitest run tests/store/memory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store src/domain/types.ts src/config.ts src/db.ts prisma tests/store
git commit -m "feat: store port, memory store, prisma schema"
```

---

### Task 4: Регистрация гостя

**Files:**
- Create: `src/domain/qr-token.ts`
- Create: `src/domain/users.ts`
- Test: `tests/domain/users.test.ts`

- [ ] **Step 1: Тест**

```ts
import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { DomainError } from "../../src/domain/errors.ts";

test("registers guest with 500 bonuses once", async () => {
  const store = new MemoryStore();
  const user = await registerGuest(store, {
    telegramId: 10n,
    firstName: "Анна",
    lastName: "Кирова",
    birthday: new Date("1995-03-01"),
    phone: "+7 999 111-22-33",
  });
  expect(user.balance).toBe(500);
  expect(user.phone).toBe("79991112233");
  expect(user.qrToken.length).toBeGreaterThanOrEqual(8);
  const ledger = await store.listLedger(user.id);
  expect(ledger[0]?.type).toBe("registration");
  expect(ledger[0]?.amount).toBe(500);
});

test("same telegram id is not duplicated", async () => {
  const store = new MemoryStore();
  const input = {
    telegramId: 10n,
    firstName: "Анна",
    lastName: "Кирова",
    birthday: new Date("1995-03-01"),
    phone: "79991112233",
  };
  await registerGuest(store, input);
  await expect(registerGuest(store, input)).rejects.toBeInstanceOf(DomainError);
});

test("duplicate phone is rejected", async () => {
  const store = new MemoryStore();
  await registerGuest(store, {
    telegramId: 1n,
    firstName: "A",
    lastName: "B",
    birthday: new Date("1990-01-01"),
    phone: "79990000001",
  });
  await expect(
    registerGuest(store, {
      telegramId: 2n,
      firstName: "C",
      lastName: "D",
      birthday: new Date("1990-01-01"),
      phone: "79990000001",
    }),
  ).rejects.toMatchObject({ code: "phone_taken" });
});
```

- [ ] **Step 2: FAIL**

Run: `npx vitest run tests/domain/users.test.ts`
Expected: FAIL

- [ ] **Step 3: Реализация**

`src/domain/qr-token.ts`:

```ts
import { nanoid } from "nanoid";

export function newQrToken(): string {
  return nanoid(10);
}
```

`src/domain/users.ts`:

```ts
import { DomainError } from "./errors.ts";
import { normalizePhone } from "./phone.ts";
import { newQrToken } from "./qr-token.ts";
import type { Store } from "../store/types.ts";

export async function registerGuest(
  store: Store,
  input: {
    telegramId: bigint;
    firstName: string;
    lastName: string;
    birthday: Date;
    phone: string;
  },
) {
  const existing = await store.findUserByTelegramId(input.telegramId);
  if (existing) throw new DomainError("already_registered", "Уже зарегистрирован");
  const phone = normalizePhone(input.phone);
  if (await store.findUserByPhone(phone)) {
    throw new DomainError("phone_taken", "Телефон уже занят");
  }
  const settings = await store.getSettings();
  return store.withTransaction(async (tx) => {
    const user = await tx.createUser({
      telegramId: input.telegramId,
      role: "guest",
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      birthday: input.birthday,
      phone,
      qrToken: newQrToken(),
    });
    const next = await tx.updateUser(user.id, {
      balance: settings.registrationBonus,
    });
    await tx.addLedger({
      userId: user.id,
      type: "registration",
      amount: settings.registrationBonus,
      actorId: null,
      comment: "Регистрация",
      checkAmount: null,
    });
    return next;
  });
}

export async function updateGuestProfile(
  store: Store,
  userId: string,
  patch: { firstName?: string; lastName?: string; birthday?: Date; phone?: string },
) {
  if (patch.phone) {
    const phone = normalizePhone(patch.phone);
    const other = await store.findUserByPhone(phone);
    if (other && other.id !== userId) {
      throw new DomainError("phone_taken", "Телефон уже занят");
    }
    patch = { ...patch, phone };
  }
  return store.updateUser(userId, patch);
}
```

MemoryStore.`updateUser` должен мержить поля, включая `phone` как string.

- [ ] **Step 4: PASS**

Run: `npx vitest run tests/domain/users.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/users.ts src/domain/qr-token.ts tests/domain/users.test.ts src/store/memory.ts
git commit -m "feat: register guest with signup bonus"
```

---

### Task 5: Касса — чек, списание, ручное, визит

**Files:**
- Create: `src/domain/visits.ts`
- Create: `src/domain/ledger.ts`
- Test: `tests/domain/ledger.test.ts`
- Test: `tests/domain/visits.test.ts`

- [ ] **Step 1: Тесты**

`tests/domain/ledger.test.ts`:

```ts
import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { applyCheck, redeemBonuses, manualAdjust } from "../../src/domain/ledger.ts";
import { DomainError } from "../../src/domain/errors.ts";

async function guest(store: MemoryStore) {
  return registerGuest(store, {
    telegramId: 1n,
    firstName: "Г",
    lastName: "О",
    birthday: new Date("1990-01-01"),
    phone: "79991111111",
  });
}

async function staff(store: MemoryStore) {
  return store.createUser({
    telegramId: 99n,
    role: "master",
    firstName: "Мастер",
    lastName: "Зала",
    birthday: null,
    phone: null,
    qrToken: "stafftoken1",
  });
}

test("2000 rub check at 10% adds 200 and opens visit", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  const s = await staff(store);
  const now = new Date("2026-08-22T12:00:00+03:00");
  const result = await applyCheck(store, {
    guestId: g.id,
    actorId: s.id,
    checkRubles: 2000,
    now,
  });
  expect(result.user.balance).toBe(700);
  expect(result.bonus).toBe(200);
  const visit = await store.getActiveVisit(g.id, now);
  expect(visit).not.toBeNull();
  const hours = (visit!.endsAt.getTime() - now.getTime()) / 3600000;
  expect(hours).toBe(4);
});

test("redeem cannot exceed balance", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  const s = await staff(store);
  await expect(
    redeemBonuses(store, { guestId: g.id, actorId: s.id, amount: 501 }),
  ).rejects.toMatchObject({ code: "insufficient" });
});

test("manual negative is clamped by balance", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  const s = await staff(store);
  await expect(
    manualAdjust(store, { guestId: g.id, actorId: s.id, delta: -501, comment: "ошибка" }),
  ).rejects.toBeInstanceOf(DomainError);
  const ok = await manualAdjust(store, {
    guestId: g.id,
    actorId: s.id,
    delta: -100,
    comment: "коррекция",
  });
  expect(ok.balance).toBe(400);
});

test("guest cannot apply check", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  await expect(
    applyCheck(store, {
      guestId: g.id,
      actorId: g.id,
      checkRubles: 100,
      now: new Date(),
    }),
  ).rejects.toMatchObject({ code: "forbidden" });
});
```

`tests/domain/visits.test.ts` — повторный чек продлевает `endsAt` до `now + visitHours`.

- [ ] **Step 2: FAIL**

Run: `npx vitest run tests/domain/ledger.test.ts tests/domain/visits.test.ts`
Expected: FAIL

- [ ] **Step 3: Реализация**

`src/domain/visits.ts`:

```ts
import type { Store } from "../store/types.ts";

export function visitActive(endsAt: Date, now: Date): boolean {
  return now < endsAt;
}

export async function openOrExtendVisit(
  store: Store,
  input: { userId: string; openedBy: string; hours: number; now: Date },
) {
  const endsAt = new Date(input.now.getTime() + input.hours * 3600 * 1000);
  const current = await store.getActiveVisit(input.userId, input.now);
  if (current) return store.updateVisitEndsAt(current.id, endsAt);
  return store.createVisit({
    userId: input.userId,
    openedBy: input.openedBy,
    startedAt: input.now,
    endsAt,
  });
}
```

`src/domain/ledger.ts`:

```ts
import { DomainError } from "./errors.ts";
import { calculateCheckBonus } from "./settings.ts";
import { openOrExtendVisit } from "./visits.ts";
import type { Store } from "../store/types.ts";

async function requireStaff(store: Store, actorId: string) {
  const actor = await store.findUserById(actorId);
  if (!actor || (actor.role !== "master" && actor.role !== "admin")) {
    throw new DomainError("forbidden", "Недостаточно прав");
  }
  return actor;
}

export async function applyCheck(
  store: Store,
  input: { guestId: string; actorId: string; checkRubles: number; now: Date },
) {
  if (input.checkRubles <= 0) throw new DomainError("bad_amount", "Сумма чека должна быть > 0");
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const settings = await tx.getSettings();
    const bonus = calculateCheckBonus(input.checkRubles, settings.percent);
    const guest = await tx.findUserById(input.guestId);
    if (!guest) throw new DomainError("not_found", "Гость не найден");
    const user = await tx.updateUser(guest.id, { balance: guest.balance + bonus });
    await tx.addLedger({
      userId: guest.id,
      type: "check",
      amount: bonus,
      actorId: input.actorId,
      comment: `Чек ${input.checkRubles} ₽`,
      checkAmount: input.checkRubles,
    });
    const visit = await openOrExtendVisit(tx, {
      userId: guest.id,
      openedBy: input.actorId,
      hours: settings.visitHours,
      now: input.now,
    });
    return { user, bonus, visit };
  });
}

export async function redeemBonuses(
  store: Store,
  input: { guestId: string; actorId: string; amount: number },
) {
  if (input.amount <= 0) throw new DomainError("bad_amount", "Сумма должна быть > 0");
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const guest = await tx.findUserById(input.guestId);
    if (!guest) throw new DomainError("not_found", "Гость не найден");
    if (guest.balance < input.amount) {
      throw new DomainError("insufficient", "Недостаточно бонусов");
    }
    const user = await tx.updateUser(guest.id, { balance: guest.balance - input.amount });
    await tx.addLedger({
      userId: guest.id,
      type: "redeem",
      amount: -input.amount,
      actorId: input.actorId,
      comment: "Списание на кассе",
      checkAmount: null,
    });
    return user;
  });
}

export async function manualAdjust(
  store: Store,
  input: { guestId: string; actorId: string; delta: number; comment: string },
) {
  if (!input.comment.trim()) throw new DomainError("bad_comment", "Нужен комментарий");
  if (input.delta === 0) throw new DomainError("bad_amount", "Дельта не ноль");
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const guest = await tx.findUserById(input.guestId);
    if (!guest) throw new DomainError("not_found", "Гость не найден");
    const next = guest.balance + input.delta;
    if (next < 0) throw new DomainError("insufficient", "Баланс уйдёт в минус");
    const user = await tx.updateUser(guest.id, { balance: next });
    await tx.addLedger({
      userId: guest.id,
      type: "manual",
      amount: input.delta,
      actorId: input.actorId,
      comment: input.comment.trim(),
      checkAmount: null,
    });
    return user;
  });
}
```

- [ ] **Step 4: PASS**

Run: `npx vitest run tests/domain/ledger.test.ts tests/domain/visits.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/ledger.ts src/domain/visits.ts tests/domain/ledger.test.ts tests/domain/visits.test.ts src/store/memory.ts
git commit -m "feat: check, redeem, manual adjust, visit window"
```

---

### Task 6: Роли

**Files:**
- Create: `src/domain/roles.ts`
- Test: `tests/domain/roles.test.ts`

- [ ] **Step 1: Тест**

```ts
import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";
import { assignRole } from "../../src/domain/roles.ts";
import { applyCheck } from "../../src/domain/ledger.ts";
import { registerGuest } from "../../src/domain/users.ts";

test("admin can promote telegram id to master without signup bonus", async () => {
  const store = new MemoryStore();
  const admin = await store.createUser({
    telegramId: 100n,
    role: "admin",
    firstName: "Админ",
    lastName: "А",
    birthday: null,
    phone: null,
    qrToken: "admintok01",
  });
  const master = await assignRole(store, {
    actorId: admin.id,
    telegramId: 200n,
    role: "master",
  });
  expect(master.role).toBe("master");
  expect(master.balance).toBe(0);
});

test("master cannot assign roles", async () => {
  const store = new MemoryStore();
  const master = await store.createUser({
    telegramId: 2n,
    role: "master",
    firstName: "M",
    lastName: "M",
    birthday: null,
    phone: null,
    qrToken: "mastertok1",
  });
  await expect(
    assignRole(store, { actorId: master.id, telegramId: 3n, role: "master" }),
  ).rejects.toMatchObject({ code: "forbidden" });
});

test("master cannot apply check if we only check role in ledger", async () => {
  const store = new MemoryStore();
  const guest = await registerGuest(store, {
    telegramId: 1n,
    firstName: "Г",
    lastName: "О",
    birthday: new Date("1990-01-01"),
    phone: "79992222222",
  });
  await expect(
    applyCheck(store, {
      guestId: guest.id,
      actorId: guest.id,
      checkRubles: 100,
      now: new Date(),
    }),
  ).rejects.toMatchObject({ code: "forbidden" });
});
```

- [ ] **Step 2: FAIL** — Run: `npx vitest run tests/domain/roles.test.ts`

- [ ] **Step 3: `assignRole`**

```ts
import { DomainError } from "./errors.ts";
import { newQrToken } from "./qr-token.ts";
import type { Role } from "./types.ts";
import type { Store } from "../store/types.ts";

export async function assignRole(
  store: Store,
  input: { actorId: string; telegramId: bigint; role: Role },
) {
  const actor = await store.findUserById(input.actorId);
  if (!actor || actor.role !== "admin") {
    throw new DomainError("forbidden", "Только админ");
  }
  const existing = await store.findUserByTelegramId(input.telegramId);
  if (existing) return store.updateUser(existing.id, { role: input.role });
  return store.createUser({
    telegramId: input.telegramId,
    role: input.role,
    firstName: null,
    lastName: null,
    birthday: null,
    phone: null,
    qrToken: newQrToken(),
  });
}
```

В `create-bot` позже: если `telegramId === TELEGRAM_ADMIN_ID`, перед хендлерами `ensureAdminFromEnv` — найти или создать user с role admin.

- [ ] **Step 4: PASS** — Run: `npx vitest run tests/domain/roles.test.ts`

- [ ] **Step 5: Commit** `feat: admin role assignment`

---

### Task 7: PrismaStore + бот регистрации

**Files:**
- Create: `src/store/prisma-store.ts`
- Create: `src/bot/context.ts`
- Create: `src/bot/keyboards.ts`
- Create: `src/bot/register.ts`
- Create: `src/bot/guest.ts`
- Create: `src/bot/create-bot.ts`
- Create: `prisma/seed.ts`
- Modify: `package.json` — `"prisma": { "seed": "tsx prisma/seed.ts" }`

- [ ] **Step 1: Миграция** (нужен локальный Postgres или docker)

```bash
docker run -d --name friends-pg -e POSTGRES_PASSWORD=friends -e POSTGRES_USER=friends -e POSTGRES_DB=friends -p 5432:5432 postgres:16
echo 'DATABASE_URL=postgresql://friends:friends@localhost:5432/friends' > .env
npx prisma migrate dev --name init
```

Expected: migration applied.

- [ ] **Step 2: PrismaStore** — все методы `Store` через `prisma`. `withTransaction`: `prisma.$transaction(async (tx) => fn(new PrismaStore(tx)))`. Конструктор принимает `PrismaClient | Prisma.TransactionClient`. Settings: строки в таблице `Setting`, JSON для `prizeTable`.

Сиды в `prisma/seed.ts`: записать DEFAULT_SETTINGS, страницы contacts/directions пустые, игра `match3` / «Три в ряд» / maxScore 50000.

- [ ] **Step 3: Бот**

`src/bot/context.ts`:

```ts
import { Context, SessionFlavor } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";
import type { Store } from "../store/types.ts";
import type { UserRecord } from "../domain/types.ts";

export type SessionData = { staffGuestId?: string };

export type BotContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor<Context> & {
    store: Store;
    dbUser: UserRecord | null;
    config: { adminTelegramId: bigint; publicUrl: string };
  };
```

`src/bot/register.ts`: conversation `registerGuest`:

1. «Как вас зовут? (имя)» — `waitFor(":text")`
2. «Фамилия?»
3. «Дата рождения, ДД.ММ.ГГГГ»
4. Reply keyboard `request_contact: true` «Поделиться контактом»
5. `conversation.form.contact` / `waitFor("message:contact")`
6. `registerGuest(ctx.store, ...)`
7. Ответ: баланс и «добро пожаловать в Друзья»

Парсинг даты: `^(\d{2})\.(\d{2})\.(\d{4})$` → `Date.UTC(y, m-1, d)`.

`src/bot/keyboards.ts`: guest keyboard ряды: «Баланс и QR», «История», «Профиль», «Меню», «Акции», «Как доехать», «Контакты», «Игры». Staff: «Найти гостя». Admin: то же + «Настройки», «Роли», «Рассылка».

`src/bot/guest.ts`: `/start` — если нет user и не admin env → `enter("registerGuest")`. Если admin env без записи — создать admin (без 500). Если гость есть — показать keyboard.

`src/bot/create-bot.ts`:

```ts
import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { BotContext } from "./context.ts";
import type { Store } from "../store/types.ts";

export function createBot(token: string, store: Store, config: { adminTelegramId: bigint; publicUrl: string }) {
  const bot = new Bot<BotContext>(token);
  bot.use(session({ initial: () => ({}) }));
  bot.use(conversations());
  bot.use(async (ctx, next) => {
    ctx.store = store;
    ctx.config = config;
    const id = ctx.from?.id;
    ctx.dbUser = id ? await store.findUserByTelegramId(BigInt(id)) : null;
    if (id && BigInt(id) === config.adminTelegramId && ctx.dbUser?.role !== "admin") {
      ctx.dbUser = ctx.dbUser
        ? await store.updateUser(ctx.dbUser.id, { role: "admin" })
        : await store.createUser({
            telegramId: BigInt(id),
            role: "admin",
            firstName: ctx.from?.first_name ?? "Админ",
            lastName: null,
            birthday: null,
            phone: null,
            qrToken: (await import("../domain/qr-token.ts")).newQrToken(),
          });
    }
    await next();
  });
  bot.use(createConversation(registerGuestConversation, "registerGuest"));
  // guest + staff + admin handlers
  return bot;
}
```

Гость после регистрации: клавиатура, «Баланс» (число + код), «История» из `listLedger`. Кнопки кассы и админки подключаются в Task 8, до этого на них можно не вешать хендлеры.

- [ ] **Step 4: Ручная проверка** `BOT_TOKEN` + `tsx src/dev-polling.ts` (временный файл: `bot.start()` без webhook) — `/start`, регистрация, 500 на балансе. Затем удалить polling-файл, когда появится `src/index.ts`.

Можно оставить `src/dev-polling.ts` для локалки.

- [ ] **Step 5: Commit** `feat: prisma store and guest registration bot`

---

### Task 8: Касса в чате бота (срез 1 готов)

**Files:**
- Create: `src/bot/staff.ts`
- Create: `src/bot/admin.ts`
- Modify: `src/bot/create-bot.ts`

- [ ] **Step 1: Диалоги staff** (без нового доменного теста — домен уже покрыт). Conversation `staffFind`:

1. «Номер телефона гостя»
2. `normalizePhone` + `findUserByPhone`
3. нет — «проверьте номер», выход
4. Карточка: ФИО, телефон, баланс, визит, кнопки inline: `check`, `redeem`, `manual`, `visit`

Conversations `staffCheck` / `staffRedeem` / `staffManual` / `staffVisit` берут `session.staffGuestId`, зовут `applyCheck` / `redeemBonuses` / `manualAdjust` / `openOrExtendVisit`. Ошибки `DomainError` — текст `error.message`.

Admin conversation `setPercent`: число → `updateSettings({ percent })`. То же для registration/birthday/visitHours. `assignRole` по Telegram ID + роль.

Мастер не видит кнопки «Настройки» / «Роли» / «Рассылка» (клавиатура по `dbUser.role`).

Гость «Профиль»: conversation — имя, фамилия, дата, опционально новый контакт. Вызов `updateGuestProfile`.

- [ ] **Step 2: Запрет мастеру настроек в боте**

В `admin.ts` в начале каждого хендлера:

```ts
if (ctx.dbUser?.role !== "admin") {
  await ctx.reply("Только для админа");
  return;
}
```

Это закрывает требование теста «мастер не меняет % и не шлёт рассылку» на границе бота. Домен `assignRole` уже запрещает.

- [ ] **Step 3: Ручная проверка кассы без Mini App** — мастер находит гостя по телефону, чек 2000 → +200.

- [ ] **Step 4: Commit** `feat: staff cashier and admin settings in chat`

Срез 1 закрыт.

---

### Task 9: Контент — меню, контакты, как доехать

**Files:**
- Create: `src/domain/content.ts`
- Test: `tests/domain/content.test.ts`
- Modify: `src/bot/guest.ts`, `src/bot/admin.ts`

- [ ] **Step 1: Тест CRUD меню и страниц**

```ts
import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";
import { addMenuItem, listActiveMenu, savePage } from "../../src/domain/content.ts";

test("admin adds menu item, guest list sees it", async () => {
  const store = new MemoryStore();
  const admin = await store.createUser({
    telegramId: 1n,
    role: "admin",
    firstName: "A",
    lastName: "A",
    birthday: null,
    phone: null,
    qrToken: "tokadmin01",
  });
  await addMenuItem(store, {
    actorId: admin.id,
    title: "Классика",
    description: "Яблоко",
    priceRubles: 1500,
  });
  const menu = await listActiveMenu(store);
  expect(menu[0]?.title).toBe("Классика");
  expect(menu[0]?.priceRubles).toBe(1500);
});

test("master cannot edit menu", async () => {
  const store = new MemoryStore();
  const master = await store.createUser({
    telegramId: 2n,
    role: "master",
    firstName: "M",
    lastName: "M",
    birthday: null,
    phone: null,
    qrToken: "tokmaster1",
  });
  await expect(
    addMenuItem(store, { actorId: master.id, title: "X", description: "", priceRubles: null }),
  ).rejects.toMatchObject({ code: "forbidden" });
});
```

- [ ] **Step 2: FAIL** — Run: `npx vitest run tests/domain/content.test.ts`

- [ ] **Step 3: `content.ts`** — `requireAdmin`, `addMenuItem`, `listActiveMenu`, `savePage`. Guest handlers печатают меню списком, contacts/directions из `getPage`. Admin диалоги: добавить позицию, текст страницы, mapUrl для directions.

- [ ] **Step 4: PASS** + commit `feat: venue menu and info pages`

---

### Task 10: Акции и рассылка

**Files:**
- Create: `src/domain/broadcast.ts`
- Test: `tests/domain/broadcast.test.ts`
- Modify: `src/bot/admin.ts`, `src/bot/guest.ts`

- [ ] **Step 1: Тест получателей**

```ts
import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { recipientsForBroadcast } from "../../src/domain/broadcast.ts";

test("skips opt-out and staff", async () => {
  const store = new MemoryStore();
  const a = await registerGuest(store, {
    telegramId: 1n,
    firstName: "A",
    lastName: "A",
    birthday: new Date("1990-01-01"),
    phone: "79990000001",
  });
  await registerGuest(store, {
    telegramId: 2n,
    firstName: "B",
    lastName: "B",
    birthday: new Date("1990-01-01"),
    phone: "79990000002",
  });
  await store.updateUser(a.id, { broadcastOptOut: true });
  await store.createUser({
    telegramId: 3n,
    role: "master",
    firstName: "M",
    lastName: "M",
    birthday: null,
    phone: null,
    qrToken: "mst1234567",
  });
  const ids = await recipientsForBroadcast(store);
  expect(ids).toEqual([2n]);
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Реализация**

```ts
export async function recipientsForBroadcast(store: Store): Promise<bigint[]> {
  return store.listGuestTelegramIdsForBroadcast();
}
```

MemoryStore: users с `role === "guest"` и `!broadcastOptOut`.

Админ: создать промо (текст, опционально фото file_id, showInFeed, «разослать сейчас»). Рассылка пачками по 25, `try/catch` на каждый `sendMessage`/`sendPhoto`. Гость: лента `listFeedPromos`. Кнопка «Отключить рассылку» → `broadcastOptOut: true`.

- [ ] **Step 4: PASS** + commit `feat: promos and broadcast with opt-out`

Срез 2 закрыт.

---

### Task 11: QR гостя

**Files:**
- Create: `src/bot/qr.ts`
- Modify: `src/bot/guest.ts`

- [ ] **Step 1: Генерация QR в тесте**

```ts
import { expect, test } from "vitest";
import { qrPngBuffer } from "../../src/bot/qr.ts";

test("renders png buffer", async () => {
  const buf = await qrPngBuffer("abc12345");
  expect(buf[0]).toBe(0x89);
  expect(buf[1]).toBe(0x50);
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3:**

```ts
import QRCode from "qrcode";

export async function qrPngBuffer(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, { type: "png", width: 400, margin: 2 });
}
```

Кнопка «Баланс и QR»: фото + подпись `Баланс: N\nКод: TOKEN`.

- [ ] **Step 4: PASS** + commit `feat: guest QR card`

---

### Task 12: Проверка initData и HTTP API кассы

**Files:**
- Create: `src/http/auth.ts`
- Create: `src/http/cashier.ts`
- Create: `src/http/app.ts`
- Test: `tests/http/auth.test.ts`
- Test: `tests/http/cashier.test.ts`

- [ ] **Step 1: Тест HMAC initData** (алгоритм Telegram: secret = HMAC_SHA256(key="WebAppData", botToken), hash = hex HMAC_SHA256(secret, dataCheckString). dataCheckString = пары `key=value` кроме `hash`, sort by key, join `\n`).

Написать `buildInitData(userJson, botToken)` в тесте и `verifyInitData(raw, botToken)`.

Тест кассы через MemoryStore + Hono `app.request`:

```ts
test("master can apply check via api", async () => {
  // создать store, guest, master, подписать initData мастера
  // POST /api/cashier/check { guestToken or phone, checkRubles }
  // expect balance 700
});

test("guest cannot apply check", async () => {
  // initData гостя → 403
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: `auth.ts`** возвращает `{ telegramId, user }`. `cashier.ts` роуты:

- `POST /api/me`
- `POST /api/cashier/lookup` `{ phone?: string, qrToken?: string }`
- `POST /api/cashier/check`
- `POST /api/cashier/redeem`
- `POST /api/cashier/manual`
- `POST /api/cashier/visit`
- `POST /api/cashier/coupon/redeem`

Все требуют роль master|admin. Тело JSON. Ошибки DomainError → 400 `{ code, message }`.

`app.ts`: Hono, `webhookCallback(bot, "hono")` на `POST /tg/:token` (сверить token), CORS не нужен (тот же origin). Static позже.

- [ ] **Step 4: PASS** `npx vitest run tests/http`

- [ ] **Step 5: Commit** `feat: mini app cashier API and initData auth`

---

### Task 13: Mini App кассы

**Files:**
- Create: `miniapp/vite.config.ts`
- Create: `miniapp/index.html`
- Create: `miniapp/src/main.ts`
- Create: `miniapp/src/telegram.ts`
- Create: `miniapp/src/api.ts`
- Create: `miniapp/src/cashier.ts`
- Modify: `src/http/app.ts` — `serveStatic` из `miniapp/dist`
- Modify: `src/bot/staff.ts` — `Keyboard` / `WebApp` button `web_app: { url: PUBLIC_URL + "/app/" }`

- [ ] **Step 1: Vite + экран кассы**

`miniapp/vite.config.ts` `base: "/app/"`, `outDir: "../miniapp/dist"`.

`telegram.ts`: `window.Telegram.WebApp.ready()`, `initData`.

`cashier.ts`: кнопка «Сканировать» — `getUserMedia` + BarcodeDetector если есть, иначе поле ввода кода/телефона. Lookup → карточка → формы чек/списание.

Тема: тёмный фон, акцент дым/уголь (CSS переменные).

- [ ] **Step 2: Подключить static в Hono**

```ts
import { serveStatic } from "@hono/node-server/serve-static";
app.use("/app/*", serveStatic({ root: "./miniapp/dist" }));
```

Для SPA: fallback `index.html` на `/app` и `/app/`.

- [ ] **Step 3: Ручная проверка** на телефоне через BotFather `/setmenubutton` не обязательна — кнопка в staff keyboard.

- [ ] **Step 4: Commit** `feat: staff mini app qr cashier`

Срез 3 без купонов почти готов — купоны в Task 14.

---

### Task 14: Купоны

**Files:**
- Create: `src/domain/coupons.ts`
- Test: `tests/domain/coupons.test.ts`
- Modify: `src/bot/staff.ts`, `src/http/cashier.ts`, `src/bot/guest.ts`

- [ ] **Step 1: Тест**

```ts
test("redeem once", async () => {
  const store = new MemoryStore();
  const staff = await store.createUser({ /* master */ });
  const guest = await registerGuest(/* ... */);
  const coupon = await store.createCoupon({
    userId: guest.id,
    title: "Кальян в подарок",
    weekId: null,
  });
  const first = await redeemCoupon(store, { couponId: coupon.id, actorId: staff.id, now: new Date() });
  expect(first.status).toBe("redeemed");
  await expect(
    redeemCoupon(store, { couponId: coupon.id, actorId: staff.id, now: new Date() }),
  ).rejects.toMatchObject({ code: "coupon_used" });
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3:**

```ts
export async function redeemCoupon(store: Store, input: { couponId: string; actorId: string; now: Date }) {
  return store.withTransaction(async (tx) => {
    const actor = await tx.findUserById(input.actorId);
    if (!actor || (actor.role !== "master" && actor.role !== "admin")) {
      throw new DomainError("forbidden", "Недостаточно прав");
    }
    const coupon = await tx.findCoupon(input.couponId);
    if (!coupon) throw new DomainError("not_found", "Купон не найден");
    if (coupon.status === "redeemed") throw new DomainError("coupon_used", "Купон уже погашен");
    const redeemed = await tx.redeemCoupon(coupon.id, actor.id, input.now);
    await tx.addLedger({
      userId: coupon.userId,
      type: "coupon_redeem",
      amount: 0,
      actorId: actor.id,
      comment: `Купон: ${coupon.title}`,
      checkAmount: null,
    });
    return redeemed;
  });
}
```

Карточка гостя и профиль показывают активные купоны.

- [ ] **Step 4: PASS** + commit `feat: coupon redeem`

---

### Task 15: День рождения

**Files:**
- Create: `src/domain/birthday.ts`
- Test: `tests/domain/birthday.test.ts`
- Create: `src/jobs/birthday-job.ts`

- [ ] **Step 1: Тесты окна и один раз в год**

```ts
test("12 May is in window 9–15 May", () => {
  expect(isBirthdayWeek(new Date("1990-05-12"), new Date("2026-05-12"))).toBe(true);
  expect(isBirthdayWeek(new Date("1990-05-12"), new Date("2026-05-08"))).toBe(false);
});

test("Feb 29 uses Feb 28 in non-leap year", () => {
  expect(isBirthdayWeek(new Date("2000-02-29"), new Date("2026-02-28"))).toBe(true);
});

test("grants once per year", async () => {
  const store = new MemoryStore();
  const g = await registerGuest(/* birthday today-in-window */);
  const n = await grantDueBirthdays(store, new Date("2026-05-12T02:00:00+03:00"));
  expect(n).toBe(1);
  const again = await grantDueBirthdays(store, new Date("2026-05-12T03:00:00+03:00"));
  expect(again).toBe(0);
  expect((await store.findUserById(g.id))!.balance).toBe(1000);
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3:** `isBirthdayWeek`: сравнить month/day, сдвиг ±3 дня через Luxon в МСК. 29 фев → 28 фев если дня нет. `grantDueBirthdays`: `listUsersWithBirthday`, окно, `!hasBirthdayLedgerInYear`, +bonus, ledger `birthday`.

- [ ] **Step 4: PASS** + commit `feat: birthday week bonus once a year`

---

### Task 16: Очки игр только во время визита

**Files:**
- Create: `src/domain/games.ts`
- Test: `tests/domain/games.test.ts`
- Create: `src/http/games.ts`

- [ ] **Step 1: Тесты**

```ts
test("rejects score without visit", async () => {
  await expect(submitScore(store, { userId, slug: "match3", points: 100, now })).rejects.toMatchObject({
    code: "no_visit",
  });
});

test("rejects score above cap", async () => {
  await applyCheck(/* open visit */);
  await expect(submitScore(store, { userId, slug: "match3", points: 50001, now })).rejects.toMatchObject({
    code: "score_cap",
  });
});

test("adds points to current week and does not change balance", async () => {
  const before = user.balance;
  await submitScore(store, { userId, slug: "match3", points: 120, now });
  expect((await store.findUserById(userId))!.balance).toBe(before);
});
```

MemoryStore должен иметь игру match3 в конструкторе (сид для тестов) **или** тест сам делает минимальный insert. Добавить `MemoryStore` конструктор `seedDemoGames()` вызываемый из теста / дефолт в конструкторе: одна игра match3.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: `submitScore`** — гость, визит активен, игра active, `points` integer 1..max, `getOrCreateOpenWeek`, `addScore`. API `POST /api/games/score` и `GET /api/games/leaderboard?slug=match3` (initData гостя).

- [ ] **Step 4: PASS** + commit `feat: visit-gated game scores`

---

### Task 17: Закрытие недели

**Files:**
- Create: `src/domain/weekly.ts`
- Test: `tests/domain/weekly.test.ts`
- Create: `src/jobs/weekly-job.ts`
- Create: `src/jobs/scheduler.ts`

- [ ] **Step 1: Тест**

Три гостя с очками 300/200/50, `winnersCount=2`, place1: 1000 + купон «Кальян», place2: 500. `closeOpenWeeks(store, monday)`. Ожидание: балансы +1000/+500, один купон у первого, `hasWeeklyAward` true. Повторный вызов не меняет балансы.

Ничья: одинаковые points — выше тот, у кого `updatedAt` раньше.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: `closeOpenWeeks`** — все `GameWeek` с `closedAt == null` и `weekStart < currentWeekStart`. Топ N, для каждого места призы, `addWeeklyAward` до начисления (если уже есть — skip этот user). Потом `closeWeek`. Новую неделю не создавать заранее — `getOrCreateOpenWeek` при первом score.

`scheduler.ts`: `CronJob` или `setTimeout` до следующей 00:00 МСК. Пакет `cron` (добавить `npm i cron`). Каждую ночь 02:00 МСК — birthday job. Понедельник 00:00 — weekly job.

Админ бот: редактировать `winnersCount` и `prizeTable` (диалог: N, затем для каждого места бонусы и название купона или «-»).

- [ ] **Step 4: PASS** + commit `feat: weekly leaderboard close and prizes`

---

### Task 18: Mini App гостя — хаб и три в ряд

**Files:**
- Create: `miniapp/src/hub.ts`
- Create: `miniapp/src/match3.ts`
- Create: `miniapp/src/match3.css`
- Modify: `miniapp/src/main.ts` — ветка по роли из `/api/me`
- Modify: `src/bot/guest.ts` — WebApp «Игры»

- [ ] **Step 1: Логика доски в тесте** (чистая)

`src/domain/match3-board.ts` (или `miniapp` не тестировать — вынести ядро в `src/domain/match3.ts`):

```ts
test("clears three in a row and scores", () => {
  const board = [
    [0, 0, 0, 1],
    [2, 3, 1, 1],
    [2, 3, 2, 3],
    [1, 2, 3, 0],
  ];
  const { next, score } = resolveMatches(board);
  expect(score).toBeGreaterThan(0);
  expect(next[0].slice(0, 3).every((c) => c !== 0)).toBe(true); // упали новые / сдвиг
});
```

Правила v1: сетка 8×8, 4 типа фишек (0..3), свап соседних, матч ≥3, падение вниз, добор сверху, каскад, очки = 10 * длина группы * каскад. Потолок партии на сервере 50000.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Реализовать `resolveMatches` + UI canvas/DOM 8×8`. По окончании ходов (кнопка «Забрать очки» или после N ходов = 15) `POST /api/games/score`. Если `/api/me` без визита — заглушка «Игры доступны во время визита в «Друзьях»». Хаб: название игры, место, топ-10, кнопка «Играть». Тема: фон #1a1210, фишки-эмодзи 🔥💧🫧🌿 (уголь/дым/колба/мята).

- [ ] **Step 4: PASS** доменных тестов доски + commit `feat: match-3 game and guest hub`

---

### Task 19: Точка входа, джобы, деплой

**Files:**
- Create: `src/index.ts`
- Create: `Dockerfile`
- Create: `README.md`
- Modify: `src/http/app.ts`

- [ ] **Step 1: `src/index.ts`**

```ts
import { serve } from "@hono/node-server";
import { webhookCallback } from "grammy";
import { loadConfig } from "./config.ts";
import { prisma } from "./db.ts";
import { PrismaStore } from "./store/prisma-store.ts";
import { createBot } from "./bot/create-bot.ts";
import { createHttpApp } from "./http/app.ts";
import { startScheduler } from "./jobs/scheduler.ts";

const config = loadConfig();
const store = new PrismaStore(prisma);
const bot = createBot(config.botToken, store, {
  adminTelegramId: config.adminTelegramId,
  publicUrl: config.publicUrl,
});
const app = createHttpApp({ bot, store, config });
startScheduler(store);

serve({ fetch: app.fetch, port: config.port }, async () => {
  await bot.api.setWebhook(`${config.publicUrl}/tg/${config.botToken}`);
  console.log("listening", config.port);
});
```

`createHttpApp` регистрирует `webhookCallback(bot, "hono")`.

- [ ] **Step 2: Dockerfile** — node 22, `npm ci`, `prisma generate`, `npm run build`, `prisma migrate deploy`, `node dist/index.js`. `README.md`: env, docker compose postgres, как добавить мастера, BotFather Mini App URL `PUBLIC_URL/app/`.

- [ ] **Step 3: Прогнать весь набор**

Run: `npx vitest run`
Expected: все PASS, включая спековые кейсы: регистрация 500, чек 2000→200, списание, ДР, визит/очки, неделя идемпотентна, купон один раз, мастер без рассылки.

- [ ] **Step 4: Commit** `feat: process entrypoint, scheduler, deploy docs`

---

## Coverage vs spec

| Требование | Task |
|---|---|
| Регистрация ФИО ДР телефон, 500 | 4, 7 |
| Чек %, списание, ручное, не минус | 5, 8 |
| Роли, первый админ из env | 6, 7 |
| Касса в боте без Mini App | 8 |
| Меню, контакты, как доехать | 9 |
| Акции + рассылка + opt-out | 10 |
| QR + скан Mini App + телефон | 11–13 |
| Визит 4ч, игры только в визите | 5, 16 |
| Купоны гашение | 14 |
| ДР неделя, раз в год | 15 |
| Недельный топ, призы бонусы+купон, пн 00:00 МСК | 17 |
| Три в ряд, хаб, тема | 18 |
| Webhook + один сервис | 19 |

Нет отдельной браузерной админки и других игр — вне объёма, как в спеке.
