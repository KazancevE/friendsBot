import { DateTime } from "luxon";
import { DEFAULT_SETTINGS } from "../domain/settings.ts";
import type {
  ActiveVisitRow,
  BonusLotRecord,
  BookingRequestRecord,
  BookingStatus,
  BroadcastSegmentId,
  CheckInLogRecord,
  ContentPageRecord,
  CouponRecord,
  FloorElementRecord,
  FloorPlanRecord,
  FloorPlanView,
  GameRecord,
  GameScoreRecord,
  GameSessionLogRecord,
  GameWeekRecord,
  LedgerRecord,
  LedgerType,
  MenuItemRecord,
  PromoRecord,
  PromoRuleKind,
  PromoRuleRecord,
  ReferralActivationRecord,
  ReferralStats,
  Settings,
  QuizAnswerRecord,
  QuizQuestionRecord,
  QuizRecord,
  QuizSessionRecord,
  QuizSessionStatus,
  StaffActionKind,
  StaffActionLogRecord,
  StaffMemberRecord,
  StaffWeeklyScheduleRecord,
  UserRecord,
  VenueCodeRecord,
  VenueTableRecord,
  VisitRecord,
} from "../domain/types.ts";
import { MOSCOW, moscowCalendarYear } from "../domain/week.ts";
import type { BroadcastGuestCandidate, NewUser, Store } from "./types.ts";

