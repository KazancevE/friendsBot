import { initData } from "./telegram.ts";

export type Role = "guest" | "master" | "admin";

export type Me = {
  readonly role: Role;
  readonly balance: number;
  readonly visitActive: boolean;
};

export type GuestCoupon = {
  readonly id: string;
  readonly title: string;
};

export type GuestCard = {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly phone: string | null;
  readonly balance: number;
  readonly qrToken: string;
  readonly visitActive: boolean;
  readonly coupons: ReadonlyArray<GuestCoupon>;
};

export type CheckResult = {
  readonly balance: number;
  readonly bonus: number;
};

export type RedeemResult = {
  readonly balance: number;
};

type ApiError = {
  readonly kind: "error";
  readonly status: number;
  readonly code: string;
  readonly message: string;
};

type ApiOk<T> = {
  readonly kind: "ok";
  readonly data: T;
};

export type ApiResult<T> = ApiOk<T> | ApiError;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isRole = (value: unknown): value is Role => {
  return value === "guest" || value === "master" || value === "admin";
};

const isMe = (value: unknown): value is Me => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isRole(value.role) &&
    typeof value.balance === "number" &&
    typeof value.visitActive === "boolean"
  );
};

const isGuestCoupon = (value: unknown): value is GuestCoupon => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === "string" && typeof value.title === "string";
};

const isGuestCard = (value: unknown): value is GuestCard => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    (value.firstName === null || typeof value.firstName === "string") &&
    (value.lastName === null || typeof value.lastName === "string") &&
    (value.phone === null || typeof value.phone === "string") &&
    typeof value.balance === "number" &&
    typeof value.qrToken === "string" &&
    typeof value.visitActive === "boolean" &&
    Array.isArray(value.coupons) &&
    value.coupons.every(isGuestCoupon)
  );
};

const isCheckResult = (value: unknown): value is CheckResult => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.balance === "number" && typeof value.bonus === "number";
};

const isRedeemResult = (value: unknown): value is RedeemResult => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.balance === "number";
};

const parseError = async (res: Response): Promise<ApiError> => {
  const parsed: unknown = await res.json().catch(() => ({}));
  if (!isRecord(parsed)) {
    return { kind: "error", status: res.status, code: "bad_response", message: "Ошибка" };
  }
  const code = typeof parsed.code === "string" ? parsed.code : "error";
  const message = typeof parsed.message === "string" ? parsed.message : "Ошибка";
  return { kind: "error", status: res.status, code, message };
};

const postJson = async <T>(
  path: string,
  body: Record<string, unknown>,
  guard: (value: unknown) => value is T,
): Promise<ApiResult<T>> => {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return parseError(res);
  }
  const parsed: unknown = await res.json();
  if (!guard(parsed)) {
    return { kind: "error", status: res.status, code: "bad_response", message: "Некорректный ответ" };
  }
  return { kind: "ok", data: parsed };
};

const getJson = async <T>(
  path: string,
  guard: (value: unknown) => value is T,
): Promise<ApiResult<T>> => {
  const res = await fetch(path, {
    headers: {
      "X-Telegram-Init-Data": initData(),
    },
  });
  if (!res.ok) {
    return parseError(res);
  }
  const parsed: unknown = await res.json();
  if (!guard(parsed)) {
    return { kind: "error", status: res.status, code: "bad_response", message: "Некорректный ответ" };
  }
  return { kind: "ok", data: parsed };
};

export const fetchMe = () => {
  return postJson("/api/me", {}, isMe);
};

export type LeaderboardEntry = {
  readonly place: number;
  readonly userId: string;
  readonly points: number;
  readonly displayName?: string;
};

export type Leaderboard = {
  readonly me: {
    readonly place: number | null;
    readonly points: number;
  };
  readonly top: ReadonlyArray<LeaderboardEntry>;
};

const isLeaderboardEntry = (value: unknown): value is LeaderboardEntry => {
  if (!isRecord(value)) {
    return false;
  }
  const displayNameOk =
    value.displayName === undefined || typeof value.displayName === "string";
  return (
    typeof value.place === "number" &&
    typeof value.userId === "string" &&
    typeof value.points === "number" &&
    displayNameOk
  );
};

