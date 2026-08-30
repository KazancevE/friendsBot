import { DateTime } from "luxon";
import { maskPhone } from "./phone.ts";
import type { GuestListFilter, GuestListRow, GuestListSort } from "./types.ts";
import { MOSCOW } from "./week.ts";
import type { Store } from "../store/types.ts";

export type GuestListPage = {
  guests: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    telegramUsername: string | null;
    phoneMasked: string | null;
    balance: number;
    totalVisits: number;
    lastVisitAt: string | null;
    visitActive: boolean;
    broadcastOptOut: boolean;
    createdAt: string;
  }>;
  total: number;
  offset: number;
  limit: number;
};

const compareNullableDates = (left: Date | null, right: Date | null, order: "asc" | "desc") => {
  const leftMs = left?.getTime() ?? 0;
  const rightMs = right?.getTime() ?? 0;
  return order === "asc" ? leftMs - rightMs : rightMs - leftMs;
};

const matchesFilter = async (
  store: Store,
  row: GuestListRow,
  filter: GuestListFilter | undefined,
  now: Date,
): Promise<boolean> => {
  if (filter === undefined) {
    return true;
  }
  if (filter === "in_venue") {
    return row.visitActive;
  }
  if (filter === "opt_out") {
    return row.broadcastOptOut;
  }
  if (filter === "inactive_30d") {
    const since = DateTime.fromJSDate(now, { zone: MOSCOW }).minus({ days: 30 }).toJSDate();
    if (row.lastVisitAt === null) {
      return true;
    }
    return row.lastVisitAt < since;
  }
  if (filter === "has_coupon") {
    const withCoupons = new Set(await store.listGuestIdsWithActiveCoupons(now));
    return withCoupons.has(row.id);
  }
  return true;
};

const sortRows = (rows: GuestListRow[], sort: GuestListSort, order: "asc" | "desc") => {
  const direction = order === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (sort === "lastVisitAt") {
      return direction * compareNullableDates(left.lastVisitAt, right.lastVisitAt, order);
    }
    if (sort === "createdAt") {
      return direction * (left.createdAt.getTime() - right.createdAt.getTime());
    }
    if (sort === "balance") {
      return direction * (left.balance - right.balance);
    }
    return direction * (left.totalVisits - right.totalVisits);
  });
};

export async function listGuestsPage(
  store: Store,
  input: {
    limit: number;
    offset: number;
    sort: GuestListSort;
    order: "asc" | "desc";
    filter?: GuestListFilter;
    now: Date;
  },
): Promise<GuestListPage> {
  const limit = Math.min(Math.max(input.limit, 1), 100);
  const offset = Math.max(input.offset, 0);
  const rows = await store.listGuestDirectoryRows(input.now);
  const filtered: GuestListRow[] = [];
  for (const row of rows) {
    if (await matchesFilter(store, row, input.filter, input.now)) {
      filtered.push(row);
    }
  }
  const sorted = sortRows(filtered, input.sort, input.order);
  const page = sorted.slice(offset, offset + limit);
  return {
    guests: page.map((guest) => ({
      id: guest.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      telegramUsername: guest.telegramUsername,
      phoneMasked: guest.phone === null ? null : maskPhone(guest.phone),
      balance: guest.balance,
      totalVisits: guest.totalVisits,
      lastVisitAt: guest.lastVisitAt?.toISOString() ?? null,
      visitActive: guest.visitActive,
      broadcastOptOut: guest.broadcastOptOut,
      createdAt: guest.createdAt.toISOString(),
    })),
    total: sorted.length,
    offset,
    limit,
  };
}
