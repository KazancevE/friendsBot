import { DateTime } from "luxon";
import type { LedgerType, StaffActionKind } from "./types.ts";
import { MOSCOW } from "./week.ts";
import type { Store } from "../store/types.ts";

export type StatsPeriod = {
  from: Date;
  to: Date;
};

export type StatsSummary = {
  period: StatsPeriod;
  registrations: number;
  visits: number;
  uniqueGuestsWithVisit: number;
  checkIns: number;
  bonusesCredited: number;
  bonusesRedeemed: number;
  bonusesExpired: number;
  bonusLiability: number;
  averageCheckRubles: number | null;
  staffActions: number;
  referralActivations: number;
};

export const periodToday = (now: Date): StatsPeriod => {
  const start = DateTime.fromJSDate(now, { zone: MOSCOW }).startOf("day");
  return { from: start.toJSDate(), to: now };
};

export const periodLastDays = (now: Date, days: number): StatsPeriod => {
  const end = DateTime.fromJSDate(now, { zone: MOSCOW });
  const start = end.minus({ days: days - 1 }).startOf("day");
  return { from: start.toJSDate(), to: now };
};

const creditTypes = new Set<LedgerType>([
  "check",
  "manual",
  "registration",
  "birthday",
  "weekly_prize",
]);

export async function getStatsSummary(store: Store, period: StatsPeriod, now: Date): Promise<StatsSummary> {
  const [
    registrations,
    visits,
    uniqueGuestsWithVisit,
    checkIns,
    ledgerRows,
    bonusLiability,
    staffActions,
    referralActivations,
  ] = await Promise.all([
    store.countRegistrationsBetween(period.from, period.to),
    store.countVisitsBetween(period.from, period.to),
    store.countUniqueGuestsWithVisitBetween(period.from, period.to),
    store.countCheckInsBetween(period.from, period.to),
    store.listLedgerBetween(period.from, period.to),
    store.sumActiveBonusLotRemaining(now),
    store.countStaffActionsBetween(period.from, period.to),
    store.countReferralsActivatedBetween(period.from, period.to),
  ]);

  let bonusesCredited = 0;
  let bonusesRedeemed = 0;
  let bonusesExpired = 0;
  let checkTotal = 0;
  let checkCount = 0;
  for (const row of ledgerRows) {
    if (creditTypes.has(row.type) && row.amount > 0) {
      bonusesCredited += row.amount;
    }
    if (row.type === "redeem") {
      bonusesRedeemed += -row.amount;
    }
    if (row.type === "expire") {
      bonusesExpired += -row.amount;
    }
    if (row.type === "check" && row.checkAmount !== null && row.checkAmount > 0) {
      checkTotal += row.checkAmount;
      checkCount += 1;
    }
  }

  return {
    period,
    registrations,
    visits,
    uniqueGuestsWithVisit,
    checkIns,
    bonusesCredited,
    bonusesRedeemed,
    bonusesExpired,
    bonusLiability,
    averageCheckRubles: checkCount > 0 ? Math.round(checkTotal / checkCount) : null,
    staffActions,
    referralActivations,
  };
};

export const formatStatsSummary = (summary: StatsSummary): string => {
  const from = DateTime.fromJSDate(summary.period.from, { zone: MOSCOW }).toFormat("dd.MM.yyyy");
  const to = DateTime.fromJSDate(summary.period.to, { zone: MOSCOW }).toFormat("dd.MM.yyyy HH:mm");
  return [
    `📊 Статистика (${from} — ${to})`,
    "",
    `Новых регистраций: ${summary.registrations}`,
    `Визитов: ${summary.visits} (уникальных гостей: ${summary.uniqueGuestsWithVisit})`,
    `Check-in: ${summary.checkIns}`,
    "",
    `Начислено бонусов: ${summary.bonusesCredited}`,
    `Списано бонусов: ${summary.bonusesRedeemed}`,
    `Сгорело бонусов: ${summary.bonusesExpired}`,
    `Обязательства (liability): ${summary.bonusLiability}`,
    summary.averageCheckRubles === null
      ? "Средний чек: —"
      : `Средний чек: ${summary.averageCheckRubles} ₽`,
    "",
    `Действий персонала: ${summary.staffActions}`,
    `Активаций рефералов: ${summary.referralActivations}`,
  ].join("\n");
};

export const staffActionLabel = (action: StaffActionKind): string => {
  switch (action) {
    case "check":
      return "чек";
    case "redeem":
      return "списание";
    case "manual_adjust":
      return "ручная правка";
    case "visit_open":
      return "открыт визит";
    case "visit_extend":
      return "продлён визит";
    case "coupon_redeem":
      return "купон";
    case "guest_search":
      return "поиск";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
};
