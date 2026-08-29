import { DateTime } from "luxon";
import { DEFAULT_SETTINGS } from "../domain/settings.ts";
import type {
  ActiveVisitRow,
  BonusLotRecord,
  BookingRequestRecord,
  CheckInLogRecord,
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
  StaffActionKind,
  StaffActionLogRecord,
  UserRecord,
  VenueCodeRecord,
  VisitRecord,
} from "../domain/types.ts";
import { MOSCOW, moscowCalendarYear } from "../domain/week.ts";
import type { NewUser, Store } from "./types.ts";

export class MemoryStore implements Store {
  settings: Settings = structuredClone(DEFAULT_SETTINGS);
  users = new Map<string, UserRecord>();
  ledger: LedgerRecord[] = [];
  visits = new Map<string, VisitRecord>();
  venueCodes = new Map<string, VenueCodeRecord>();
  checkInLogs: CheckInLogRecord[] = [];
  menu = new Map<string, MenuItemRecord>();
  pages = new Map<string, ContentPageRecord>();
  promos = new Map<string, PromoRecord>();
  games = new Map<string, GameRecord>();
  weeks = new Map<string, GameWeekRecord>();
  scores = new Map<string, GameScoreRecord>();
  coupons = new Map<string, CouponRecord>();
  bonusLots = new Map<string, BonusLotRecord>();
  awards = new Set<string>();
  staffActionLogs: StaffActionLogRecord[] = [];
  bookings = new Map<string, BookingRequestRecord>();

