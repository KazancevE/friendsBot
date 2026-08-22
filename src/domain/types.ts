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
