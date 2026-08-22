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
