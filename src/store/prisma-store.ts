import { PrismaClient } from "@prisma/client";
import type {
  BonusLot,
  BookingRequest,
  CheckInLog,
  ContentPage,
  Coupon,
  FloorPlan,
  FloorElement,
  Game,
  GameSessionLog,
  GameScore,
  GameWeek,
  Ledger,
  MenuItem,
  Prisma,
  Promo,
  PromoRule,
  Quiz,
  QuizAnswer,
  QuizQuestion,
  QuizSession,
  ReferralActivation,
  StaffActionLog,
  User,
  VenueCode,
  VenueTable,
  Visit,
} from "@prisma/client";
import { DomainError } from "../domain/errors.ts";
import { DEFAULT_SETTINGS, parsePrizeTable } from "../domain/settings.ts";
import type {
  ActiveVisitRow,
  AggregatedScoreRecord,
  BonusLotRecord,
  BookingRequestRecord,
  BroadcastSegmentId,
  CheckInLogRecord,
  CheckInMethod,
  ContentPageRecord,
  CouponRecord,
  FloorElementRecord,
  FloorPlanRecord,
  FloorPlanView,
  GameRecord,
  GameScoreRecord,
  GameSessionLogRecord,
  GameWeekRecord,
  GuestListRow,
  LedgerRecord,
  LedgerType,
  MenuItemRecord,
  PromoRecord,
  PromoRuleKind,
  PromoRuleRecord,
  QuizAnswerRecord,
  QuizQuestionRecord,
  QuizRecord,
  QuizSessionRecord,
  QuizSessionStatus,
  ReferralActivationRecord,
  ReferralStats,
  Role,
  Settings,
  StaffActionKind,
  StaffActionLogRecord,
  UserRecord,
  VenueCodeRecord,
  VenueTableRecord,
  VisitRecord,
} from "../domain/types.ts";
import { moscowYearStart, MOSCOW } from "../domain/week.ts";
import { DateTime } from "luxon";
import type { BroadcastGuestCandidate, NewUser, Store } from "./types.ts";

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
  "referralBonusReferrer",
  "referralBonusReferee",
  "referralActivationDays",
  "referralEnabled",
  "birthdayNotifyDaysBefore",
  "birthdayCouponTitle",
  "birthdayCouponClaimDays",
  "maxSessionsPerHour",
  "bookingHoursStart",
  "bookingHoursEnd",
  "bookingSlotMinutes",
  "bookingClosedWeekdays",
  "bookingDurationMinutes",
  "venueTimezone",
] as const;

