import { PrismaClient } from "@prisma/client";
import type {
  ContentPage,
  Coupon,
  Game,
  GameScore,
  GameWeek,
  Ledger,
  MenuItem,
  Prisma,
  Promo,
  User,
  Visit,
} from "@prisma/client";
import { DEFAULT_SETTINGS, parsePrizeTable } from "../domain/settings.ts";
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
import type { NewUser, Store } from "./types.ts";

type DbClient = PrismaClient | Prisma.TransactionClient;

const SETTING_KEYS = [
  "percent",
  "registrationBonus",
  "birthdayBonus",
  "visitHours",
  "winnersCount",
  "prizeTable",
] as const;

export class PrismaStore implements Store {
  constructor(private readonly prisma: DbClient) {}

  async withTransaction<T>(fn: (store: Store) => Promise<T>): Promise<T> {
    if (!("$transaction" in this.prisma)) {
      return fn(this);
    }
    return this.prisma.$transaction(async (tx) => fn(new PrismaStore(tx)));
  }

  async getSettings(): Promise<Settings> {
    const rows = await this.prisma.setting.findMany();
    if (rows.length === 0) {
      return structuredClone(DEFAULT_SETTINGS);
    }
    const map = new Map(rows.map((row) => [row.key, row.value]));
    const prizeRaw = map.get("prizeTable");
    return {
      percent: Number(map.get("percent") ?? DEFAULT_SETTINGS.percent),
      registrationBonus: Number(map.get("registrationBonus") ?? DEFAULT_SETTINGS.registrationBonus),
      birthdayBonus: Number(map.get("birthdayBonus") ?? DEFAULT_SETTINGS.birthdayBonus),
      visitHours: Number(map.get("visitHours") ?? DEFAULT_SETTINGS.visitHours),
      winnersCount: Number(map.get("winnersCount") ?? DEFAULT_SETTINGS.winnersCount),
      prizeTable: prizeRaw ? parsePrizeTable(prizeRaw) : structuredClone(DEFAULT_SETTINGS.prizeTable),
    };
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.getSettings()), ...patch };
    const values: Record<(typeof SETTING_KEYS)[number], string> = {
      percent: String(next.percent),
      registrationBonus: String(next.registrationBonus),
      birthdayBonus: String(next.birthdayBonus),
      visitHours: String(next.visitHours),
      winnersCount: String(next.winnersCount),
      prizeTable: JSON.stringify(next.prizeTable),
    };
    await Promise.all(
      SETTING_KEYS.map((key) =>
        this.prisma.setting.upsert({
          where: { key },
          create: { key, value: values[key] },
          update: { value: values[key] },
        }),
      ),
    );
    return next;
  }

  async createUser(input: NewUser): Promise<UserRecord> {
    const row = await this.prisma.user.create({
      data: {
        telegramId: input.telegramId,
        role: input.role,
        firstName: input.firstName,
        lastName: input.lastName,
        birthday: input.birthday,
        phone: input.phone,
        qrToken: input.qrToken,
      },
    });
    return toUser(row);
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }

  async findUserByTelegramId(telegramId: bigint): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { telegramId } });
    return row ? toUser(row) : null;
  }

  async findUserByPhone(phone: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { phone } });
    return row ? toUser(row) : null;
  }

  async findUserByQrToken(token: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { qrToken: token } });
    return row ? toUser(row) : null;
  }

  async updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord> {
    const row = await this.prisma.user.update({
      where: { id },
      data: {
        telegramId: patch.telegramId,
        role: patch.role,
        firstName: patch.firstName,
        lastName: patch.lastName,
        birthday: patch.birthday,
        phone: patch.phone,
        balance: patch.balance,
        qrToken: patch.qrToken,
        broadcastOptOut: patch.broadcastOptOut,
      },
    });
    return toUser(row);
  }

  async listGuestTelegramIdsForBroadcast(): Promise<bigint[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: "guest", broadcastOptOut: false },
      select: { telegramId: true },
    });
    return rows.map((row) => row.telegramId);
  }

  async addLedger(input: {
    userId: string;
    type: LedgerType;
    amount: number;
    actorId: string | null;
    comment: string | null;
    checkAmount: number | null;
  }): Promise<LedgerRecord> {
    const row = await this.prisma.ledger.create({
      data: {
        userId: input.userId,
        type: input.type,
        amount: input.amount,
        actorId: input.actorId,
        comment: input.comment,
        checkAmount: input.checkAmount,
      },
    });
    return toLedger(row);
  }

  async listLedger(userId: string): Promise<LedgerRecord[]> {
    const rows = await this.prisma.ledger.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toLedger);
  }

  async hasBirthdayLedgerInYear(userId: string, year: number): Promise<boolean> {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const count = await this.prisma.ledger.count({
      where: {
        userId,
        type: "birthday",
        createdAt: { gte: start, lt: end },
      },
    });
    return count > 0;
  }

  async listUsersWithBirthday(): Promise<UserRecord[]> {
    const rows = await this.prisma.user.findMany({
      where: { birthday: { not: null } },
    });
    return rows.map(toUser);
  }

  async getActiveVisit(userId: string, now: Date): Promise<VisitRecord | null> {
    const row = await this.prisma.visit.findFirst({
      where: { userId, endsAt: { gt: now } },
    });
    return row ? toVisit(row) : null;
  }

  async createVisit(input: {
    userId: string;
    openedBy: string;
    startedAt: Date;
    endsAt: Date;
  }): Promise<VisitRecord> {
    const row = await this.prisma.visit.create({ data: input });
    return toVisit(row);
  }

  async updateVisitEndsAt(id: string, endsAt: Date): Promise<VisitRecord> {
    const row = await this.prisma.visit.update({
      where: { id },
      data: { endsAt },
    });
    return toVisit(row);
  }

  async listMenu(): Promise<MenuItemRecord[]> {
    const rows = await this.prisma.menuItem.findMany({
      where: { active: true },
      orderBy: { sort: "asc" },
    });
    return rows.map(toMenuItem);
  }

  async upsertMenuItem(item: Omit<MenuItemRecord, "id"> & { id?: string }): Promise<MenuItemRecord> {
    if (item.id) {
      const row = await this.prisma.menuItem.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          title: item.title,
          description: item.description,
          priceRubles: item.priceRubles,
          sort: item.sort,
          active: item.active,
        },
        update: {
          title: item.title,
          description: item.description,
          priceRubles: item.priceRubles,
          sort: item.sort,
          active: item.active,
        },
      });
      return toMenuItem(row);
    }
    const row = await this.prisma.menuItem.create({
      data: {
        title: item.title,
        description: item.description,
        priceRubles: item.priceRubles,
        sort: item.sort,
        active: item.active,
      },
    });
    return toMenuItem(row);
  }

  async deleteMenuItem(id: string): Promise<void> {
    await this.prisma.menuItem.deleteMany({ where: { id } });
  }

  async getPage(slug: "contacts" | "directions"): Promise<ContentPageRecord | null> {
    const row = await this.prisma.contentPage.findUnique({ where: { slug } });
    return row ? toPage(row) : null;
  }

  async upsertPage(page: ContentPageRecord): Promise<ContentPageRecord> {
    const row = await this.prisma.contentPage.upsert({
      where: { slug: page.slug },
      create: { slug: page.slug, body: page.body, mapUrl: page.mapUrl },
      update: { body: page.body, mapUrl: page.mapUrl },
    });
    return toPage(row);
  }

  async createPromo(input: { body: string; photos: string[]; showInFeed: boolean }): Promise<PromoRecord> {
    const row = await this.prisma.promo.create({ data: input });
    return toPromo(row);
  }

  async listFeedPromos(): Promise<PromoRecord[]> {
    const rows = await this.prisma.promo.findMany({ where: { showInFeed: true } });
    return rows.map(toPromo);
  }

  async listActiveGames(): Promise<GameRecord[]> {
    const rows = await this.prisma.game.findMany({ where: { active: true } });
    return rows.map(toGame);
  }

  async findGameBySlug(slug: string): Promise<GameRecord | null> {
    const row = await this.prisma.game.findUnique({ where: { slug } });
    return row ? toGame(row) : null;
  }

  async getOrCreateOpenWeek(gameId: string, weekStart: Date): Promise<GameWeekRecord> {
    const row = await this.prisma.gameWeek.upsert({
      where: { gameId_weekStart: { gameId, weekStart } },
      create: { gameId, weekStart },
      update: {},
    });
    return toWeek(row);
  }

  async addScore(weekId: string, userId: string, delta: number, at: Date): Promise<GameScoreRecord> {
    const row = await this.prisma.gameScore.upsert({
      where: { weekId_userId: { weekId, userId } },
      create: { weekId, userId, points: delta, updatedAt: at },
      update: { points: { increment: delta }, updatedAt: at },
    });
    return toScore(row);
  }

  async listWeekScores(weekId: string): Promise<GameScoreRecord[]> {
    const rows = await this.prisma.gameScore.findMany({ where: { weekId } });
    return rows.map(toScore);
  }

  async closeWeek(weekId: string, at: Date): Promise<void> {
    await this.prisma.gameWeek.update({
      where: { id: weekId },
      data: { closedAt: at },
    });
  }

  async hasWeeklyAward(weekId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.weeklyAward.findUnique({
      where: { weekId_userId: { weekId, userId } },
    });
    return row !== null;
  }

  async addWeeklyAward(weekId: string, userId: string, place: number): Promise<void> {
    await this.prisma.weeklyAward.create({
      data: { weekId, userId, place },
    });
  }

  async createCoupon(input: {
    userId: string;
    title: string;
    weekId: string | null;
  }): Promise<CouponRecord> {
    const row = await this.prisma.coupon.create({ data: input });
    return toCoupon(row);
  }

  async listActiveCoupons(userId: string): Promise<CouponRecord[]> {
    const rows = await this.prisma.coupon.findMany({
      where: { userId, status: "active" },
    });
    return rows.map(toCoupon);
  }

  async findCoupon(id: string): Promise<CouponRecord | null> {
    const row = await this.prisma.coupon.findUnique({ where: { id } });
    return row ? toCoupon(row) : null;
  }

  async redeemCoupon(id: string, by: string, at: Date): Promise<CouponRecord> {
    const row = await this.prisma.coupon.update({
      where: { id },
      data: { status: "redeemed", redeemedBy: by, redeemedAt: at },
    });
    return toCoupon(row);
  }
}