const isLeaderboard = (value: unknown): value is Leaderboard => {
  if (!isRecord(value) || !isRecord(value.me) || !Array.isArray(value.top)) {
    return false;
  }
  const placeOk = value.me.place === null || typeof value.me.place === "number";
  return (
    placeOk &&
    typeof value.me.points === "number" &&
    value.top.every(isLeaderboardEntry)
  );
};

export const fetchLeaderboard = (slug: string) => {
  const params = new URLSearchParams({ slug });
  return getJson(`/api/games/leaderboard?${params.toString()}`, isLeaderboard);
};

export type PrizePlace = {
  readonly place: number;
  readonly bonuses: number;
  readonly couponTitle: string | null;
};

export type GameRules = {
  readonly winnersCount: number;
  readonly prizeTable: ReadonlyArray<PrizePlace>;
  readonly body: string;
};

const isPrizePlace = (value: unknown): value is PrizePlace => {
  if (!isRecord(value)) {
    return false;
  }
  const couponOk = value.couponTitle === null || typeof value.couponTitle === "string";
  return (
    typeof value.place === "number" &&
    typeof value.bonuses === "number" &&
    couponOk
  );
};

const isGameRules = (value: unknown): value is GameRules => {
  if (!isRecord(value) || !Array.isArray(value.prizeTable)) {
    return false;
  }
  return (
    typeof value.winnersCount === "number" &&
    typeof value.body === "string" &&
    value.prizeTable.every(isPrizePlace)
  );
};

export const fetchGameRules = () => {
  return getJson("/api/games/rules", isGameRules);
};

type SubmitGameScoreParameters = {
  readonly slug: string;
  readonly points: number;
};

export type SubmitGameScoreResult = {
  readonly points: number;
  readonly counted: boolean;
};

const isSubmitGameScoreResult = (value: unknown): value is SubmitGameScoreResult => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.points === "number" && typeof value.counted === "boolean";
};

export const submitGameScore = ({ slug, points }: SubmitGameScoreParameters) => {
  return postJson("/api/games/score", { slug, points }, isSubmitGameScoreResult);
};

type LookupGuestParameters = {
  readonly phone?: string;
  readonly qrToken?: string;
};

export const lookupGuest = ({ phone, qrToken }: LookupGuestParameters) => {
  return postJson("/api/cashier/lookup", { phone, qrToken }, isGuestCard);
};

type ApplyCheckParameters = {
  readonly phone?: string;
  readonly qrToken?: string;
  readonly checkRubles: number;
};

export const applyCheck = ({ phone, qrToken, checkRubles }: ApplyCheckParameters) => {
  return postJson("/api/cashier/check", { phone, qrToken, checkRubles }, isCheckResult);
};

type RedeemParameters = {
  readonly phone?: string;
  readonly qrToken?: string;
  readonly amount: number;
};

export const redeemBonuses = ({ phone, qrToken, amount }: RedeemParameters) => {
  return postJson("/api/cashier/redeem", { phone, qrToken, amount }, isRedeemResult);
};

type OpenVisitParameters = {
  readonly phone?: string;
  readonly qrToken?: string;
};

export const openVisit = ({ phone, qrToken }: OpenVisitParameters) => {
  return postJson(
    "/api/cashier/visit",
    { phone, qrToken },
    (value): value is { readonly visitActive: boolean } => {
      return isRecord(value) && typeof value.visitActive === "boolean";
    },
  );
};

type ManualAdjustParameters = {
  readonly phone?: string;
  readonly qrToken?: string;
  readonly delta: number;
  readonly comment: string;
};

export const manualAdjust = ({ phone, qrToken, delta, comment }: ManualAdjustParameters) => {
  return postJson("/api/cashier/manual", { phone, qrToken, delta, comment }, isRedeemResult);
};

type RedeemCouponParameters = {
  readonly couponId: string;
};

const isCouponRedeemResult = (value: unknown): value is { readonly id: string; readonly status: string } => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === "string" && typeof value.status === "string";
};

export const redeemCoupon = ({ couponId }: RedeemCouponParameters) => {
  return postJson("/api/cashier/coupon/redeem", { couponId }, isCouponRedeemResult);
};
