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
  closeWeek(weekId: string, at: Date): Promise<void>;
  hasWeeklyAward(weekId: string, userId: string): Promise<boolean>;
  addWeeklyAward(weekId: string, userId: string, place: number): Promise<void>;

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
