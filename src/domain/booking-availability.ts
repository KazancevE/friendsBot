import { DateTime } from "luxon";
import { bookingSlotStarts, isBookingDayClosed, venueDayRangeFor } from "./booking-slots.ts";
import type {
  AvailableBookingSlot,
  AvailableTableSlot,
  BookingRequestRecord,
  Settings,
  VenueTableRecord,
} from "./types.ts";
import type { Store } from "../store/types.ts";
import { venueDateTime } from "./venue-time.ts";

const OCCUPYING_STATUSES = new Set<BookingRequestRecord["status"]>(["confirmed", "seated"]);

export const bookingDurationMinutes = (settings: Settings) => settings.bookingDurationMinutes;

export const bookingInterval = (
  booking: Pick<BookingRequestRecord, "requestedFor" | "endsAt" | "durationMinutes">,
  settings: Settings,
) => {
  const start = booking.requestedFor;
  const duration = booking.durationMinutes ?? bookingDurationMinutes(settings);
  const end = booking.endsAt ?? new Date(start.getTime() + duration * 60 * 1000);
  return { start, end, durationMinutes: duration };
};

export const intervalsOverlap = (
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
) => a.start < b.end && b.start < a.end;

export const tableFitsParty = (table: VenueTableRecord, partySize: number) => {
  return table.active && partySize >= table.seatsMin && partySize <= table.seatsMax;
};

export const isTableOccupied = (
  tableId: string,
  interval: { start: Date; end: Date },
  bookings: BookingRequestRecord[],
  settings: Settings,
  excludeBookingId?: string,
) => {
  return bookings.some((booking) => {
    if (booking.id === excludeBookingId) {
      return false;
    }
    if (booking.tableId !== tableId || !OCCUPYING_STATUSES.has(booking.status)) {
      return false;
    }
    return intervalsOverlap(interval, bookingInterval(booking, settings));
  });
};

export const listFreeTablesForInterval = (
  tables: VenueTableRecord[],
  partySize: number,
  interval: { start: Date; end: Date },
  bookings: BookingRequestRecord[],
  settings: Settings,
  excludeBookingId?: string,
) => {
  return tables.filter(
    (table) =>
      tableFitsParty(table, partySize) &&
      !isTableOccupied(table.id, interval, bookings, settings, excludeBookingId),
  );
};

export const buildAvailableSlots = (
  settings: Settings,
  day: DateTime,
  partySize: number,
  tables: VenueTableRecord[],
  bookings: BookingRequestRecord[],
  now: Date,
): AvailableBookingSlot[] => {
  if (isBookingDayClosed(day, settings)) {
    return [];
  }
  const slots: AvailableBookingSlot[] = [];
  const configured = bookingSlotStarts(settings);
  for (const slot of configured) {
    const requestedFor = day
      .set({ hour: slot.hour % 24, minute: slot.minute, second: 0, millisecond: 0 })
      .toJSDate();
    if (requestedFor <= now) {
      continue;
    }
    if (tables.length === 0) {
      slots.push({
        hour: slot.hour,
        minute: slot.minute,
        requestedFor,
        freeTables: 0,
      });
      continue;
    }
    const interval = {
      start: requestedFor,
      end: new Date(requestedFor.getTime() + bookingDurationMinutes(settings) * 60 * 1000),
    };
    const freeTables = listFreeTablesForInterval(tables, partySize, interval, bookings, settings);
    if (freeTables.length === 0) {
      continue;
    }
    slots.push({
      hour: slot.hour,
      minute: slot.minute,
      requestedFor,
      freeTables: freeTables.length,
    });
  }
  return slots;
};

export const buildAvailableTablesForSlot = (
  settings: Settings,
  requestedFor: Date,
  partySize: number,
  tables: VenueTableRecord[],
  bookings: BookingRequestRecord[],
  excludeBookingId?: string,
): AvailableTableSlot[] => {
  const interval = {
    start: requestedFor,
    end: new Date(requestedFor.getTime() + bookingDurationMinutes(settings) * 60 * 1000),
  };
  return tables
    .filter((table) => tableFitsParty(table, partySize))
    .map((table) => ({
      ...table,
      free: !isTableOccupied(table.id, interval, bookings, settings, excludeBookingId),
    }))
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "ru"));
};

export async function loadDayBookings(store: Store, day: Date, settings: Settings) {
  const { from, to } = venueDayRangeFor(day, settings);
  return store.listBookingsBetween({ from, to });
}

export async function listAvailableBookingSlots(
  store: Store,
  input: { day: Date; partySize: number; now: Date },
) {
  const [settings, floorPlan] = await Promise.all([
    store.getSettings(),
    store.getActiveFloorPlan(),
  ]);
  const bookings = await loadDayBookings(store, input.day, settings);
  const day = venueDateTime(input.day, settings);
  const tables = floorPlan?.tables ?? [];
  return buildAvailableSlots(settings, day, input.partySize, tables, bookings, input.now);
}

export async function listAvailableTablesForSlot(
  store: Store,
  input: { requestedFor: Date; partySize: number; excludeBookingId?: string },
) {
  const [settings, floorPlan] = await Promise.all([
    store.getSettings(),
    store.getActiveFloorPlan(),
  ]);
  const bookings = await loadDayBookings(store, input.requestedFor, settings);
  const tables = floorPlan?.tables ?? [];
  return buildAvailableTablesForSlot(
    settings,
    input.requestedFor,
    input.partySize,
    tables,
    bookings,
    input.excludeBookingId,
  );
}

export async function assertTableAvailable(
  store: Store,
  input: {
    tableId: string;
    requestedFor: Date;
    partySize: number;
    excludeBookingId?: string;
  },
) {
  const table = await store.findTableById(input.tableId);
  if (table === null || !table.active) {
    throw new Error("table_not_found");
  }
  if (!tableFitsParty(table, input.partySize)) {
    throw new Error("table_party_mismatch");
  }
  const [settings, bookings] = await Promise.all([
    store.getSettings(),
    store.getSettings().then((resolved) => loadDayBookings(store, input.requestedFor, resolved)),
  ]);
  const interval = {
    start: input.requestedFor,
    end: new Date(input.requestedFor.getTime() + bookingDurationMinutes(settings) * 60 * 1000),
  };
  if (isTableOccupied(table.id, interval, bookings, settings, input.excludeBookingId)) {
    throw new Error("table_occupied");
  }
  return table;
}
