export type Role = "guest" | "master" | "admin";

export type LedgerType =
  | "check"
  | "manual"
  | "registration"
  | "birthday"
  | "weekly_prize"
  | "redeem"
  | "coupon_redeem"
  | "expire"
  | "referral"
  | "promo_bonus";

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
  checkInNotifyEnabled: boolean;
  checkInNotifyTelegramIds: bigint[];
  referralBonusReferrer: number;
  referralBonusReferee: number;
  referralActivationDays: number;
  referralEnabled: boolean;
  birthdayNotifyDaysBefore: number;
  birthdayCouponTitle: string | null;
  birthdayCouponClaimDays: number;
  maxSessionsPerHour: number;
  bookingHoursStart: number;
  bookingHoursEnd: number;
  bookingSlotMinutes: number;
  bookingClosedWeekdays: number[];
  bookingDurationMinutes: number;
};

export type BroadcastSegmentId =
  | "all"
  | "inactive_30d"
  | "active_7d"
  | "balance_gt"
  | "has_coupon"
  | "birthday_week"
  | "referrers"
  | "weekly_top";

export type PromoRuleKind =
  | "double_check_bonus"
  | "min_check_bonus"
  | "weekday_multiplier"
  | "promo_code";

export type PromoRuleRecord = {
  id: string;
  promoId: string | null;
  kind: PromoRuleKind;
  params: Record<string, unknown>;
  active: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  priority: number;
};

export type ReferralActivationRecord = {
  id: string;
  referrerId: string;
  refereeId: string;
  activatedAt: Date;
  visitId: string | null;
  ledgerIdReferrer: string | null;
  ledgerIdReferee: string | null;
};

export type ReferralStats = {
  invited: number;
  activated: number;
  bonusesEarned: number;
};

export type StaffActionKind =
  | "check"
  | "redeem"
  | "manual_adjust"
  | "visit_open"
  | "visit_extend"
  | "visit_close"
  | "coupon_redeem"
  | "guest_search"
  | "booking_table_assign"
  | "booking_table_move"
  | "booking_table_swap";

export type StaffActionLogRecord = {
  id: string;
  actorId: string;
  guestId: string | null;
  action: StaffActionKind;
  payload: Record<string, unknown>;
  createdAt: Date;
  guestFirstName?: string | null;
  guestLastName?: string | null;
  guestTelegramId?: string | null;
  guestTelegramUsername?: string | null;
};

export type StaffWeeklyScheduleRecord = {
  id: string;
  userId: string;
  weekday: number;
  startHour: number;
  endHour: number;
};

export type StaffMemberRecord = {
  id: string;
  telegramId: bigint;
  role: Role;
  firstName: string | null;
  lastName: string | null;
};

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "seated"
  | "cancelled"
  | "completed"
  | "no_show";

export type BookingRequestRecord = {
  id: string;
  userId: string;
  tableId: string | null;
  requestedFor: Date;
  endsAt: Date | null;
  durationMinutes: number | null;
  partySize: number;
  comment: string | null;
  status: BookingStatus;
  handledBy: string | null;
  handledAt: Date | null;
  seatedAt: Date | null;
  tableAssignedAt: Date | null;
  reminderSent: boolean;
  createdAt: Date;
};

export type BookingListRow = BookingRequestRecord & {
  guestFirstName: string | null;
  guestLastName: string | null;
  guestPhone: string | null;
  tableLabel: string | null;
};

export type FloorPlanRecord = {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundImageUrl: string | null;
  active: boolean;
};

export type VenueTableRecord = {
  id: string;
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
};

export type FloorElementKind = "bar" | "obstacle" | "wall" | "decor";

export type FloorElementRecord = {
  id: string;
  floorPlanId: string;
  kind: FloorElementKind;
  label: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  sort: number;
};

export type FloorPlanView = FloorPlanRecord & {
  tables: VenueTableRecord[];
  elements: FloorElementRecord[];
};

export type AvailableBookingSlot = {
  hour: number;
  minute: number;
  requestedFor: Date;
  freeTables: number;
};

export type AvailableTableSlot = VenueTableRecord & {
  free: boolean;
};

export type UserRecord = {
  id: string;
  telegramId: bigint;
  telegramUsername: string | null;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  birthday: Date | null;
  phone: string | null;
  balance: number;
  qrToken: string;
  broadcastOptOut: boolean;
  staffNote: string | null;
  referralCode: string | null;
  referredByUserId: string | null;
  birthdayWarnedYear: number | null;
  birthdayGreetedYear: number | null;
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
  imageUrl: string | null;
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

export type GameSessionLogRecord = {
  id: string;
  userId: string;
  gameId: string;
  slug: string;
  points: number;
  startedAt: Date;
  endedAt: Date;
  accepted: boolean;
  rejectReason: string | null;
  createdAt: Date;
};

export type QuizSessionStatus = "draft" | "live" | "closed";

export type QuizRecord = {
  id: string;
  title: string;
  active: boolean;
  showInHub: boolean;
};

export type QuizQuestionRecord = {
  id: string;
  quizId: string;
  sort: number;
  text: string;
  imageUrl: string | null;
  options: string[];
  correctIndex: number;
};

export type QuizSessionRecord = {
  id: string;
  quizId: string;
  startedAt: Date;
  endsAt: Date;
  status: QuizSessionStatus;
};

export type QuizAnswerRecord = {
  id: string;
  sessionId: string;
  questionId: string;
  userId: string;
  optionIndex: number;
  elapsedMs: number;
  points: number;
  createdAt: Date;
};

export type ContactEntry = {
  label: string;
  value: string;
  description?: string;
};

export type ContentPageRecord = {
  slug: "contacts" | "directions" | "game_rules";
  body: string;
  mapUrl: string | null;
};
