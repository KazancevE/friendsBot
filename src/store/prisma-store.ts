import { PrismaClient } from "@prisma/client";
import type {
  BonusLot,
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
import { DomainError } from "../domain/errors.ts";
import { DEFAULT_SETTINGS, parsePrizeTable } from "../domain/settings.ts";
import type {
  BonusLotRecord,
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
import { moscowYearStart } from "../domain/week.ts";
import type { NewUser, Store } from "./types.ts";

type DbClient = PrismaClient | Prisma.TransactionClient;

const SETTING_KEYS = [
  "percent",
  "registrationBonus",
  "birthdayBonus",
  "visitHours",
  "winnersCount",
  "prizeTable",
  "checkBonusTtlDays",
  "giftBonusTtlDays",
  "couponClaimDaysDefault",
  "couponClaimDays",
  "expireNotifyMinBonuses",
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
      checkBonusTtlDays: Number(map.get("checkBonusTtlDays") ?? DEFAULT_SETTINGS.checkBonusTtlDays),
      giftBonusTtlDays: Number(map.get("giftBonusTtlDays") ?? DEFAULT_SETTINGS.giftBonusTtlDays),
      couponClaimDaysDefault: Number(
        map.get("couponClaimDaysDefault") ?? DEFAULT_SETTINGS.couponClaimDaysDefault,
      ),
      couponClaimDays: Number(map.get("couponClaimDays") ?? DEFAULT_SETTINGS.couponClaimDays),
      expireNotifyMinBonuses: Number(
        map.get("expireNotifyMinBonuses") ?? DEFAULT_SETTINGS.expireNotifyMinBonuses,
      ),
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
      checkBonusTtlDays: String(next.checkBonusTtlDays),
      giftBonusTtlDays: String(next.giftBonusTtlDays),
      couponClaimDaysDefault: String(next.couponClaimDaysDefault),
      couponClaimDays: String(next.couponClaimDays),
      expireNotifyMinBonuses: String(next.expireNotifyMinBonuses),
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
    const start = moscowYearStart(year);
    const end = moscowYearStart(year + 1);
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

  async createBonusLot(input: {
    userId: string;
    ledgerId: string | null;
    category: "gift" | "check";
    initial: number;
    remaining: number;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<BonusLotRecord> {
    const row = await this.prisma.bonusLot.create({
      data: {
        userId: input.userId,
        ledgerId: input.ledgerId,
        category: input.category,
        initial: input.initial,
        remaining: input.remaining,
        expiresAt: input.expiresAt,
        createdAt: input.createdAt,
      },
    });
    return toBonusLot(row);
  }

  async listBonusLots(userId: string): Promise<BonusLotRecord[]> {
    const rows = await this.prisma.bonusLot.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toBonusLot);
  }

  async listBonusLotsWithRemaining(): Promise<BonusLotRecord[]> {
    const rows = await this.prisma.bonusLot.findMany({
      where: { remaining: { gt: 0 } },
    });
    return rows.map(toBonusLot);
  }

  async updateBonusLot(
    id: string,
    patch: Partial<Pick<BonusLotRecord, "remaining" | "warned7d" | "warned3d" | "warned1d" | "expiresAt">>,
  ): Promise<BonusLotRecord> {
    const row = await this.prisma.bonusLot.update({
      where: { id },
      data: patch,
    });
    return toBonusLot(row);
  }

  async findBonusLotByLedgerId(ledgerId: string): Promise<BonusLotRecord | null> {
    const row = await this.prisma.bonusLot.findUnique({ where: { ledgerId } });
    return row ? toBonusLot(row) : null;
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
          imageFileId: item.imageFileId,
          sort: item.sort,
          active: item.active,
        },
        update: {
          title: item.title,
          description: item.description,
          priceRubles: item.priceRubles,
          imageFileId: item.imageFileId,
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
        imageFileId: item.imageFileId,
        sort: item.sort,
        active: item.active,
      },
    });
    return toMenuItem(row);
  }

  async deleteMenuItem(id: string): Promise<void> {
    await this.prisma.menuItem.deleteMany({ where: { id } });
  }

  async getPage(slug: "contacts" | "directions" | "game_rules"): Promise<ContentPageRecord | null> {
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

  async listOpenWeeks(): Promise<GameWeekRecord[]> {
    const rows = await this.prisma.gameWeek.findMany({ where: { closedAt: null } });
    return rows.map(toWeek);
  }

  async getOrCreateOpenWeek(gameId: string, weekStart: Date): Promise<GameWeekRecord> {
    const existing = await this.prisma.gameWeek.findUnique({
      where: { gameId_weekStart: { gameId, weekStart } },
    });
    if (existing !== null && existing.closedAt === null) {
      return toWeek(existing);
    }
    if (existing !== null) {
      throw new DomainError("week_closed", "Неделя уже закрыта");
    }
    const created = await this.prisma.gameWeek.create({
      data: { gameId, weekStart },
    });
    return toWeek(created);
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
    expiresAt: Date;
  }): Promise<CouponRecord> {
    const row = await this.prisma.coupon.create({ data: input });
    return toCoupon(row);
  }

  async listActiveCoupons(userId: string): Promise<CouponRecord[]> {
    const rows = await this.prisma.coupon.findMany({
      where: { userId, status: "active", expiresAt: { gt: new Date() } },
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

  async expireCoupons(now: Date): Promise<number> {
    const result = await this.prisma.coupon.updateMany({
      where: { status: "active", expiresAt: { lte: now } },
      data: { status: "expired" },
    });
    return result.count;
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
    value === "coupon_redeem" ||
    value === "expire"
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
    imageFileId: row.imageFileId,
    sort: row.sort,
    active: row.active,
  };
}

function toPage(row: ContentPage): ContentPageRecord {
  if (row.slug !== "contacts" && row.slug !== "directions" && row.slug !== "game_rules") {
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

function toBonusLot(row: BonusLot): BonusLotRecord {
  return {
    id: row.id,
    userId: row.userId,
    ledgerId: row.ledgerId,
    category: row.category,
    initial: row.initial,
    remaining: row.remaining,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    warned7d: row.warned7d,
    warned3d: row.warned3d,
    warned1d: row.warned1d,
  };
}

function toCouponStatus(value: string): CouponRecord["status"] {
  if (value === "active" || value === "redeemed" || value === "expired") {
    return value;
  }
  throw new Error(`unknown coupon status: ${value}`);
}

function toCoupon(row: Coupon): CouponRecord {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    weekId: row.weekId,
    status: toCouponStatus(row.status),
    expiresAt: row.expiresAt,
    redeemedBy: row.redeemedBy,
    redeemedAt: row.redeemedAt,
  };
}