  constructor() {
    const match3Id = crypto.randomUUID();
    this.games.set(match3Id, {
      id: match3Id,
      slug: "match3",
      title: "Три в ряд",
      active: true,
      maxScorePerSession: 50000,
    });
    const blockBlastId = crypto.randomUUID();
    this.games.set(blockBlastId, {
      id: blockBlastId,
      slug: "blockblast",
      title: "Блоки",
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
      staffNote: null,
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
  async listStaffTelegramIds() {
    return [...this.users.values()]
      .filter((u) => u.role === "master" || u.role === "admin")
      .map((u) => u.telegramId);
  }
  async countRegistrationsBetween(from: Date, to: Date) {
    return [...this.users.values()].filter(
      (u) => u.role === "guest" && u.createdAt >= from && u.createdAt <= to,
    ).length;
  }
  async searchGuestsByName(query: string, limit: number) {
    const q = query.toLowerCase();
    return [...this.users.values()]
      .filter((u) => {
        if (u.role !== "guest") {
          return false;
        }
        const first = (u.firstName ?? "").toLowerCase();
        const last = (u.lastName ?? "").toLowerCase();
        const combined = `${first} ${last}`.trim();
        return first.includes(q) || last.includes(q) || combined.includes(q);
      })
      .slice(0, limit)
      .map((u) => ({ ...u }));
  }
  async createStaffActionLog(input: {
    actorId: string;
    guestId: string | null;
    action: StaffActionKind;
    payload: Record<string, unknown>;
  }) {
    const row: StaffActionLogRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      ...input,
    };
    this.staffActionLogs.push(row);
    return { ...row };
  }
  async listStaffActionLog(input: {
    from: Date;
    to: Date;
    actorId?: string;
    limit: number;
    offset: number;
  }) {
    return this.staffActionLogs
      .filter((row) => {
        if (row.createdAt < input.from || row.createdAt > input.to) {
          return false;
        }
        if (input.actorId !== undefined && row.actorId !== input.actorId) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(input.offset, input.offset + input.limit)
      .map((row) => ({ ...row }));
  }
  async countStaffActionsBetween(from: Date, to: Date) {
    return this.staffActionLogs.filter((row) => row.createdAt >= from && row.createdAt <= to).length;
  }
  async countVisitsForUser(userId: string) {
    return [...this.visits.values()].filter((v) => v.userId === userId).length;
  }
  async lastVisitStartedAt(userId: string) {
    const visits = [...this.visits.values()]
      .filter((v) => v.userId === userId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return visits[0]?.startedAt ?? null;
  }
  async hasCheckInToday(userId: string, now: Date) {
    const start = DateTime.fromJSDate(now, { zone: MOSCOW }).startOf("day").toJSDate();
    const end = DateTime.fromJSDate(now, { zone: MOSCOW }).endOf("day").toJSDate();
    return this.checkInLogs.some(
      (log) => log.userId === userId && log.createdAt >= start && log.createdAt <= end,
    );
  }
  async countVisitsBetween(from: Date, to: Date) {
    return [...this.visits.values()].filter((v) => v.startedAt >= from && v.startedAt <= to).length;
  }
  async countUniqueGuestsWithVisitBetween(from: Date, to: Date) {
    const ids = new Set(
      [...this.visits.values()]
        .filter((v) => v.startedAt >= from && v.startedAt <= to)
        .map((v) => v.userId),
    );
    return ids.size;
  }
  async countCheckInsBetween(from: Date, to: Date) {
    return this.checkInLogs.filter((log) => log.createdAt >= from && log.createdAt <= to).length;
  }
  async listVisitsBetween(from: Date, to: Date) {
    return [...this.visits.values()]
      .filter((v) => v.startedAt >= from && v.startedAt <= to)
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  }
  async listCheckInsBetween(from: Date, to: Date) {
    return this.checkInLogs
      .filter((log) => log.createdAt >= from && log.createdAt <= to)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((log) => ({ ...log }));
  }
  async listLedgerBetween(from: Date, to: Date) {
    return this.ledger
      .filter((row) => row.createdAt >= from && row.createdAt <= to)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((row) => ({ ...row }));
  }
  async listCouponsBetween(from: Date, to: Date) {
    return [...this.coupons.values()]
      .filter((coupon) => coupon.expiresAt >= from && coupon.expiresAt <= to)
      .map((coupon) => ({ ...coupon }));
  }
  async sumActiveBonusLotRemaining(now: Date) {
    return [...this.bonusLots.values()]
      .filter((lot) => lot.remaining > 0 && lot.expiresAt > now)
      .reduce((sum, lot) => sum + lot.remaining, 0);
  }
  async createBookingRequest(input: {
    userId: string;
    requestedFor: Date;
    partySize: number;
    comment: string | null;
  }) {
    const row: BookingRequestRecord = {
      id: crypto.randomUUID(),
      status: "pending",
      handledBy: null,
      handledAt: null,
      reminderSent: false,
      createdAt: new Date(),
      ...input,
    };
    this.bookings.set(row.id, row);
    return { ...row };
  }
  async findBookingById(id: string) {
    const row = this.bookings.get(id);
    return row ? { ...row } : null;
  }
  async findPendingBookingForUser(userId: string) {
    return (
      [...this.bookings.values()].find((b) => b.userId === userId && b.status === "pending") ?? null
    );
  }
  async updateBooking(
    id: string,
    patch: Partial<
      Pick<BookingRequestRecord, "status" | "handledBy" | "handledAt" | "reminderSent">
    >,
  ) {
    const cur = this.bookings.get(id);
    if (!cur) {
      throw new Error("booking missing");
    }
    const next = { ...cur, ...patch, id: cur.id };
    this.bookings.set(id, next);
    return { ...next };
  }
  async listBookingsNeedingReminder(now: Date) {
    const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    return [...this.bookings.values()].filter(
      (b) =>
        !b.reminderSent &&
        b.status === "confirmed" &&
        b.requestedFor <= inTwoHours &&
        b.requestedFor > now,
    );
  }
  async listPendingBookings() {
    return [...this.bookings.values()]
      .filter((b) => b.status === "pending")
      .sort((a, b) => a.requestedFor.getTime() - b.requestedFor.getTime())
      .map((b) => ({ ...b }));
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
      (l) => l.userId === userId && l.type === "birthday" && moscowCalendarYear(l.createdAt) === year,
    );
  }
  async listUsersWithBirthday() {
    return [...this.users.values()].filter((u) => u.birthday);
  }

  async createBonusLot(input: {
    userId: string;
    ledgerId: string | null;
    category: "gift" | "check";
    initial: number;
    remaining: number;
    expiresAt: Date;
    createdAt: Date;
  }) {
    const row: BonusLotRecord = {
      id: crypto.randomUUID(),
      warned7d: false,
      warned3d: false,
      warned1d: false,
      ...input,
    };
    this.bonusLots.set(row.id, row);
    return { ...row };
  }
  async listBonusLots(userId: string) {
    return [...this.bonusLots.values()]
      .filter((lot) => lot.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((lot) => ({ ...lot }));
  }
  async listBonusLotsWithRemaining() {
    return [...this.bonusLots.values()].filter((lot) => lot.remaining > 0).map((lot) => ({ ...lot }));
  }
  async updateBonusLot(
    id: string,
    patch: Partial<Pick<BonusLotRecord, "remaining" | "warned7d" | "warned3d" | "warned1d" | "expiresAt">>,
  ) {
    const cur = this.bonusLots.get(id);
    if (!cur) throw new Error("bonus lot missing");
    const next = { ...cur, ...patch, id: cur.id };
    this.bonusLots.set(id, next);
    return { ...next };
  }
  async findBonusLotByLedgerId(ledgerId: string) {
    const lot = [...this.bonusLots.values()].find((row) => row.ledgerId === ledgerId);
    return lot ? { ...lot } : null;
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

  async listActiveVisits(now: Date): Promise<ActiveVisitRow[]> {
    const active = [...this.visits.values()].filter((visit) => now < visit.endsAt);
    return active.map((visit) => {
      const user = this.users.get(visit.userId);
      const latest = [...this.checkInLogs]
        .filter((log) => log.visitId === visit.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return {
        visitId: visit.id,
        userId: visit.userId,
        firstName: user?.firstName ?? null,
        lastName: user?.lastName ?? null,
        startedAt: visit.startedAt,
        endsAt: visit.endsAt,
        checkInMethod: latest?.method ?? null,
      };
    });
  }

  async revokeActiveVenueCodes(now: Date) {
    for (const [id, code] of this.venueCodes) {
      if (code.revokedAt === null && code.validFrom <= now && now < code.validUntil) {
        this.venueCodes.set(id, { ...code, revokedAt: now });
      }
    }
  }

  async createVenueCode(input: {
    pin: string;
    token: string;
    validFrom: Date;
    validUntil: Date;
    createdBy: string | null;
    createdAt: Date;
  }) {
    const row: VenueCodeRecord = {
      id: crypto.randomUUID(),
      revokedAt: null,
      ...input,
    };
    this.venueCodes.set(row.id, row);
    return { ...row };
  }

  async findActiveVenueCode(now: Date) {
    return (
      [...this.venueCodes.values()].find(
        (code) => code.revokedAt === null && code.validFrom <= now && now < code.validUntil,
      ) ?? null
    );
  }

  async findVenueCodeByToken(token: string) {
    return [...this.venueCodes.values()].find((code) => code.token === token) ?? null;
  }

  async createCheckInLog(input: {
    userId: string;
    venueCodeId: string;
    visitId: string;
    method: "qr" | "pin";
    createdAt: Date;
  }) {
    const row: CheckInLogRecord = { id: crypto.randomUUID(), ...input };
    this.checkInLogs.push(row);
    return row;
  }

  async findLatestCheckInForVisit(visitId: string) {
    return (
      [...this.checkInLogs]
        .filter((log) => log.visitId === visitId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
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
  async getPage(slug: "contacts" | "directions" | "game_rules") {
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
  async listOpenWeeks() {
    return [...this.weeks.values()].filter((week) => week.closedAt === null);
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
  async listAggregatedWeekScores(weekStart: Date) {
    const weekIds = new Set(
      [...this.weeks.values()]
        .filter((week) => week.weekStart.getTime() === weekStart.getTime())
        .map((week) => week.id),
    );
    const byUser = new Map<string, { points: number; updatedAt: Date }>();
    for (const score of this.scores.values()) {
      if (!weekIds.has(score.weekId)) {
        continue;
      }
      const current = byUser.get(score.userId);
      if (current === undefined) {
        byUser.set(score.userId, { points: score.points, updatedAt: score.updatedAt });
        continue;
      }
      byUser.set(score.userId, {
        points: current.points + score.points,
        updatedAt: score.updatedAt > current.updatedAt ? score.updatedAt : current.updatedAt,
      });
    }
    return [...byUser.entries()].map(([userId, row]) => ({
      userId,
      points: row.points,
      updatedAt: row.updatedAt,
    }));
  }
  async closeWeek(weekId: string, at: Date) {
    const w = this.weeks.get(weekId)!;
    this.weeks.set(weekId, { ...w, closedAt: at });
  }
  async hasWeeklyAward(weekStart: Date, userId: string) {
    return this.awards.has(`${weekStart.getTime()}:${userId}`);
  }
  async addWeeklyAward(weekStart: Date, userId: string, _place: number) {
    this.awards.add(`${weekStart.getTime()}:${userId}`);
  }

  async createCoupon(input: {
    userId: string;
    title: string;
    weekId: string | null;
    expiresAt: Date;
  }) {
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
    const now = Date.now();
    return [...this.coupons.values()].filter(
      (c) => c.userId === userId && c.status === "active" && c.expiresAt.getTime() > now,
    );
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
  async expireCoupons(now: Date) {
    let count = 0;
    for (const [id, coupon] of this.coupons) {
      if (coupon.status === "active" && coupon.expiresAt.getTime() <= now.getTime()) {
        this.coupons.set(id, { ...coupon, status: "expired" });
        count += 1;
      }
    }
    return count;
  }
}
