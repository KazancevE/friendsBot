import { PrismaClient } from "@prisma/client";
import type {
  BonusLot,
  BookingRequest,
  CheckInLog,
  ContentPage,
  Coupon,
  Game,
  GameScore,
  GameWeek,
  Ledger,
  MenuItem,
  Prisma,
  Promo,
  StaffActionLog,
  User,
  VenueCode,
  Visit,
} from "@prisma/client";
import { DomainError } from "../domain/errors.ts";
import { DEFAULT_SETTINGS, parsePrizeTable } from "../domain/settings.ts";
import type {
  ActiveVisitRow,
  AggregatedScoreRecord,
  BonusLotRecord,
  BookingRequestRecord,
  CheckInLogRecord,
  CheckInMethod,
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
  StaffActionKind,
  StaffActionLogRecord,
  UserRecord,
  VenueCodeRecord,
  VisitRecord,
} from "../domain/types.ts";
import { moscowYearStart, MOSCOW } from "../domain/week.ts";
import { DateTime } from "luxon";
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
  "checkInNotifyEnabled",
  "checkInNotifyTelegramIds",
] as const;

const parseTelegramIds = (raw: string | undefined): bigint[] => {
  if (raw === undefined || raw.length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((value) => BigInt(String(value)));
  } catch {
    return [];
  }
};

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
      checkInNotifyEnabled:
        (map.get("checkInNotifyEnabled") ?? String(DEFAULT_SETTINGS.checkInNotifyEnabled)) ===
        "true",
      checkInNotifyTelegramIds: parseTelegramIds(map.get("checkInNotifyTelegramIds")),
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
      checkInNotifyEnabled: String(next.checkInNotifyEnabled),
      checkInNotifyTelegramIds: JSON.stringify(
        next.checkInNotifyTelegramIds.map((id) => id.toString()),
      ),
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
        staffNote: patch.staffNote,
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

  async listStaffTelegramIds(): Promise<bigint[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: ["master", "admin"] } },
      select: { telegramId: true },
    });
    return rows.map((row) => row.telegramId);
  }

  async countRegistrationsBetween(from: Date, to: Date): Promise<number> {
    return this.prisma.user.count({
      where: { role: "guest", createdAt: { gte: from, lte: to } },
    });
  }

  async searchGuestsByName(query: string, limit: number): Promise<UserRecord[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        role: "guest",
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
        ],
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toUser);
  }

  async createStaffActionLog(input: {
    actorId: string;
    guestId: string | null;
    action: StaffActionKind;
    payload: Record<string, unknown>;
  }): Promise<StaffActionLogRecord> {
    const row = await this.prisma.staffActionLog.create({
      data: {
        actorId: input.actorId,
        guestId: input.guestId,
        action: input.action,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
    return toStaffActionLog(row);
  }

  async listStaffActionLog(input: {
    from: Date;
    to: Date;
    actorId?: string;
    limit: number;
    offset: number;
  }): Promise<StaffActionLogRecord[]> {
    const rows = await this.prisma.staffActionLog.findMany({
      where: {
        createdAt: { gte: input.from, lte: input.to },
        actorId: input.actorId,
      },
      orderBy: { createdAt: "desc" },
      take: input.limit,
      skip: input.offset,
    });
    return rows.map(toStaffActionLog);
  }

  async countStaffActionsBetween(from: Date, to: Date): Promise<number> {
    return this.prisma.staffActionLog.count({
      where: { createdAt: { gte: from, lte: to } },
    });
  }

  async countVisitsForUser(userId: string): Promise<number> {
    return this.prisma.visit.count({ where: { userId } });
  }

  async lastVisitStartedAt(userId: string): Promise<Date | null> {
    const row = await this.prisma.visit.findFirst({
      where: { userId },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    return row?.startedAt ?? null;
  }

  async hasCheckInToday(userId: string, now: Date): Promise<boolean> {
    const start = DateTime.fromJSDate(now, { zone: MOSCOW }).startOf("day").toJSDate();
    const end = DateTime.fromJSDate(now, { zone: MOSCOW }).endOf("day").toJSDate();
    const count = await this.prisma.checkInLog.count({
      where: { userId, createdAt: { gte: start, lte: end } },
    });
    return count > 0;
  }

  async countVisitsBetween(from: Date, to: Date): Promise<number> {
    return this.prisma.visit.count({ where: { startedAt: { gte: from, lte: to } } });
  }

  async countUniqueGuestsWithVisitBetween(from: Date, to: Date): Promise<number> {
    const rows = await this.prisma.visit.findMany({
      where: { startedAt: { gte: from, lte: to } },
      distinct: ["userId"],
      select: { userId: true },
    });
    return rows.length;
  }

  async countCheckInsBetween(from: Date, to: Date): Promise<number> {
    return this.prisma.checkInLog.count({ where: { createdAt: { gte: from, lte: to } } });
  }

  async listVisitsBetween(from: Date, to: Date): Promise<VisitRecord[]> {
    const rows = await this.prisma.visit.findMany({
      where: { startedAt: { gte: from, lte: to } },
      orderBy: { startedAt: "asc" },
    });
    return rows.map(toVisit);
  }

  async listCheckInsBetween(from: Date, to: Date): Promise<CheckInLogRecord[]> {
    const rows = await this.prisma.checkInLog.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toCheckInLog);
  }

  async listLedgerBetween(from: Date, to: Date): Promise<LedgerRecord[]> {
    const rows = await this.prisma.ledger.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toLedger);
  }

  async listCouponsBetween(from: Date, to: Date): Promise<CouponRecord[]> {
    const rows = await this.prisma.coupon.findMany({
      where: { expiresAt: { gte: from, lte: to } },
    });
    return rows.map(toCoupon);
  }

  async sumActiveBonusLotRemaining(now: Date): Promise<number> {
    const result = await this.prisma.bonusLot.aggregate({
      where: { remaining: { gt: 0 }, expiresAt: { gt: now } },
      _sum: { remaining: true },
    });
    return result._sum.remaining ?? 0;
  }

  async createBookingRequest(input: {
    userId: string;
    requestedFor: Date;
    partySize: number;
    comment: string | null;
  }): Promise<BookingRequestRecord> {
    const row = await this.prisma.bookingRequest.create({ data: input });
    return toBooking(row);
  }

  async findBookingById(id: string): Promise<BookingRequestRecord | null> {
    const row = await this.prisma.bookingRequest.findUnique({ where: { id } });
    return row ? toBooking(row) : null;
  }

  async findPendingBookingForUser(userId: string): Promise<BookingRequestRecord | null> {
    const row = await this.prisma.bookingRequest.findFirst({
      where: { userId, status: "pending" },
    });
    return row ? toBooking(row) : null;
  }

  async updateBooking(
    id: string,
    patch: Partial<
      Pick<BookingRequestRecord, "status" | "handledBy" | "handledAt" | "reminderSent">
    >,
  ): Promise<BookingRequestRecord> {
    const row = await this.prisma.bookingRequest.update({ where: { id }, data: patch });
    return toBooking(row);
  }

  async listBookingsNeedingReminder(now: Date): Promise<BookingRequestRecord[]> {
    const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const rows = await this.prisma.bookingRequest.findMany({
      where: {
        reminderSent: false,
        status: "confirmed",
        requestedFor: { gt: now, lte: inTwoHours },
      },
    });
    return rows.map(toBooking);
  }

  async listPendingBookings(): Promise<BookingRequestRecord[]> {
    const rows = await this.prisma.bookingRequest.findMany({
      where: { status: "pending" },
      orderBy: { requestedFor: "asc" },
    });
    return rows.map(toBooking);
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

  async listActiveVisits(now: Date): Promise<ActiveVisitRow[]> {
    const rows = await this.prisma.visit.findMany({
      where: { endsAt: { gt: now } },
      include: {
        user: true,
        checkIns: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { startedAt: "desc" },
    });
    return rows.map((row) => ({
      visitId: row.id,
      userId: row.userId,
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      startedAt: row.startedAt,
      endsAt: row.endsAt,
      checkInMethod: row.checkIns[0] ? toCheckInMethod(row.checkIns[0].method) : null,
    }));
  }

  async revokeActiveVenueCodes(now: Date): Promise<void> {
    await this.prisma.venueCode.updateMany({
      where: {
        revokedAt: null,
        validFrom: { lte: now },
        validUntil: { gt: now },
      },
      data: { revokedAt: now },
    });
  }

  async createVenueCode(input: {
    pin: string;
    token: string;
    validFrom: Date;
    validUntil: Date;
    createdBy: string | null;
    createdAt: Date;
  }): Promise<VenueCodeRecord> {
    const row = await this.prisma.venueCode.create({
      data: {
        pin: input.pin,
        token: input.token,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
      },
    });
    return toVenueCode(row);
  }

  async findActiveVenueCode(now: Date): Promise<VenueCodeRecord | null> {
    const row = await this.prisma.venueCode.findFirst({
      where: {
        revokedAt: null,
        validFrom: { lte: now },
        validUntil: { gt: now },
      },
      orderBy: { validFrom: "desc" },
    });
    return row ? toVenueCode(row) : null;
  }

  async findVenueCodeByToken(token: string): Promise<VenueCodeRecord | null> {
    const row = await this.prisma.venueCode.findUnique({ where: { token } });
    return row ? toVenueCode(row) : null;
  }

  async createCheckInLog(input: {
    userId: string;
    venueCodeId: string;
    visitId: string;
    method: CheckInMethod;
    createdAt: Date;
  }): Promise<CheckInLogRecord> {
    const row = await this.prisma.checkInLog.create({ data: input });
    return toCheckInLog(row);
  }

  async findLatestCheckInForVisit(visitId: string): Promise<CheckInLogRecord | null> {
    const row = await this.prisma.checkInLog.findFirst({
      where: { visitId },
      orderBy: { createdAt: "desc" },
    });
    return row ? toCheckInLog(row) : null;
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

  async listAggregatedWeekScores(weekStart: Date): Promise<AggregatedScoreRecord[]> {
    const rows = await this.prisma.gameScore.findMany({
      where: { week: { weekStart } },
    });
    const byUser = new Map<string, { points: number; updatedAt: Date }>();
    for (const row of rows) {
      const current = byUser.get(row.userId);
      if (current === undefined) {
        byUser.set(row.userId, { points: row.points, updatedAt: row.updatedAt });
        continue;
      }
      byUser.set(row.userId, {
        points: current.points + row.points,
        updatedAt: row.updatedAt > current.updatedAt ? row.updatedAt : current.updatedAt,
      });
    }
    return [...byUser.entries()].map(([userId, aggregated]) => ({
      userId,
      points: aggregated.points,
      updatedAt: aggregated.updatedAt,
    }));
  }

  async closeWeek(weekId: string, at: Date): Promise<void> {
    await this.prisma.gameWeek.update({
      where: { id: weekId },
      data: { closedAt: at },
    });
  }

  async hasWeeklyAward(weekStart: Date, userId: string): Promise<boolean> {
    const row = await this.prisma.weeklyAward.findUnique({
      where: { weekStart_userId: { weekStart, userId } },
    });
    return row !== null;
  }

  async addWeeklyAward(weekStart: Date, userId: string, place: number): Promise<void> {
    await this.prisma.weeklyAward.create({
      data: { weekStart, userId, place },
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
    staffNote: row.staffNote,
    createdAt: row.createdAt,
  };
}

function toStaffActionKind(value: string): StaffActionKind {
  if (
    value === "check" ||
    value === "redeem" ||
    value === "manual_adjust" ||
    value === "visit_open" ||
    value === "visit_extend" ||
    value === "coupon_redeem" ||
    value === "guest_search"
  ) {
    return value;
  }
  throw new Error(`unknown staff action: ${value}`);
}

function toStaffActionLog(row: StaffActionLog): StaffActionLogRecord {
  return {
    id: row.id,
    actorId: row.actorId,
    guestId: row.guestId,
    action: toStaffActionKind(row.action),
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: row.createdAt,
  };
}

function toBooking(row: BookingRequest): BookingRequestRecord {
  return {
    id: row.id,
    userId: row.userId,
    requestedFor: row.requestedFor,
    partySize: row.partySize,
    comment: row.comment,
    status: row.status,
    handledBy: row.handledBy,
    handledAt: row.handledAt,
    reminderSent: row.reminderSent,
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

function toCheckInMethod(value: string): CheckInMethod {
  if (value === "qr" || value === "pin") {
    return value;
  }
  throw new Error(`unknown check-in method: ${value}`);
}

function toVenueCode(row: VenueCode): VenueCodeRecord {
  return {
    id: row.id,
    pin: row.pin,
    token: row.token,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    revokedAt: row.revokedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function toCheckInLog(row: CheckInLog): CheckInLogRecord {
  return {
    id: row.id,
    userId: row.userId,
    venueCodeId: row.venueCodeId,
    visitId: row.visitId,
    method: toCheckInMethod(row.method),
    createdAt: row.createdAt,
  };
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
