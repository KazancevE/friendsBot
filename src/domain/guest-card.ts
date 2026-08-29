import { DateTime } from "luxon";
import { daysUntilBirthday, isBirthdayWeek } from "./birthday.ts";
import type { BonusLotCategory, UserRecord } from "./types.ts";
import { MOSCOW } from "./week.ts";
import type { Store } from "../store/types.ts";

export type LotSummary = {
  category: BonusLotCategory;
  remaining: number;
  expiresAt: Date;
};

export type StaffGuestCard = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  balance: number;
  qrToken: string;
  visitActive: boolean;
  visitEndsAt: Date | null;
  coupons: Array<{ id: string; title: string }>;
  totalVisits: number;
  lastVisitAt: Date | null;
  checkedInToday: boolean;
  lotSummaries: LotSummary[];
  birthday: Date | null;
  birthdayWeek: boolean;
  birthdayDaysUntil: number | null;
  staffNote: string | null;
  broadcastOptOut: boolean;
};

const summarizeLots = (
  lots: Awaited<ReturnType<Store["listBonusLots"]>>,
  now: Date,
): LotSummary[] => {
  const active = lots.filter((lot) => lot.remaining > 0 && lot.expiresAt > now);
  const byCategory = new Map<BonusLotCategory, LotSummary>();
  for (const lot of active) {
    const current = byCategory.get(lot.category);
    if (current === undefined) {
      byCategory.set(lot.category, {
        category: lot.category,
        remaining: lot.remaining,
        expiresAt: lot.expiresAt,
      });
      continue;
    }
    current.remaining += lot.remaining;
    if (lot.expiresAt < current.expiresAt) {
      current.expiresAt = lot.expiresAt;
    }
  }
  return [...byCategory.values()].sort((a, b) => a.category.localeCompare(b.category));
};

export async function buildStaffGuestCard(
  store: Store,
  guest: UserRecord,
  now: Date,
): Promise<StaffGuestCard> {
  const visit = await store.getActiveVisit(guest.id, now);
  const coupons = await store.listActiveCoupons(guest.id);
  const lots = await store.listBonusLots(guest.id);
  const totalVisits = await store.countVisitsForUser(guest.id);
  const lastVisitAt = await store.lastVisitStartedAt(guest.id);
  const checkedInToday = await store.hasCheckInToday(guest.id, now);
  return {
    id: guest.id,
    firstName: guest.firstName,
    lastName: guest.lastName,
    phone: guest.phone,
    balance: guest.balance,
    qrToken: guest.qrToken,
    visitActive: visit !== null,
    visitEndsAt: visit?.endsAt ?? null,
    coupons: coupons.map((coupon) => ({ id: coupon.id, title: coupon.title })),
    totalVisits,
    lastVisitAt,
    checkedInToday,
    lotSummaries: summarizeLots(lots, now),
    birthday: guest.birthday,
    birthdayWeek: guest.birthday !== null ? isBirthdayWeek(guest.birthday, now) : false,
    birthdayDaysUntil:
      guest.birthday !== null ? daysUntilBirthday(guest.birthday, now) : null,
    staffNote: guest.staffNote,
    broadcastOptOut: guest.broadcastOptOut,
  };
};

const formatMoscowDate = (value: Date) => {
  return DateTime.fromJSDate(value, { zone: MOSCOW }).toFormat("dd.MM.yyyy");
};

const formatMoscowDateTime = (value: Date) => {
  return DateTime.fromJSDate(value, { zone: MOSCOW }).toFormat("dd.MM.yyyy HH:mm");
};

const lotCategoryLabel = (category: BonusLotCategory) => {
  return category === "gift" ? "подарочных" : "чековых";
};

export const formatStaffGuestCard = (card: StaffGuestCard): string => {
  const name = `${card.firstName ?? ""} ${card.lastName ?? ""}`.trim() || "—";
  const coupons =
    card.coupons.length > 0 ? card.coupons.map((coupon) => coupon.title).join(", ") : "нет";
  const visitLine = card.visitActive
    ? card.visitEndsAt === null
      ? "да"
      : `да (до ${formatMoscowDateTime(card.visitEndsAt)})`
    : "нет";
  const lotLines =
    card.lotSummaries.length === 0
      ? []
      : card.lotSummaries.map(
          (lot) =>
            `${lot.remaining} ${lotCategoryLabel(lot.category)} (до ${formatMoscowDate(lot.expiresAt)})`,
        );
  const birthdayLine =
    card.birthday === null
      ? null
      : card.birthdayWeek
        ? `🎂 Неделя ДР (${formatMoscowDate(card.birthday)})`
        : card.birthdayDaysUntil !== null && card.birthdayDaysUntil <= 14
          ? `🎂 ДР через ${card.birthdayDaysUntil} дн. (${formatMoscowDate(card.birthday)})`
          : `ДР: ${formatMoscowDate(card.birthday)}`;
  const lines = [
    `ФИО: ${name}`,
    `Телефон: ${card.phone ?? "—"}`,
    `Баланс: ${card.balance}`,
    ...lotLines.map((line) => `  · ${line}`),
    `Визит: ${visitLine}`,
    `Визитов всего: ${card.totalVisits}`,
    card.lastVisitAt === null
      ? "Последний визит: —"
      : `Последний визит: ${formatMoscowDateTime(card.lastVisitAt)}`,
    `Check-in сегодня: ${card.checkedInToday ? "да" : "нет"}`,
    `Купоны: ${coupons}`,
    `Рассылка: ${card.broadcastOptOut ? "отключена" : "включена"}`,
  ];
  if (birthdayLine !== null) {
    lines.push(birthdayLine);
  }
  if (card.staffNote !== null && card.staffNote.trim().length > 0) {
    lines.push(`Заметка: ${card.staffNote.trim()}`);
  }
  return lines.join("\n");
};
