export type Role = "guest" | "master" | "admin";

export type LedgerType =
  | "check"
  | "manual"
  | "registration"
  | "birthday"
  | "weekly_prize"
  | "redeem"
  | "coupon_redeem"
  | "expire";

export type BonusLotCategory = "gift" | "check";

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
  checkBonusTtlDays: number;
  giftBonusTtlDays: number;
  couponClaimDaysDefault: number;
  couponClaimDays: number;
  expireNotifyMinBonuses: number;
};

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

export type CheckInMethod = "qr" | "pin";

export type VenueCodeRecord = {
  id: string;
  pin: string;
  token: string;
  validFrom: Date;
  validUntil: Date;
  revokedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
};

export type CheckInLogRecord = {
  id: string;
  userId: string;
  venueCodeId: string;
  visitId: string;
  method: CheckInMethod;
  createdAt: Date;
};

export type ActiveVisitRow = {
  visitId: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  startedAt: Date;
  endsAt: Date;
  checkInMethod: CheckInMethod | null;
};

export type CouponRecord = {
  id: string;
  userId: string;
  title: string;
  weekId: string | null;
  status: "active" | "redeemed" | "expired";
  expiresAt: Date;
  redeemedBy: string | null;
  redeemedAt: Date | null;
};

export type BonusLotRecord = {
  id: string;
  userId: string;
  ledgerId: string | null;
  category: BonusLotCategory;
  initial: number;
  remaining: number;
  expiresAt: Date;
  createdAt: Date;
  warned7d: boolean;
  warned3d: boolean;
  warned1d: boolean;
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

export type AggregatedScoreRecord = {
  userId: string;
  points: number;
  updatedAt: Date;
};

export type MenuItemRecord = {
  id: string;
  title: string;
  description: string;
  priceRubles: number | null;
  imageFileId: string | null;
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
  slug: "contacts" | "directions" | "game_rules";
  body: string;
  mapUrl: string | null;
};