function toRole(value: string): Role {
  if (value === "guest" || value === "master" || value === "admin") {
    return value;
  }
  throw new Error(`unknown role: ${value}`);
}

function toLedgerType(value: string): LedgerType {
  if (
    value === "check" ||
    value === "manual" ||
    value === "registration" ||
    value === "birthday" ||
    value === "weekly_prize" ||
    value === "redeem" ||
    value === "coupon_redeem"
  ) {
    return value;
  }
  throw new Error(`unknown ledger type: ${value}`);
}

function toUser(row: User): UserRecord {
  return {
    id: row.id,
    telegramId: row.telegramId,
    role: toRole(row.role),
    firstName: row.firstName,
    lastName: row.lastName,
    birthday: row.birthday,
    phone: row.phone,
    balance: row.balance,
    qrToken: row.qrToken,
    broadcastOptOut: row.broadcastOptOut,
    createdAt: row.createdAt,
  };
}

function toLedger(row: Ledger): LedgerRecord {
  return {
    id: row.id,
    userId: row.userId,
    type: toLedgerType(row.type),
    amount: row.amount,
    actorId: row.actorId,
    comment: row.comment,
    checkAmount: row.checkAmount,
    createdAt: row.createdAt,
  };
}

function toVisit(row: Visit): VisitRecord {
  return {
    id: row.id,
    userId: row.userId,
    openedBy: row.openedBy,
    startedAt: row.startedAt,
    endsAt: row.endsAt,
  };
}

