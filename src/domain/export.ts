import { DateTime } from "luxon";
import type { StaffActionLogRecord } from "./types.ts";
import { staffActionLabel } from "./stats.ts";
import { MOSCOW } from "./week.ts";
import type { Store } from "../store/types.ts";

export type ExportType = "ledger" | "visits" | "checkins" | "coupons" | "staff_log";

export const EXPORT_ROW_LIMIT = 10_000;

const escapeCsv = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

const formatDate = (value: Date) => {
  return DateTime.fromJSDate(value, { zone: MOSCOW }).toFormat("yyyy-MM-dd HH:mm:ss");
};

export async function exportCsv(
  store: Store,
  input: { type: ExportType; from: Date; to: Date },
): Promise<string> {
  switch (input.type) {
    case "ledger":
      return exportLedger(store, input.from, input.to);
    case "visits":
      return exportVisits(store, input.from, input.to);
    case "checkins":
      return exportCheckIns(store, input.from, input.to);
    case "coupons":
      return exportCoupons(store, input.from, input.to);
    case "staff_log":
      return exportStaffLog(store, input.from, input.to);
    default: {
      const _exhaustive: never = input.type;
      throw new Error(`Unknown export type: ${_exhaustive}`);
    }
  }
}

export async function exportRowCount(
  store: Store,
  input: { type: ExportType; from: Date; to: Date },
): Promise<number> {
  switch (input.type) {
    case "ledger":
      return (await store.listLedgerBetween(input.from, input.to)).length;
    case "visits":
      return (await store.listVisitsBetween(input.from, input.to)).length;
    case "checkins":
      return (await store.listCheckInsBetween(input.from, input.to)).length;
    case "coupons":
      return (await store.listCouponsBetween(input.from, input.to)).length;
    case "staff_log":
      return store.countStaffActionsBetween(input.from, input.to);
    default: {
      const _exhaustive: never = input.type;
      throw new Error(`Unknown export type: ${_exhaustive}`);
    }
  }
}

async function exportLedger(store: Store, from: Date, to: Date) {
  const rows = await store.listLedgerBetween(from, to);
  const lines = ["date,userId,guestName,type,amount,actorId,comment,checkAmount"];
  for (const row of rows) {
    const guest = await store.findUserById(row.userId);
    const name = guest ? `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim() : "";
    lines.push(
      [
        formatDate(row.createdAt),
        row.userId,
        name,
        row.type,
        row.amount,
        row.actorId ?? "",
        row.comment ?? "",
        row.checkAmount ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }
  return lines.join("\n");
}

async function exportVisits(store: Store, from: Date, to: Date) {
  const rows = await store.listVisitsBetween(from, to);
  const lines = ["startedAt,endsAt,guestId,guestName,openedBy,durationMinutes"];
  for (const row of rows) {
    const guest = await store.findUserById(row.userId);
    const name = guest ? `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim() : "";
    const duration = Math.round((row.endsAt.getTime() - row.startedAt.getTime()) / 60000);
    lines.push(
      [
        formatDate(row.startedAt),
        formatDate(row.endsAt),
        row.userId,
        name,
        row.openedBy,
        duration,
      ]
        .map(escapeCsv)
        .join(","),
    );
  }
  return lines.join("\n");
}

async function exportCheckIns(store: Store, from: Date, to: Date) {
  const rows = await store.listCheckInsBetween(from, to);
  const lines = ["date,guestId,guestName,method,visitId"];
  for (const row of rows) {
    const guest = await store.findUserById(row.userId);
    const name = guest ? `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim() : "";
    lines.push(
      [formatDate(row.createdAt), row.userId, name, row.method, row.visitId].map(escapeCsv).join(","),
    );
  }
  return lines.join("\n");
}

async function exportCoupons(store: Store, from: Date, to: Date) {
  const rows = await store.listCouponsBetween(from, to);
  const lines = ["title,guestId,guestName,status,expiresAt,redeemedAt,redeemedBy"];
  for (const row of rows) {
    const guest = await store.findUserById(row.userId);
    const name = guest ? `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim() : "";
    lines.push(
      [
        row.title,
        row.userId,
        name,
        row.status,
        formatDate(row.expiresAt),
        row.redeemedAt === null ? "" : formatDate(row.redeemedAt),
        row.redeemedBy ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }
  return lines.join("\n");
}

async function exportStaffLog(store: Store, from: Date, to: Date) {
  const rows = await store.listStaffActionLog({ from, to, limit: 10000, offset: 0 });
  const lines = ["date,actorId,actorName,action,guestId,guestName,payload"];
  for (const row of rows) {
    const cells = await formatStaffLogRow(store, row);
    lines.push(cells.map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

async function formatStaffLogRow(store: Store, row: StaffActionLogRecord) {
  const actor = await store.findUserById(row.actorId);
  const guest = row.guestId === null ? null : await store.findUserById(row.guestId);
  const actorName = actor ? `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim() : "";
  const guestName = guest ? `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim() : "";
  return [
    formatDate(row.createdAt),
    row.actorId,
    actorName,
    staffActionLabel(row.action),
    row.guestId ?? "",
    guestName,
    JSON.stringify(row.payload),
  ];
}
