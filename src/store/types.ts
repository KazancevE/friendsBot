import type {
  ActiveVisitRow,
  BonusLotRecord,
  BookingRequestRecord,
  BookingStatus,
  CheckInLogRecord,
  ContentPageRecord,
  CouponRecord,
  GameRecord,
  AggregatedScoreRecord,
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
  searchGuestsByName(query: string, limit: number): Promise<UserRecord[]>;
  updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord>;
  listGuestTelegramIdsForBroadcast(): Promise<bigint[]>;
  listStaffTelegramIds(): Promise<bigint[]>;
  countRegistrationsBetween(from: Date, to: Date): Promise<number>;

  createStaffActionLog(input: {
    actorId: string;
    guestId: string | null;
    action: StaffActionKind;
    payload: Record<string, unknown>;
  }): Promise<StaffActionLogRecord>;
  listStaffActionLog(input: {
    from: Date;
    to: Date;
    actorId?: string;
    limit: number;
    offset: number;
  }): Promise<StaffActionLogRecord[]>;
  countStaffActionsBetween(from: Date, to: Date): Promise<number>;

  countVisitsForUser(userId: string): Promise<number>;
  lastVisitStartedAt(userId: string): Promise<Date | null>;
  hasCheckInToday(userId: string, now: Date): Promise<boolean>;
  countVisitsBetween(from: Date, to: Date): Promise<number>;
  countUniqueGuestsWithVisitBetween(from: Date, to: Date): Promise<number>;
  countCheckInsBetween(from: Date, to: Date): Promise<number>;
  listVisitsBetween(from: Date, to: Date): Promise<VisitRecord[]>;
  listCheckInsBetween(from: Date, to: Date): Promise<CheckInLogRecord[]>;
  listLedgerBetween(from: Date, to: Date): Promise<LedgerRecord[]>;
  listCouponsBetween(from: Date, to: Date): Promise<CouponRecord[]>;
  sumActiveBonusLotRemaining(now: Date): Promise<number>;

  createBookingRequest(input: {
    userId: string;
    requestedFor: Date;
    partySize: number;
    comment: string | null;
  }): Promise<BookingRequestRecord>;
  findBookingById(id: string): Promise<BookingRequestRecord | null>;
  findPendingBookingForUser(userId: string): Promise<BookingRequestRecord | null>;
  updateBooking(
    id: string,
    patch: Partial<
      Pick<BookingRequestRecord, "status" | "handledBy" | "handledAt" | "reminderSent">
    >,
  ): Promise<BookingRequestRecord>;
  listBookingsNeedingReminder(now: Date): Promise<BookingRequestRecord[]>;
  listPendingBookings(): Promise<BookingRequestRecord[]>;

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

  createBonusLot(input: {
    userId: string;
    ledgerId: string | null;
    category: "gift" | "check";
    initial: number;
    remaining: number;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<BonusLotRecord>;
  listBonusLots(userId: string): Promise<BonusLotRecord[]>;
  listBonusLotsWithRemaining(): Promise<BonusLotRecord[]>;
  updateBonusLot(
    id: string,
    patch: Partial<Pick<BonusLotRecord, "remaining" | "warned7d" | "warned3d" | "warned1d" | "expiresAt">>,
  ): Promise<BonusLotRecord>;
  findBonusLotByLedgerId(ledgerId: string): Promise<BonusLotRecord | null>;

  getActiveVisit(userId: string, now: Date): Promise<VisitRecord | null>;
  createVisit(input: {
    userId: string;
    openedBy: string;
    startedAt: Date;
    endsAt: Date;
  }): Promise<VisitRecord>;
  updateVisitEndsAt(id: string, endsAt: Date): Promise<VisitRecord>;
  listActiveVisits(now: Date): Promise<ActiveVisitRow[]>;

  revokeActiveVenueCodes(now: Date): Promise<void>;
  createVenueCode(input: {
    pin: string;
    token: string;
    validFrom: Date;
    validUntil: Date;
    createdBy: string | null;
    createdAt: Date;
  }): Promise<VenueCodeRecord>;
  findActiveVenueCode(now: Date): Promise<VenueCodeRecord | null>;
  findVenueCodeByToken(token: string): Promise<VenueCodeRecord | null>;
  createCheckInLog(input: {
    userId: string;
    venueCodeId: string;
    visitId: string;
    method: "qr" | "pin";
    createdAt: Date;
  }): Promise<CheckInLogRecord>;
  findLatestCheckInForVisit(visitId: string): Promise<CheckInLogRecord | null>;

  listMenu(): Promise<MenuItemRecord[]>;
  upsertMenuItem(item: Omit<MenuItemRecord, "id"> & { id?: string }): Promise<MenuItemRecord>;
  deleteMenuItem(id: string): Promise<void>;
  getPage(slug: "contacts" | "directions" | "game_rules"): Promise<ContentPageRecord | null>;
  upsertPage(page: ContentPageRecord): Promise<ContentPageRecord>;

  createPromo(input: { body: string; photos: string[]; showInFeed: boolean }): Promise<PromoRecord>;
  listFeedPromos(): Promise<PromoRecord[]>;

  listActiveGames(): Promise<GameRecord[]>;
  findGameBySlug(slug: string): Promise<GameRecord | null>;
  listOpenWeeks(): Promise<GameWeekRecord[]>;
  getOrCreateOpenWeek(gameId: string, weekStart: Date): Promise<GameWeekRecord>;
  addScore(weekId: string, userId: string, delta: number, at: Date): Promise<GameScoreRecord>;
  listWeekScores(weekId: string): Promise<GameScoreRecord[]>;
  listAggregatedWeekScores(weekStart: Date): Promise<AggregatedScoreRecord[]>;
  closeWeek(weekId: string, at: Date): Promise<void>;
  hasWeeklyAward(weekStart: Date, userId: string): Promise<boolean>;
  addWeeklyAward(weekStart: Date, userId: string, place: number): Promise<void>;

  createCoupon(input: {
    userId: string;
    title: string;
    weekId: string | null;
    expiresAt: Date;
  }): Promise<CouponRecord>;
  listActiveCoupons(userId: string): Promise<CouponRecord[]>;
  findCoupon(id: string): Promise<CouponRecord | null>;
  redeemCoupon(id: string, by: string, at: Date): Promise<CouponRecord>;
  expireCoupons(now: Date): Promise<number>;

  withTransaction<T>(fn: (store: Store) => Promise<T>): Promise<T>;
}