function toMenuItem(row: MenuItem): MenuItemRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priceRubles: row.priceRubles,
    sort: row.sort,
    active: row.active,
  };
}

function toPage(row: ContentPage): ContentPageRecord {
  if (row.slug !== "contacts" && row.slug !== "directions") {
    throw new Error(`unknown page slug: ${row.slug}`);
  }
  return { slug: row.slug, body: row.body, mapUrl: row.mapUrl };
}

function toPromo(row: Promo): PromoRecord {
  return {
    id: row.id,
    body: row.body,
    photos: row.photos,
    showInFeed: row.showInFeed,
    createdAt: row.createdAt,
  };
}

function toGame(row: Game): GameRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    active: row.active,
    maxScorePerSession: row.maxScorePerSession,
  };
}

function toWeek(row: GameWeek): GameWeekRecord {
  return {
    id: row.id,
    gameId: row.gameId,
    weekStart: row.weekStart,
    closedAt: row.closedAt,
  };
}

function toScore(row: GameScore): GameScoreRecord {
  return {
    weekId: row.weekId,
    userId: row.userId,
    points: row.points,
    updatedAt: row.updatedAt,
  };
}

function toCoupon(row: Coupon): CouponRecord {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    weekId: row.weekId,
    status: row.status === "redeemed" ? "redeemed" : "active",
    redeemedBy: row.redeemedBy,
    redeemedAt: row.redeemedAt,
  };
}