const parseWeekdayList = (raw: string | undefined): number[] => {
  if (raw === undefined || raw.length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((value) => Number(value)).filter((value) => Number.isInteger(value));
  } catch {
    return [];
  }
};

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
      referralBonusReferrer: Number(
        map.get("referralBonusReferrer") ?? DEFAULT_SETTINGS.referralBonusReferrer,
      ),
      referralBonusReferee: Number(
        map.get("referralBonusReferee") ?? DEFAULT_SETTINGS.referralBonusReferee,
      ),
      referralActivationDays: Number(
        map.get("referralActivationDays") ?? DEFAULT_SETTINGS.referralActivationDays,
      ),
      referralEnabled:
        (map.get("referralEnabled") ?? String(DEFAULT_SETTINGS.referralEnabled)) === "true",
      birthdayNotifyDaysBefore: Number(
        map.get("birthdayNotifyDaysBefore") ?? DEFAULT_SETTINGS.birthdayNotifyDaysBefore,
      ),
      birthdayCouponTitle: (() => {
        const raw = map.get("birthdayCouponTitle");
        if (raw === undefined || raw.length === 0) {
          return null;
        }
        return raw;
      })(),
      birthdayCouponClaimDays: Number(
        map.get("birthdayCouponClaimDays") ?? DEFAULT_SETTINGS.birthdayCouponClaimDays,
      ),
      maxSessionsPerHour: Number(
        map.get("maxSessionsPerHour") ?? DEFAULT_SETTINGS.maxSessionsPerHour,
      ),
      bookingHoursStart: Number(map.get("bookingHoursStart") ?? DEFAULT_SETTINGS.bookingHoursStart),
      bookingHoursEnd: Number(map.get("bookingHoursEnd") ?? DEFAULT_SETTINGS.bookingHoursEnd),
      bookingSlotMinutes: Number(
        map.get("bookingSlotMinutes") ?? DEFAULT_SETTINGS.bookingSlotMinutes,
      ),
      bookingClosedWeekdays: parseWeekdayList(map.get("bookingClosedWeekdays")),
      bookingDurationMinutes: Number(
        map.get("bookingDurationMinutes") ?? DEFAULT_SETTINGS.bookingDurationMinutes,
      ),
      venueTimezone: map.get("venueTimezone") ?? DEFAULT_SETTINGS.venueTimezone,
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
      referralBonusReferrer: String(next.referralBonusReferrer),
      referralBonusReferee: String(next.referralBonusReferee),
      referralActivationDays: String(next.referralActivationDays),
      referralEnabled: String(next.referralEnabled),
      birthdayNotifyDaysBefore: String(next.birthdayNotifyDaysBefore),
      birthdayCouponTitle: next.birthdayCouponTitle ?? "",
      birthdayCouponClaimDays: String(next.birthdayCouponClaimDays),
      maxSessionsPerHour: String(next.maxSessionsPerHour),
      bookingHoursStart: String(next.bookingHoursStart),
      bookingHoursEnd: String(next.bookingHoursEnd),
      bookingSlotMinutes: String(next.bookingSlotMinutes),
      bookingClosedWeekdays: JSON.stringify(next.bookingClosedWeekdays),
      bookingDurationMinutes: String(next.bookingDurationMinutes),
      venueTimezone: next.venueTimezone,
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

  async getSettingValue(key: string): Promise<string | null> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async upsertSettingValue(key: string, value: string): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
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

  async findUserByReferralCode(code: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { referralCode: code.toUpperCase() } });
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
        referralCode: patch.referralCode,
        referredByUserId: patch.referredByUserId,
        telegramUsername: patch.telegramUsername,
        birthdayWarnedYear: patch.birthdayWarnedYear,
        birthdayGreetedYear: patch.birthdayGreetedYear,
      },
    });
    return toUser(row);
  }

  async listGuestTelegramIdsForBroadcast(): Promise<bigint[]> {
    const rows = await this.listBroadcastGuestCandidates();
    return rows.filter((guest) => !guest.broadcastOptOut).map((guest) => guest.telegramId);
  }

  async listBroadcastGuestCandidates(): Promise<BroadcastGuestCandidate[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: "guest" },
      select: {
        id: true,
        telegramId: true,
        balance: true,
        birthday: true,
        broadcastOptOut: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      telegramId: row.telegramId,
      balance: row.balance,
      birthday: row.birthday,
      broadcastOptOut: row.broadcastOptOut,
    }));
  }

  async listGuestIdsActiveSince(since: Date): Promise<string[]> {
    const [visitRows, checkInRows] = await Promise.all([
      this.prisma.visit.findMany({
        where: { startedAt: { gte: since } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      this.prisma.checkInLog.findMany({
        where: { createdAt: { gte: since } },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);
    return [...new Set([...visitRows.map((row) => row.userId), ...checkInRows.map((row) => row.userId)])];
  }

  async listGuestIdsWithActiveCoupons(now: Date): Promise<string[]> {
    const rows = await this.prisma.coupon.findMany({
      where: { status: "active", expiresAt: { gt: now } },
      select: { userId: true },
      distinct: ["userId"],
    });
    return rows.map((row) => row.userId);
  }

  async listReferrerGuestIds(): Promise<string[]> {
    const rows = await this.prisma.referralActivation.findMany({
      select: { referrerId: true },
      distinct: ["referrerId"],
    });
    return rows.map((row) => row.referrerId);
  }

  async listWeeklyAwardUserIds(weekStart: Date, maxPlace: number): Promise<string[]> {
    const rows = await this.prisma.weeklyAward.findMany({
      where: { weekStart, place: { lte: maxPlace } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  async listStaffTelegramIds(): Promise<bigint[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: ["master", "admin"] } },
      select: { telegramId: true },
    });
    return rows.map((row) => row.telegramId);
  }

  async listStaffMembers() {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: ["master", "admin"] } },
      orderBy: [{ role: "asc" }, { firstName: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      telegramId: row.telegramId,
      role: row.role as import("../domain/types.ts").Role,
      firstName: row.firstName,
      lastName: row.lastName,
    }));
  }

  async listStaffWeeklySchedule(userId: string) {
    const rows = await this.prisma.staffWeeklySchedule.findMany({
      where: { userId },
      orderBy: { weekday: "asc" },
    });
    return rows.map(toStaffWeeklySchedule);
  }

  async listAllStaffWeeklySchedules() {
    const rows = await this.prisma.staffWeeklySchedule.findMany({
      orderBy: [{ userId: "asc" }, { weekday: "asc" }],
    });
    return rows.map(toStaffWeeklySchedule);
  }

  async replaceStaffWeeklySchedule(
    userId: string,
    slots: ReadonlyArray<{ weekday: number; startHour: number; endHour: number }>,
  ) {
    await this.prisma.staffWeeklySchedule.deleteMany({ where: { userId } });
    if (slots.length === 0) {
      return [];
    }
    await this.prisma.staffWeeklySchedule.createMany({
      data: slots.map((slot) => ({
        userId,
        weekday: slot.weekday,
        startHour: slot.startHour,
        endHour: slot.endHour,
      })),
    });
    return this.listStaffWeeklySchedule(userId);
  }

  async listStaffShiftsBetween(from: Date, to: Date) {
    const rows = await this.prisma.staffShift.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { startHour: "asc" }],
    });
    return rows.map(toStaffShift);
  }

  async listStaffShiftsForDate(date: Date) {
    const rows = await this.prisma.staffShift.findMany({
      where: { date },
      orderBy: { startHour: "asc" },
    });
    return rows.map(toStaffShift);
  }

  async upsertStaffShift(input: {
    userId: string;
    date: Date;
    startHour: number;
    endHour: number;
  }) {
    const row = await this.prisma.staffShift.upsert({
      where: { userId_date: { userId: input.userId, date: input.date } },
      create: {
        userId: input.userId,
        date: input.date,
        startHour: input.startHour,
        endHour: input.endHour,
      },
      update: {
        startHour: input.startHour,
        endHour: input.endHour,
      },
    });
    return toStaffShift(row);
  }

  async deleteStaffShift(id: string) {
    await this.prisma.staffShift.delete({ where: { id } });
  }

  async replaceStaffShiftsForDate(
    date: Date,
    shifts: ReadonlyArray<{ userId: string; startHour: number; endHour: number }>,
  ) {
    await this.prisma.staffShift.deleteMany({ where: { date } });
    if (shifts.length === 0) {
      return [];
    }
    await this.prisma.staffShift.createMany({
      data: shifts.map((shift) => ({
        userId: shift.userId,
        date,
        startHour: shift.startHour,
        endHour: shift.endHour,
      })),
    });
    return this.listStaffShiftsForDate(date);
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

  async searchGuestsByUsername(username: string, limit: number): Promise<UserRecord[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        role: "guest",
        telegramUsername: { contains: username, mode: "insensitive" },
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
    return toStaffActionLog(row, null);
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
      include: { guest: true },
      orderBy: { createdAt: "desc" },
      take: input.limit,
      skip: input.offset,
    });
    return rows.map((row) => toStaffActionLog(row, row.guest));
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

  async listVisitStartsForUser(userId: string): Promise<Array<{ startedAt: Date }>> {
    const rows = await this.prisma.visit.findMany({
      where: { userId },
      select: { startedAt: true },
      orderBy: { startedAt: "asc" },
    });
    return rows;
  }

  async listGuestDirectoryRows(now: Date): Promise<GuestListRow[]> {
    const guests = await this.prisma.user.findMany({
      where: { role: "guest" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        telegramUsername: true,
        phone: true,
        balance: true,
        broadcastOptOut: true,
        createdAt: true,
        visits: {
          select: { startedAt: true, endsAt: true },
        },
      },
    });
    return guests.map((guest) => {
      const visits = guest.visits;
      const lastVisitAt =
        visits.length === 0
          ? null
          : visits.reduce(
              (latest, visit) => (visit.startedAt > latest ? visit.startedAt : latest),
              visits[0]!.startedAt,
            );
      const visitActive = visits.some((visit) => visit.endsAt > now);
      return {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        telegramUsername: guest.telegramUsername,
        phone: guest.phone,
        balance: guest.balance,
        totalVisits: visits.length,
        lastVisitAt,
        visitActive,
        broadcastOptOut: guest.broadcastOptOut,
        createdAt: guest.createdAt,
      };
    });
  }

  async listUsersCreatedBetween(from: Date, to: Date): Promise<Array<{ createdAt: Date }>> {
    const rows = await this.prisma.user.findMany({
      where: { role: "guest", createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    });
    return rows;
  }

  async listAcceptedGameSessionsBetween(from: Date, to: Date): Promise<Array<{ createdAt: Date }>> {
    const rows = await this.prisma.gameSessionLog.findMany({
      where: { accepted: true, createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    });
    return rows;
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
    endsAt: Date;
    durationMinutes: number;
    partySize: number;
    comment: string | null;
    tableId?: string | null;
  }): Promise<BookingRequestRecord> {
    const row = await this.prisma.bookingRequest.create({
      data: {
        userId: input.userId,
        requestedFor: input.requestedFor,
        endsAt: input.endsAt,
        durationMinutes: input.durationMinutes,
        partySize: input.partySize,
        comment: input.comment,
        tableId: input.tableId ?? null,
      },
    });
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
      Pick<
        BookingRequestRecord,
        | "status"
        | "handledBy"
        | "handledAt"
        | "reminderSent"
        | "tableId"
        | "tableAssignedAt"
        | "seatedAt"
        | "endsAt"
        | "durationMinutes"
      >
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

  async listBookingsBetween(input: { from: Date; to: Date; status?: import("../domain/types.ts").BookingStatus }) {
    const rows = await this.prisma.bookingRequest.findMany({
      where: {
        requestedFor: { gte: input.from, lte: input.to },
        ...(input.status === undefined ? {} : { status: input.status }),
      },
      include: { user: true, table: true },
      orderBy: { requestedFor: "asc" },
    });
    return rows.map((row) => ({
      ...toBooking(row),
      guestFirstName: row.user.firstName,
      guestLastName: row.user.lastName,
      guestPhone: row.user.phone,
      tableLabel: row.table?.label ?? null,
    }));
  }

  async getActiveFloorPlan(): Promise<FloorPlanView | null> {
    const plan = await this.prisma.floorPlan.findFirst({
      where: { active: true },
      include: {
        tables: { orderBy: [{ sort: "asc" }, { label: "asc" }] },
        elements: { orderBy: [{ sort: "asc" }, { label: "asc" }] },
      },
    });
    return plan ? toFloorPlanView(plan) : null;
  }

  async listFloorPlans(): Promise<FloorPlanRecord[]> {
    const rows = await this.prisma.floorPlan.findMany({ orderBy: { name: "asc" } });
    return rows.map(toFloorPlan);
  }

  async findFloorPlanById(id: string): Promise<FloorPlanRecord | null> {
    const row = await this.prisma.floorPlan.findUnique({ where: { id } });
    return row ? toFloorPlan(row) : null;
  }

  async upsertFloorPlan(input: {
    id?: string;
    name: string;
    width: number;
    height: number;
    backgroundImageUrl: string | null;
    active: boolean;
  }): Promise<FloorPlanRecord> {
    if (input.active) {
      await this.prisma.floorPlan.updateMany({
        where: input.id ? { active: true, id: { not: input.id } } : { active: true },
        data: { active: false },
      });
    }
    const row = input.id
      ? await this.prisma.floorPlan.update({
          where: { id: input.id },
          data: {
            name: input.name,
            width: input.width,
            height: input.height,
            backgroundImageUrl: input.backgroundImageUrl,
            active: input.active,
          },
        })
      : await this.prisma.floorPlan.create({ data: input });
    return toFloorPlan(row);
  }

  async deleteFloorPlan(id: string): Promise<void> {
    await this.prisma.floorPlan.delete({ where: { id } });
  }

  async findTableById(id: string): Promise<VenueTableRecord | null> {
    const row = await this.prisma.venueTable.findUnique({ where: { id } });
    return row ? toVenueTable(row) : null;
  }

  async upsertVenueTable(input: {
    id?: string;
    floorPlanId: string;
    label: string;
    description: string;
    highlights: string[];
    photoUrl: string | null;
    seatsMin: number;
    seatsMax: number;
    posX: number;
    posY: number;
    width: number;
    height: number;
    rotation: number;
    sort: number;
    active: boolean;
  }): Promise<VenueTableRecord> {
    const data = {
      floorPlanId: input.floorPlanId,
      label: input.label,
      description: input.description,
      highlights: input.highlights,
      photoUrl: input.photoUrl,
      seatsMin: input.seatsMin,
      seatsMax: input.seatsMax,
      posX: input.posX,
      posY: input.posY,
      width: input.width,
      height: input.height,
      rotation: input.rotation,
      sort: input.sort,
      active: input.active,
    };
    const row = input.id
      ? await this.prisma.venueTable.update({ where: { id: input.id }, data })
      : await this.prisma.venueTable.create({ data });
    return toVenueTable(row);
  }

  async deleteVenueTable(id: string): Promise<void> {
    await this.prisma.venueTable.delete({ where: { id } });
  }

  async upsertFloorElement(input: {
    id?: string;
    floorPlanId: string;
    kind: FloorElementRecord["kind"];
    label: string;
    posX: number;
    posY: number;
    width: number;
    height: number;
    rotation: number;
    sort: number;
  }): Promise<FloorElementRecord> {
    const data = {
      floorPlanId: input.floorPlanId,
      kind: input.kind,
      label: input.label,
      posX: input.posX,
      posY: input.posY,
      width: input.width,
      height: input.height,
      rotation: input.rotation,
      sort: input.sort,
    };
    const row = input.id
      ? await this.prisma.floorElement.update({ where: { id: input.id }, data })
      : await this.prisma.floorElement.create({ data });
    return toFloorElement(row);
  }

  async deleteFloorElement(id: string): Promise<void> {
    await this.prisma.floorElement.delete({ where: { id } });
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

  async listAllMenuItems(): Promise<MenuItemRecord[]> {
    const rows = await this.prisma.menuItem.findMany({
      orderBy: [{ sort: "asc" }, { title: "asc" }],
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
          imageUrl: item.imageUrl,
          sort: item.sort,
          active: item.active,
        },
        update: {
          title: item.title,
          description: item.description,
          priceRubles: item.priceRubles,
          imageFileId: item.imageFileId,
          imageUrl: item.imageUrl,
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
        imageUrl: item.imageUrl,
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

  async createPromo(input: {
    body: string;
    photos: string[];
    showInFeed: boolean;
    broadcastSegment?: BroadcastSegmentId | null;
    broadcastRecipients?: number | null;
    broadcastSent?: number | null;
    broadcastFailed?: number | null;
  }): Promise<PromoRecord> {
    const row = await this.prisma.promo.create({
      data: {
        body: input.body,
        photos: input.photos,
        showInFeed: input.showInFeed,
        broadcastSegment: input.broadcastSegment ?? null,
        broadcastRecipients: input.broadcastRecipients ?? null,
        broadcastSent: input.broadcastSent ?? null,
        broadcastFailed: input.broadcastFailed ?? null,
      },
    });
    return toPromo(row);
  }

  async updatePromo(
    id: string,
    patch: Partial<
      Pick<PromoRecord, "broadcastSegment" | "broadcastRecipients" | "broadcastSent" | "broadcastFailed">
    >,
  ): Promise<PromoRecord> {
    const row = await this.prisma.promo.update({
      where: { id },
      data: {
        broadcastSegment: patch.broadcastSegment,
        broadcastRecipients: patch.broadcastRecipients,
        broadcastSent: patch.broadcastSent,
        broadcastFailed: patch.broadcastFailed,
      },
    });
    return toPromo(row);
  }

  async listFeedPromos(): Promise<PromoRecord[]> {
    const rows = await this.prisma.promo.findMany({ where: { showInFeed: true } });
    return rows.map(toPromo);
  }

  async listPromos(limit: number): Promise<PromoRecord[]> {
    const rows = await this.prisma.promo.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(toPromo);
  }

  async createPromoRule(input: {
    promoId: string | null;
    kind: PromoRuleKind;
    params: Record<string, unknown>;
    active?: boolean;
    validFrom?: Date | null;
    validUntil?: Date | null;
    priority?: number;
  }): Promise<PromoRuleRecord> {
    const row = await this.prisma.promoRule.create({
      data: {
        promoId: input.promoId,
        kind: input.kind,
        params: input.params as Prisma.InputJsonValue,
        active: input.active ?? true,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        priority: input.priority ?? 0,
      },
    });
    return toPromoRule(row);
  }

  async listActivePromoRules(now: Date): Promise<PromoRuleRecord[]> {
    const rows = await this.prisma.promoRule.findMany({
      where: {
        active: true,
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: now } }] }],
      },
    });
    return rows.map(toPromoRule);
  }

  async hasReferralActivation(refereeId: string): Promise<boolean> {
    const row = await this.prisma.referralActivation.findUnique({ where: { refereeId } });
    return row !== null;
  }

  async createReferralActivation(input: {
    referrerId: string;
    refereeId: string;
    activatedAt: Date;
    visitId: string | null;
    ledgerIdReferrer: string | null;
    ledgerIdReferee: string | null;
  }): Promise<ReferralActivationRecord> {
    const row = await this.prisma.referralActivation.create({ data: input });
    return toReferralActivation(row);
  }

  async getReferralStats(userId: string): Promise<ReferralStats> {
    const [invited, activated, bonusRows] = await Promise.all([
      this.prisma.user.count({ where: { referredByUserId: userId } }),
      this.prisma.referralActivation.count({ where: { referrerId: userId } }),
      this.prisma.ledger.findMany({
        where: { userId, type: "referral", amount: { gt: 0 } },
        select: { amount: true },
      }),
    ]);
    return {
      invited,
      activated,
      bonusesEarned: bonusRows.reduce((sum, row) => sum + row.amount, 0),
    };
  }

  async countReferralsActivatedBetween(from: Date, to: Date): Promise<number> {
    return this.prisma.referralActivation.count({
      where: { activatedAt: { gte: from, lte: to } },
    });
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

  async createGameSessionLog(input: {
    userId: string;
    gameId: string;
    slug: string;
    points: number;
    startedAt: Date;
    endedAt: Date;
    accepted: boolean;
    rejectReason: string | null;
  }): Promise<GameSessionLogRecord> {
    const row = await this.prisma.gameSessionLog.create({ data: input });
    return toGameSessionLog(row);
  }

  async listRecentGameSessionLogs(
    userId: string,
    gameId: string,
    limit: number,
  ): Promise<GameSessionLogRecord[]> {
    const rows = await this.prisma.gameSessionLog.findMany({
      where: { userId, gameId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(toGameSessionLog);
  }

  async countGameSessionsSince(userId: string, since: Date): Promise<number> {
    return this.prisma.gameSessionLog.count({
      where: { userId, createdAt: { gte: since } },
    });
  }

  async getWeeklyGameScore(
    userId: string,
    gameId: string,
    weekStart: Date,
  ): Promise<number | null> {
    const week = await this.prisma.gameWeek.findFirst({
      where: { gameId, weekStart },
    });
    if (week === null) {
      return null;
    }
    const score = await this.prisma.gameScore.findUnique({
      where: { weekId_userId: { weekId: week.id, userId } },
    });
    return score?.points ?? null;
  }

  async listRejectedGameSessionLogs(limit: number): Promise<GameSessionLogRecord[]> {
    const rows = await this.prisma.gameSessionLog.findMany({
      where: { accepted: false },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(toGameSessionLog);
  }

  async countAcceptedGameSessionsBetween(from: Date, to: Date): Promise<number> {
    return this.prisma.gameSessionLog.count({
      where: { accepted: true, createdAt: { gte: from, lte: to } },
    });
  }

  async countUniqueGamePlayersBetween(from: Date, to: Date): Promise<number> {
    const rows = await this.prisma.gameSessionLog.findMany({
      where: { accepted: true, createdAt: { gte: from, lte: to } },
      distinct: ["userId"],
      select: { userId: true },
    });
    return rows.length;
  }

  async findActiveQuiz(): Promise<QuizRecord | null> {
    const row = await this.prisma.quiz.findFirst({ where: { active: true } });
    return row ? toQuiz(row) : null;
  }

  async findQuizById(id: string): Promise<QuizRecord | null> {
    const row = await this.prisma.quiz.findUnique({ where: { id } });
    return row ? toQuiz(row) : null;
  }

  async listQuizQuestions(quizId: string): Promise<QuizQuestionRecord[]> {
    const rows = await this.prisma.quizQuestion.findMany({
      where: { quizId },
      orderBy: { sort: "asc" },
    });
    return rows.map(toQuizQuestion);
  }

  async createQuizQuestion(input: {
    quizId: string;
    sort: number;
    text: string;
    imageUrl?: string | null;
    options: string[];
    correctIndex: number;
  }): Promise<QuizQuestionRecord> {
    const row = await this.prisma.quizQuestion.create({
      data: {
        quizId: input.quizId,
        sort: input.sort,
        text: input.text,
        imageUrl: input.imageUrl ?? null,
        options: input.options,
        correctIndex: input.correctIndex,
      },
    });
    return toQuizQuestion(row);
  }

  async updateQuizQuestion(
    id: string,
    patch: Partial<Pick<QuizQuestionRecord, "text" | "imageUrl" | "options" | "correctIndex" | "sort">>,
  ): Promise<QuizQuestionRecord> {
    const row = await this.prisma.quizQuestion.update({
      where: { id },
      data: patch,
    });
    return toQuizQuestion(row);
  }

  async deleteQuizQuestion(id: string): Promise<void> {
    await this.prisma.quizQuestion.delete({ where: { id } });
  }

  async getLiveQuizSession(now: Date): Promise<QuizSessionRecord | null> {
    const row = await this.prisma.quizSession.findFirst({
      where: {
        status: "live",
        startedAt: { lte: now },
        endsAt: { gte: now },
      },
    });
    return row ? toQuizSession(row) : null;
  }

  async findQuizSessionById(id: string): Promise<QuizSessionRecord | null> {
    const row = await this.prisma.quizSession.findUnique({ where: { id } });
    return row ? toQuizSession(row) : null;
  }

  async createQuizSession(input: {
    quizId: string;
    startedAt: Date;
    endsAt: Date;
    status: QuizSessionStatus;
  }): Promise<QuizSessionRecord> {
    const row = await this.prisma.quizSession.create({ data: input });
    return toQuizSession(row);
  }

  async updateQuizSession(
    id: string,
    patch: Partial<Pick<QuizSessionRecord, "status">>,
  ): Promise<QuizSessionRecord> {
    const row = await this.prisma.quizSession.update({
      where: { id },
      data: { status: patch.status },
    });
    return toQuizSession(row);
  }

  async hasQuizAnswer(sessionId: string, questionId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.quizAnswer.findUnique({
      where: {
        sessionId_questionId_userId: { sessionId, questionId, userId },
      },
    });
    return row !== null;
  }

  async createQuizAnswer(input: {
    sessionId: string;
    questionId: string;
    userId: string;
    optionIndex: number;
    elapsedMs: number;
    points: number;
  }): Promise<QuizAnswerRecord> {
    const row = await this.prisma.quizAnswer.create({ data: input });
    return toQuizAnswer(row);
  }

  async sumQuizSessionPoints(sessionId: string, userId: string): Promise<number> {
    const result = await this.prisma.quizAnswer.aggregate({
      where: { sessionId, userId },
      _sum: { points: true },
    });
    return result._sum.points ?? 0;
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
    value === "expire" ||
    value === "referral" ||
    value === "promo_bonus"
  ) {
    return value;
  }
  throw new Error(`unknown ledger type: ${value}`);
}

function toUser(row: User): UserRecord {
  return {
    id: row.id,
    telegramId: row.telegramId,
    telegramUsername: row.telegramUsername,
    role: toRole(row.role),
    firstName: row.firstName,
    lastName: row.lastName,
    birthday: row.birthday,
    phone: row.phone,
    balance: row.balance,
    qrToken: row.qrToken,
    broadcastOptOut: row.broadcastOptOut,
    staffNote: row.staffNote,
    referralCode: row.referralCode,
    referredByUserId: row.referredByUserId,
    birthdayWarnedYear: row.birthdayWarnedYear,
    birthdayGreetedYear: row.birthdayGreetedYear,
    createdAt: row.createdAt,
  };
}

function toPromoRuleKind(value: string): PromoRuleKind {
  if (
    value === "double_check_bonus" ||
    value === "min_check_bonus" ||
    value === "weekday_multiplier" ||
    value === "promo_code"
  ) {
    return value;
  }
  throw new Error(`unknown promo rule kind: ${value}`);
}

function toPromoRule(row: PromoRule): PromoRuleRecord {
  return {
    id: row.id,
    promoId: row.promoId,
    kind: toPromoRuleKind(row.kind),
    params: (row.params as Record<string, unknown>) ?? {},
    active: row.active,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    priority: row.priority,
  };
}

function toReferralActivation(row: ReferralActivation): ReferralActivationRecord {
  return {
    id: row.id,
    referrerId: row.referrerId,
    refereeId: row.refereeId,
    activatedAt: row.activatedAt,
    visitId: row.visitId,
    ledgerIdReferrer: row.ledgerIdReferrer,
    ledgerIdReferee: row.ledgerIdReferee,
  };
}

function toGameSessionLog(row: GameSessionLog): GameSessionLogRecord {
  return {
    id: row.id,
    userId: row.userId,
    gameId: row.gameId,
    slug: row.slug,
    points: row.points,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    accepted: row.accepted,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt,
  };
}

function toQuizSessionStatus(value: string): QuizSessionStatus {
  if (value === "draft" || value === "live" || value === "closed") {
    return value;
  }
  throw new Error(`unknown quiz session status: ${value}`);
}

function toQuiz(row: Quiz): QuizRecord {
  return {
    id: row.id,
    title: row.title,
    active: row.active,
    showInHub: row.showInHub,
  };
}

function toQuizQuestion(row: QuizQuestion): QuizQuestionRecord {
  const options = row.options as unknown;
  return {
    id: row.id,
    quizId: row.quizId,
    sort: row.sort,
    text: row.text,
    imageUrl: row.imageUrl,
    options: Array.isArray(options) ? options.map(String) : [],
    correctIndex: row.correctIndex,
  };
}

function toQuizSession(row: QuizSession): QuizSessionRecord {
  return {
    id: row.id,
    quizId: row.quizId,
    startedAt: row.startedAt,
    endsAt: row.endsAt,
    status: toQuizSessionStatus(row.status),
  };
}

function toQuizAnswer(row: QuizAnswer): QuizAnswerRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    questionId: row.questionId,
    userId: row.userId,
    optionIndex: row.optionIndex,
    elapsedMs: row.elapsedMs,
    points: row.points,
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
    value === "visit_close" ||
    value === "coupon_redeem" ||
    value === "guest_search" ||
    value === "booking_table_assign" ||
    value === "booking_table_move" ||
    value === "booking_table_swap"
  ) {
    return value;
  }
  throw new Error(`unknown staff action: ${value}`);
}

function toStaffActionLog(row: StaffActionLog, guest: User | null): StaffActionLogRecord {
  return {
    id: row.id,
    actorId: row.actorId,
    guestId: row.guestId,
    action: toStaffActionKind(row.action),
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: row.createdAt,
    guestFirstName: guest?.firstName ?? null,
    guestLastName: guest?.lastName ?? null,
    guestTelegramId: guest ? guest.telegramId.toString() : null,
    guestTelegramUsername: guest?.telegramUsername ?? null,
  };
}

function toBooking(row: BookingRequest): BookingRequestRecord {
  return {
    id: row.id,
    userId: row.userId,
    tableId: row.tableId,
    requestedFor: row.requestedFor,
    endsAt: row.endsAt,
    durationMinutes: row.durationMinutes,
    partySize: row.partySize,
    comment: row.comment,
    status: row.status,
    handledBy: row.handledBy,
    handledAt: row.handledAt,
    seatedAt: row.seatedAt,
    tableAssignedAt: row.tableAssignedAt,
    reminderSent: row.reminderSent,
    createdAt: row.createdAt,
  };
}

function toFloorPlan(row: FloorPlan): FloorPlanRecord {
  return {
    id: row.id,
    name: row.name,
    width: row.width,
    height: row.height,
    backgroundImageUrl: row.backgroundImageUrl,
    active: row.active,
  };
}

function toVenueTable(row: VenueTable): VenueTableRecord {
  const highlightsRaw = row.highlights;
  const highlights = Array.isArray(highlightsRaw)
    ? highlightsRaw.filter((item): item is string => typeof item === "string")
    : [];
  return {
    id: row.id,
    floorPlanId: row.floorPlanId,
    label: row.label,
    description: row.description,
    highlights,
    photoUrl: row.photoUrl,
    seatsMin: row.seatsMin,
    seatsMax: row.seatsMax,
    posX: row.posX,
    posY: row.posY,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    sort: row.sort,
    active: row.active,
  };
}

function toFloorElement(row: FloorElement): FloorElementRecord {
  return {
    id: row.id,
    floorPlanId: row.floorPlanId,
    kind: row.kind,
    label: row.label,
    posX: row.posX,
    posY: row.posY,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    sort: row.sort,
  };
}

function toFloorPlanView(row: FloorPlan & { tables: VenueTable[]; elements: FloorElement[] }): FloorPlanView {
  return {
    ...toFloorPlan(row),
    tables: row.tables.map(toVenueTable),
    elements: row.elements.map(toFloorElement),
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
    imageUrl: row.imageUrl,
    sort: row.sort,
    active: row.active,
  };
}

function toStaffWeeklySchedule(row: import("@prisma/client").StaffWeeklySchedule) {
  return {
    id: row.id,
    userId: row.userId,
    weekday: row.weekday,
    startHour: row.startHour,
    endHour: row.endHour,
  };
}

function toStaffShift(row: import("@prisma/client").StaffShift) {
  return {
    id: row.id,
    userId: row.userId,
    date: row.date,
    startHour: row.startHour,
    endHour: row.endHour,
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
    broadcastSegment: (row.broadcastSegment as BroadcastSegmentId | null) ?? null,
    broadcastRecipients: row.broadcastRecipients,
    broadcastSent: row.broadcastSent,
    broadcastFailed: row.broadcastFailed,
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