export class MemoryStore implements Store {
  settings: Settings = structuredClone(DEFAULT_SETTINGS);
  rawSettings = new Map<string, string>();
  users = new Map<string, UserRecord>();
  ledger: LedgerRecord[] = [];
  visits = new Map<string, VisitRecord>();
  venueCodes = new Map<string, VenueCodeRecord>();
  checkInLogs: CheckInLogRecord[] = [];
  menu = new Map<string, MenuItemRecord>();
  pages = new Map<string, ContentPageRecord>();
  promos = new Map<string, PromoRecord>();
  promoRules = new Map<string, PromoRuleRecord>();
  referralActivations = new Map<string, ReferralActivationRecord>();
  gameSessionLogs: GameSessionLogRecord[] = [];
  quizzes = new Map<string, QuizRecord>();
  quizQuestions = new Map<string, QuizQuestionRecord>();
  quizSessions = new Map<string, QuizSessionRecord>();
  quizAnswers = new Map<string, QuizAnswerRecord>();
  games = new Map<string, GameRecord>();
  weeks = new Map<string, GameWeekRecord>();
  scores = new Map<string, GameScoreRecord>();
  coupons = new Map<string, CouponRecord>();
  bonusLots = new Map<string, BonusLotRecord>();
  awards = new Map<string, number>();
  staffActionLogs: StaffActionLogRecord[] = [];
  bookings = new Map<string, BookingRequestRecord>();
  staffWeeklySchedules = new Map<string, StaffWeeklyScheduleRecord>();
  floorPlans = new Map<string, FloorPlanRecord>();
  venueTables = new Map<string, VenueTableRecord>();
  floorElements = new Map<string, FloorElementRecord>();

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
    const game2048Id = crypto.randomUUID();
    this.games.set(game2048Id, {
      id: game2048Id,
      slug: "game2048",
      title: "2048",
      active: true,
      maxScorePerSession: 50000,
    });
    const flappyId = crypto.randomUUID();
    this.games.set(flappyId, {
      id: flappyId,
      slug: "flappy",
      title: "Flappy",
      active: true,
      maxScorePerSession: 500,
    });
    const quizGameId = crypto.randomUUID();
    this.games.set(quizGameId, {
      id: quizGameId,
      slug: "quiz",
      title: "Викторина",
      active: true,
      maxScorePerSession: 5000,
    });
    const defaultQuizId = crypto.randomUUID();
    this.quizzes.set(defaultQuizId, {
      id: defaultQuizId,
      title: "Викторина",
      active: true,
      showInHub: false,
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

  async getSettingValue(key: string) {
    return this.rawSettings.get(key) ?? null;
  }

  async upsertSettingValue(key: string, value: string) {
    this.rawSettings.set(key, value);
  }

  async createUser(input: NewUser): Promise<UserRecord> {
    const user: UserRecord = {
      id: crypto.randomUUID(),
      telegramId: input.telegramId,
      telegramUsername: null,
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
      birthday: input.birthday,
      phone: input.phone,
      balance: 0,
      qrToken: input.qrToken,
      broadcastOptOut: false,
      staffNote: null,
      referralCode: null,
      referredByUserId: null,
      birthdayWarnedYear: null,
      birthdayGreetedYear: null,
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
  async findUserByReferralCode(code: string) {
    return [...this.users.values()].find((u) => u.referralCode === code.toUpperCase()) ?? null;
  }
  async updateUser(id: string, patch: Partial<UserRecord>) {
    const cur = this.users.get(id);
    if (!cur) throw new Error("user missing");
    const next = { ...cur, ...patch, id: cur.id };
    this.users.set(id, next);
    return { ...next };
  }
  async listGuestTelegramIdsForBroadcast() {
    return (await this.listBroadcastGuestCandidates()).map((guest) => guest.telegramId);
  }
  async listBroadcastGuestCandidates(): Promise<BroadcastGuestCandidate[]> {
    return [...this.users.values()]
      .filter((u) => u.role === "guest")
      .map((u) => ({
        id: u.id,
        telegramId: u.telegramId,
        balance: u.balance,
        birthday: u.birthday,
        broadcastOptOut: u.broadcastOptOut,
      }));
  }
  async listGuestIdsActiveSince(since: Date) {
    const visitIds = new Set(
      [...this.visits.values()].filter((v) => v.startedAt >= since).map((v) => v.userId),
    );
    for (const log of this.checkInLogs) {
      if (log.createdAt >= since) {
        visitIds.add(log.userId);
      }
    }
    return [...visitIds];
  }
  async listGuestIdsWithActiveCoupons(now: Date) {
    const ids = new Set<string>();
    for (const coupon of this.coupons.values()) {
      if (coupon.status === "active" && coupon.expiresAt > now) {
        ids.add(coupon.userId);
      }
    }
    return [...ids];
  }
  async listReferrerGuestIds() {
    return [...new Set([...this.referralActivations.values()].map((row) => row.referrerId))];
  }
  async listWeeklyAwardUserIds(weekStart: Date, maxPlace: number) {
    const ids: string[] = [];
    for (const [key, place] of this.awards) {
      if (!key.startsWith(`${weekStart.getTime()}:`) || place > maxPlace) {
        continue;
      }
      const userId = key.slice(key.indexOf(":") + 1);
      ids.push(userId);
    }
    return ids;
  }
  async listStaffTelegramIds() {
    return [...this.users.values()]
      .filter((u) => u.role === "master" || u.role === "admin")
      .map((u) => u.telegramId);
  }
  async listStaffMembers(): Promise<StaffMemberRecord[]> {
    return [...this.users.values()]
      .filter((u) => u.role === "master" || u.role === "admin")
      .map((u) => ({
        id: u.id,
        telegramId: u.telegramId,
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
      }))
      .sort((a, b) => a.role.localeCompare(b.role));
  }
  async listStaffWeeklySchedule(userId: string) {
    return [...this.staffWeeklySchedules.values()]
      .filter((row) => row.userId === userId)
      .sort((a, b) => a.weekday - b.weekday)
      .map((row) => ({ ...row }));
  }
  async listAllStaffWeeklySchedules() {
    return [...this.staffWeeklySchedules.values()].map((row) => ({ ...row }));
  }
  async replaceStaffWeeklySchedule(
    userId: string,
    slots: ReadonlyArray<{ weekday: number; startHour: number; endHour: number }>,
  ) {
    for (const [id, row] of this.staffWeeklySchedules) {
      if (row.userId === userId) {
        this.staffWeeklySchedules.delete(id);
      }
    }
    for (const slot of slots) {
      const row: StaffWeeklyScheduleRecord = {
        id: crypto.randomUUID(),
        userId,
        weekday: slot.weekday,
        startHour: slot.startHour,
        endHour: slot.endHour,
      };
      this.staffWeeklySchedules.set(row.id, row);
    }
    return this.listStaffWeeklySchedule(userId);
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
  async searchGuestsByUsername(username: string, limit: number) {
    const q = username.toLowerCase().replace(/^@/, "");
    return [...this.users.values()]
      .filter((u) => u.role === "guest" && (u.telegramUsername ?? "").toLowerCase().includes(q))
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
      .map((row) => {
        const guest = row.guestId !== null ? this.users.get(row.guestId) : undefined;
        return {
          ...row,
          guestFirstName: guest?.firstName ?? null,
          guestLastName: guest?.lastName ?? null,
          guestTelegramId: guest ? guest.telegramId.toString() : null,
          guestTelegramUsername: guest?.telegramUsername ?? null,
        };
      });
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
  async listVisitStartsForUser(userId: string) {
    return [...this.visits.values()]
      .filter((visit) => visit.userId === userId)
      .map((visit) => ({ startedAt: visit.startedAt }));
  }
  async listGuestDirectoryRows(now: Date) {
    const guests = [...this.users.values()].filter((user) => user.role === "guest");
    return Promise.all(
      guests.map(async (guest) => {
        const visit = await this.getActiveVisit(guest.id, now);
        const totalVisits = await this.countVisitsForUser(guest.id);
        const lastVisitAt = await this.lastVisitStartedAt(guest.id);
        return {
          id: guest.id,
          firstName: guest.firstName,
          lastName: guest.lastName,
          telegramUsername: guest.telegramUsername,
          phone: guest.phone,
          balance: guest.balance,
          totalVisits,
          lastVisitAt,
          visitActive: visit !== null,
          broadcastOptOut: guest.broadcastOptOut,
          createdAt: guest.createdAt,
        };
      }),
    );
  }
  async listUsersCreatedBetween(from: Date, to: Date) {
    return [...this.users.values()]
      .filter((user) => user.role === "guest" && user.createdAt >= from && user.createdAt <= to)
      .map((user) => ({ createdAt: user.createdAt }));
  }
  async listAcceptedGameSessionsBetween(from: Date, to: Date) {
    return this.gameSessionLogs
      .filter((row) => row.accepted && row.createdAt >= from && row.createdAt <= to)
      .map((row) => ({ createdAt: row.createdAt }));
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
    endsAt: Date;
    durationMinutes: number;
    partySize: number;
    comment: string | null;
    tableId?: string | null;
  }) {
    const row: BookingRequestRecord = {
      id: crypto.randomUUID(),
      status: "pending",
      handledBy: null,
      handledAt: null,
      seatedAt: null,
      tableAssignedAt: null,
      reminderSent: false,
      createdAt: new Date(),
      userId: input.userId,
      requestedFor: input.requestedFor,
      endsAt: input.endsAt,
      durationMinutes: input.durationMinutes,
      partySize: input.partySize,
      comment: input.comment,
      tableId: input.tableId ?? null,
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
  async listBookingsBetween(input: { from: Date; to: Date; status?: BookingStatus }) {
    return [...this.bookings.values()]
      .filter((booking) => {
        if (booking.requestedFor < input.from || booking.requestedFor > input.to) {
          return false;
        }
        if (input.status !== undefined && booking.status !== input.status) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.requestedFor.getTime() - b.requestedFor.getTime())
      .map((booking) => {
        const guest = this.users.get(booking.userId);
        const table = booking.tableId !== null ? this.venueTables.get(booking.tableId) : undefined;
        return {
          ...booking,
          guestFirstName: guest?.firstName ?? null,
          guestLastName: guest?.lastName ?? null,
          guestPhone: guest?.phone ?? null,
          tableLabel: table?.label ?? null,
        };
      });
  }

  async getActiveFloorPlan(): Promise<FloorPlanView | null> {
    const plan = [...this.floorPlans.values()].find((row) => row.active) ?? null;
    if (plan === null) {
      return null;
    }
    return {
      ...plan,
      tables: [...this.venueTables.values()]
        .filter((table) => table.floorPlanId === plan.id)
        .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "ru")),
      elements: [...this.floorElements.values()]
        .filter((element) => element.floorPlanId === plan.id)
        .sort((a, b) => a.sort - b.sort),
    };
  }

  async listFloorPlans() {
    return [...this.floorPlans.values()].map((row) => ({ ...row }));
  }

  async findFloorPlanById(id: string) {
    const row = this.floorPlans.get(id);
    return row ? { ...row } : null;
  }

  async upsertFloorPlan(input: {
    id?: string;
    name: string;
    width: number;
    height: number;
    backgroundImageUrl: string | null;
    active: boolean;
  }) {
    const id = input.id ?? crypto.randomUUID();
    if (input.active) {
      for (const plan of this.floorPlans.values()) {
        if (plan.id !== id) {
          plan.active = false;
        }
      }
    }
    const row: FloorPlanRecord = {
      id,
      name: input.name,
      width: input.width,
      height: input.height,
      backgroundImageUrl: input.backgroundImageUrl,
      active: input.active,
    };
    this.floorPlans.set(id, row);
    return { ...row };
  }

  async deleteFloorPlan(id: string) {
    this.floorPlans.delete(id);
    for (const table of [...this.venueTables.values()]) {
      if (table.floorPlanId === id) {
        this.venueTables.delete(table.id);
      }
    }
    for (const element of [...this.floorElements.values()]) {
      if (element.floorPlanId === id) {
        this.floorElements.delete(element.id);
      }
    }
  }

  async findTableById(id: string) {
    const row = this.venueTables.get(id);
    return row ? { ...row } : null;
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
  }) {
    const id = input.id ?? crypto.randomUUID();
    const row: VenueTableRecord = {
      id,
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
    this.venueTables.set(id, row);
    return { ...row };
  }

  async deleteVenueTable(id: string) {
    this.venueTables.delete(id);
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
  }) {
    const id = input.id ?? crypto.randomUUID();
    const row: FloorElementRecord = { id, ...input };
    this.floorElements.set(id, row);
    return { ...row };
  }

  async deleteFloorElement(id: string) {
    this.floorElements.delete(id);
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
  async listAllMenuItems() {
    return [...this.menu.values()].sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
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

  async createPromo(input: {
    body: string;
    photos: string[];
    showInFeed: boolean;
    broadcastSegment?: BroadcastSegmentId | null;
    broadcastRecipients?: number | null;
    broadcastSent?: number | null;
    broadcastFailed?: number | null;
  }) {
    const row: PromoRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      body: input.body,
      photos: input.photos,
      showInFeed: input.showInFeed,
      broadcastSegment: input.broadcastSegment ?? null,
      broadcastRecipients: input.broadcastRecipients ?? null,
      broadcastSent: input.broadcastSent ?? null,
      broadcastFailed: input.broadcastFailed ?? null,
    };
    this.promos.set(row.id, row);
    return row;
  }
  async updatePromo(
    id: string,
    patch: Partial<
      Pick<PromoRecord, "broadcastSegment" | "broadcastRecipients" | "broadcastSent" | "broadcastFailed">
    >,
  ) {
    const existing = this.promos.get(id);
    if (existing === undefined) {
      throw new Error("promo not found");
    }
    const row = { ...existing, ...patch };
    this.promos.set(id, row);
    return row;
  }
  async listFeedPromos() {
    return [...this.promos.values()].filter((p) => p.showInFeed);
  }
  async listPromos(limit: number) {
    return [...this.promos.values()]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  async createPromoRule(input: {
    promoId: string | null;
    kind: PromoRuleKind;
    params: Record<string, unknown>;
    active?: boolean;
    validFrom?: Date | null;
    validUntil?: Date | null;
    priority?: number;
  }) {
    const row: PromoRuleRecord = {
      id: crypto.randomUUID(),
      promoId: input.promoId,
      kind: input.kind,
      params: input.params,
      active: input.active ?? true,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      priority: input.priority ?? 0,
    };
    this.promoRules.set(row.id, row);
    return { ...row };
  }

  async listActivePromoRules(_now: Date) {
    return [...this.promoRules.values()]
      .filter((rule) => rule.active)
      .map((rule) => ({ ...rule }));
  }

  async hasReferralActivation(refereeId: string) {
    return [...this.referralActivations.values()].some((row) => row.refereeId === refereeId);
  }

  async createReferralActivation(input: {
    referrerId: string;
    refereeId: string;
    activatedAt: Date;
    visitId: string | null;
    ledgerIdReferrer: string | null;
    ledgerIdReferee: string | null;
  }) {
    const row: ReferralActivationRecord = { id: crypto.randomUUID(), ...input };
    this.referralActivations.set(row.id, row);
    return { ...row };
  }

  async getReferralStats(userId: string): Promise<ReferralStats> {
    const referred = [...this.users.values()].filter((u) => u.referredByUserId === userId);
    const activations = [...this.referralActivations.values()].filter((row) => row.referrerId === userId);
    const bonusesEarned = this.ledger
      .filter((row) => row.userId === userId && row.type === "referral" && row.amount > 0)
      .reduce((sum, row) => sum + row.amount, 0);
    return {
      invited: referred.length,
      activated: activations.length,
      bonusesEarned,
    };
  }

  async countReferralsActivatedBetween(from: Date, to: Date) {
    return [...this.referralActivations.values()].filter(
      (row) => row.activatedAt >= from && row.activatedAt <= to,
    ).length;
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
  async addWeeklyAward(weekStart: Date, userId: string, place: number) {
    this.awards.set(`${weekStart.getTime()}:${userId}`, place);
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
  }) {
    const row: GameSessionLogRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      ...input,
    };
    this.gameSessionLogs.push(row);
    return { ...row };
  }

  async listRecentGameSessionLogs(userId: string, gameId: string, limit: number) {
    return this.gameSessionLogs
      .filter((row) => row.userId === userId && row.gameId === gameId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  async countGameSessionsSince(userId: string, since: Date) {
    return this.gameSessionLogs.filter(
      (row) => row.userId === userId && row.createdAt >= since,
    ).length;
  }

  async getWeeklyGameScore(userId: string, gameId: string, weekStart: Date) {
    const week = [...this.weeks.values()].find(
      (row) => row.gameId === gameId && row.weekStart.getTime() === weekStart.getTime(),
    );
    if (week === undefined) {
      return null;
    }
    const score = this.scores.get(`${week.id}:${userId}`);
    return score?.points ?? null;
  }

  async listRejectedGameSessionLogs(limit: number) {
    return this.gameSessionLogs
      .filter((row) => !row.accepted)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  async countAcceptedGameSessionsBetween(from: Date, to: Date) {
    return this.gameSessionLogs.filter(
      (row) => row.accepted && row.createdAt >= from && row.createdAt <= to,
    ).length;
  }

  async countUniqueGamePlayersBetween(from: Date, to: Date) {
    const ids = new Set(
      this.gameSessionLogs
        .filter((row) => row.accepted && row.createdAt >= from && row.createdAt <= to)
        .map((row) => row.userId),
    );
    return ids.size;
  }

  async findActiveQuiz() {
    return [...this.quizzes.values()].find((quiz) => quiz.active) ?? null;
  }

  async findQuizById(id: string) {
    const row = this.quizzes.get(id);
    return row ? { ...row } : null;
  }

  async listQuizQuestions(quizId: string) {
    return [...this.quizQuestions.values()]
      .filter((question) => question.quizId === quizId)
      .sort((a, b) => a.sort - b.sort)
      .map((question) => ({ ...question }));
  }

  async createQuizQuestion(input: {
    quizId: string;
    sort: number;
    text: string;
    imageUrl?: string | null;
    options: string[];
    correctIndex: number;
  }) {
    const row: QuizQuestionRecord = {
      id: crypto.randomUUID(),
      imageUrl: input.imageUrl ?? null,
      ...input,
    };
    this.quizQuestions.set(row.id, row);
    return { ...row };
  }

  async updateQuizQuestion(
    id: string,
    patch: Partial<Pick<QuizQuestionRecord, "text" | "imageUrl" | "options" | "correctIndex" | "sort">>,
  ) {
    const current = this.quizQuestions.get(id);
    if (current === undefined) {
      throw new Error("question missing");
    }
    const next = { ...current, ...patch, id: current.id };
    this.quizQuestions.set(id, next);
    return { ...next };
  }

  async deleteQuizQuestion(id: string) {
    this.quizQuestions.delete(id);
  }

  async getLiveQuizSession(now: Date) {
    return (
      [...this.quizSessions.values()].find(
        (session) =>
          session.status === "live" && session.startedAt <= now && session.endsAt >= now,
      ) ?? null
    );
  }

  async findQuizSessionById(id: string) {
    const row = this.quizSessions.get(id);
    return row ? { ...row } : null;
  }

  async createQuizSession(input: {
    quizId: string;
    startedAt: Date;
    endsAt: Date;
    status: QuizSessionStatus;
  }) {
    const row: QuizSessionRecord = { id: crypto.randomUUID(), ...input };
    this.quizSessions.set(row.id, row);
    return { ...row };
  }

  async updateQuizSession(id: string, patch: Partial<Pick<QuizSessionRecord, "status">>) {
    const cur = this.quizSessions.get(id);
    if (cur === undefined) {
      throw new Error("quiz session missing");
    }
    const next = { ...cur, ...patch, id: cur.id };
    this.quizSessions.set(id, next);
    return { ...next };
  }

  async hasQuizAnswer(sessionId: string, questionId: string, userId: string) {
    return [...this.quizAnswers.values()].some(
      (row) =>
        row.sessionId === sessionId && row.questionId === questionId && row.userId === userId,
    );
  }

  async createQuizAnswer(input: {
    sessionId: string;
    questionId: string;
    userId: string;
    optionIndex: number;
    elapsedMs: number;
    points: number;
  }) {
    const row: QuizAnswerRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      ...input,
    };
    this.quizAnswers.set(row.id, row);
    return { ...row };
  }

  async sumQuizSessionPoints(sessionId: string, userId: string) {
    return [...this.quizAnswers.values()]
      .filter((row) => row.sessionId === sessionId && row.userId === userId)
      .reduce((sum, row) => sum + row.points, 0);
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
