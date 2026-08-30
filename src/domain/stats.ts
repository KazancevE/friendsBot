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
  gameSessions: number;
  uniqueGamePlayers: number;
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
    gameSessions,
    uniqueGamePlayers,
  ] = await Promise.all([
    store.countRegistrationsBetween(period.from, period.to),
    store.countVisitsBetween(period.from, period.to),
    store.countUniqueGuestsWithVisitBetween(period.from, period.to),
    store.countCheckInsBetween(period.from, period.to),
    store.listLedgerBetween(period.from, period.to),
    store.sumActiveBonusLotRemaining(now),
    store.countStaffActionsBetween(period.from, period.to),
    store.countReferralsActivatedBetween(period.from, period.to),
    store.countAcceptedGameSessionsBetween(period.from, period.to),
    store.countUniqueGamePlayersBetween(period.from, period.to),
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
    gameSessions,
    uniqueGamePlayers,
  };
};

export type StatsMetric = "visits" | "bonuses" | "checkins";

export type StatsTimeseriesPoint = {
  date: string;
  value: number;
};

export type StatsStaffRow = {
  actorId: string;
  name: string;
  actions: number;
};

const moscowDayKey = (date: Date) => DateTime.fromJSDate(date, { zone: MOSCOW }).toFormat("yyyy-MM-dd");

const dayKeysInPeriod = (period: StatsPeriod): string[] => {
  const start = DateTime.fromJSDate(period.from, { zone: MOSCOW }).startOf("day");
  const end = DateTime.fromJSDate(period.to, { zone: MOSCOW }).startOf("day");
  const keys: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    keys.push(cursor.toFormat("yyyy-MM-dd"));
    cursor = cursor.plus({ days: 1 });
  }
  return keys;
};

export async function getStatsTimeseries(
  store: Store,
  input: { period: StatsPeriod; metric: StatsMetric },
): Promise<{ points: StatsTimeseriesPoint[] }> {
  const keys = dayKeysInPeriod(input.period);
  const buckets = new Map(keys.map((key) => [key, 0]));

  if (input.metric === "visits") {
    const rows = await store.listVisitsBetween(input.period.from, input.period.to);
    for (const row of rows) {
      const key = moscowDayKey(row.startedAt);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    }
  }

  if (input.metric === "checkins") {
    const rows = await store.listCheckInsBetween(input.period.from, input.period.to);
    for (const row of rows) {
      const key = moscowDayKey(row.createdAt);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    }
  }

  if (input.metric === "bonuses") {
    const rows = await store.listLedgerBetween(input.period.from, input.period.to);
    for (const row of rows) {
      if (creditTypes.has(row.type) && row.amount > 0) {
        const key = moscowDayKey(row.createdAt);
        if (buckets.has(key)) {
          buckets.set(key, (buckets.get(key) ?? 0) + row.amount);
        }
      }
    }
  }

  return {
    points: keys.map((date) => ({ date, value: buckets.get(date) ?? 0 })),
  };
}

export async function getStatsStaff(
  store: Store,
  period: StatsPeriod,
): Promise<{ rows: StatsStaffRow[] }> {
  const logs = await store.listStaffActionLog({
    from: period.from,
    to: period.to,
    limit: 10_000,
    offset: 0,
  });
  const counts = new Map<string, number>();
  for (const row of logs) {
    counts.set(row.actorId, (counts.get(row.actorId) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 10);
  const rows = await Promise.all(
    ranked.map(async ([actorId, actions]) => {
      const user = await store.findUserById(actorId);
      const name =
        user === null
          ? actorId
          : `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || actorId;
      return { actorId, name, actions };
    }),
  );
  return { rows };
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
    "",
    `Игровых партий: ${summary.gameSessions}`,
    `Уникальных игроков: ${summary.uniqueGamePlayers}`,
  ].join("\n");
};

export async function formatStatsDetails(store: Store, period: StatsPeriod): Promise<string> {
  const [visitsSeries, staff] = await Promise.all([
    getStatsTimeseries(store, { period, metric: "visits" }),
    getStatsStaff(store, period),
  ]);
  const dayLines = visitsSeries.points
    .filter((point) => point.value > 0)
    .map((point) => `  ${point.date.slice(5)}: ${point.value} визитов`)
    .join("\n");
  const staffLines =
    staff.rows.length === 0
      ? "  —"
      : staff.rows
          .slice(0, 5)
          .map((row, index) => `  ${index + 1}. ${row.name} — ${row.actions}`)
          .join("\n");
  return ["📈 По дням (визиты):", dayLines || "  —", "", "👥 Топ персонала:", staffLines].join("\n");
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
