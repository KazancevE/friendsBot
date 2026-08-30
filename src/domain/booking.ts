import { DateTime } from "luxon";
import { bookingSlotStarts, isBookingDayClosed } from "./booking-slots.ts";
import {
  assertTableAvailable,
  bookingDurationMinutes,
  listAvailableBookingSlots,
  listAvailableTablesForSlot,
} from "./booking-availability.ts";
import { DomainError } from "./errors.ts";
import type { Store } from "../store/types.ts";
import { MOSCOW } from "./week.ts";

export { bookingSlotStarts, isBookingDayClosed, moscowDayRange } from "./booking-slots.ts";
export { listAvailableBookingSlots, listAvailableTablesForSlot } from "./booking-availability.ts";
export { getActiveFloorPlanView } from "./floor-plan.ts";

export const formatBookingSlot = (at: Date) => {
  return DateTime.fromJSDate(at, { zone: MOSCOW }).toFormat("dd.MM.yyyy HH:mm");
};

export async function loadBookingSlots(store: Store) {
  const settings = await store.getSettings();
  return bookingSlotStarts(settings);
}

export async function createBookingRequest(
  store: Store,
  input: {
    userId: string;
    requestedFor: Date;
    partySize: number;
    comment: string | null;
    tableId?: string | null;
    now: Date;
  },
) {
  if (input.partySize < 1 || input.partySize > 20) {
    throw new DomainError("bad_amount", "Количество гостей от 1 до 20");
  }
  const pending = await store.findPendingBookingForUser(input.userId);
  if (pending !== null) {
    throw new DomainError("booking_pending_exists", "У вас уже есть заявка на бронь");
  }
  const settings = await store.getSettings();
  const requested = DateTime.fromJSDate(input.requestedFor, { zone: MOSCOW });
  if (requested <= DateTime.fromJSDate(input.now, { zone: MOSCOW })) {
    throw new DomainError("bad_request", "Выберите время в будущем");
  }
  if (isBookingDayClosed(requested, settings)) {
    throw new DomainError("bad_request", "В этот день бронь недоступна");
  }

  const available = await listAvailableBookingSlots(store, {
    day: input.requestedFor,
    partySize: input.partySize,
    now: input.now,
  });
  const matchesSlot = available.some(
    (slot) => slot.requestedFor.getTime() === input.requestedFor.getTime(),
  );
  if (!matchesSlot) {
    throw new DomainError("bad_request", "Выберите доступный слот");
  }

  let tableId: string | null = input.tableId ?? null;
  if (tableId !== null) {
    try {
      await assertTableAvailable(store, {
        tableId,
        requestedFor: input.requestedFor,
        partySize: input.partySize,
      });
    } catch {
      throw new DomainError("bad_request", "Стол недоступен в это время");
    }
  }

  const duration = bookingDurationMinutes(settings);
  const endsAt = new Date(input.requestedFor.getTime() + duration * 60 * 1000);

  return store.createBookingRequest({
    userId: input.userId,
    requestedFor: input.requestedFor,
    endsAt,
    durationMinutes: duration,
    partySize: input.partySize,
    comment: input.comment,
    tableId,
  });
}

async function requireStaff(store: Store, actorId: string) {
  const actor = await store.findUserById(actorId);
  if (!actor || (actor.role !== "master" && actor.role !== "admin")) {
    throw new DomainError("forbidden", "Недостаточно прав");
  }
  return actor;
}

export async function handleBookingRequest(
  store: Store,
  input: {
    bookingId: string;
    actorId: string;
    status: "confirmed" | "cancelled";
    now: Date;
  },
) {
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const booking = await tx.findBookingById(input.bookingId);
    if (booking === null) {
      throw new DomainError("not_found", "Заявка не найдена");
    }
    if (booking.status !== "pending") {
      throw new DomainError("bad_request", "Заявка уже обработана");
    }
    if (input.status === "confirmed" && booking.tableId !== null) {
      try {
        await assertTableAvailable(tx, {
          tableId: booking.tableId,
          requestedFor: booking.requestedFor,
          partySize: booking.partySize,
          excludeBookingId: booking.id,
        });
      } catch {
        throw new DomainError("bad_request", "Стол уже занят");
      }
    }
    return tx.updateBooking(booking.id, {
      status: input.status,
      handledBy: input.actorId,
      handledAt: input.now,
      tableAssignedAt: input.status === "confirmed" && booking.tableId !== null ? input.now : null,
    });
  });
}

export async function assignTableToBooking(
  store: Store,
  input: { bookingId: string; tableId: string; actorId: string; now: Date },
) {
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const booking = await tx.findBookingById(input.bookingId);
    if (booking === null) {
      throw new DomainError("not_found", "Заявка не найдена");
    }
    if (booking.status === "cancelled" || booking.status === "completed" || booking.status === "no_show") {
      throw new DomainError("bad_request", "Нельзя назначить стол");
    }
    try {
      await assertTableAvailable(tx, {
        tableId: input.tableId,
        requestedFor: booking.requestedFor,
        partySize: booking.partySize,
        excludeBookingId: booking.id,
      });
    } catch {
      throw new DomainError("bad_request", "Стол недоступен");
    }
    const updated = await tx.updateBooking(booking.id, {
      tableId: input.tableId,
      tableAssignedAt: input.now,
    });
    await tx.createStaffActionLog({
      actorId: input.actorId,
      guestId: booking.userId,
      action: "booking_table_assign",
      payload: { bookingId: booking.id, tableId: input.tableId },
    });
    return updated;
  });
}

export async function moveBookingTable(
  store: Store,
  input: { bookingId: string; tableId: string; actorId: string; now: Date },
) {
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const booking = await tx.findBookingById(input.bookingId);
    if (booking === null) {
      throw new DomainError("not_found", "Заявка не найдена");
    }
    if (booking.status !== "confirmed" && booking.status !== "seated") {
      throw new DomainError("bad_request", "Пересадка только для активной брони");
    }
    if (booking.tableId === input.tableId) {
      throw new DomainError("bad_request", "Стол уже назначен");
    }
    try {
      await assertTableAvailable(tx, {
        tableId: input.tableId,
        requestedFor: booking.requestedFor,
        partySize: booking.partySize,
        excludeBookingId: booking.id,
      });
    } catch {
      throw new DomainError("bad_request", "Стол недоступен");
    }
    const fromTableId = booking.tableId;
    const updated = await tx.updateBooking(booking.id, {
      tableId: input.tableId,
      tableAssignedAt: input.now,
    });
    await tx.createStaffActionLog({
      actorId: input.actorId,
      guestId: booking.userId,
      action: "booking_table_move",
      payload: { bookingId: booking.id, fromTableId, toTableId: input.tableId },
    });
    return updated;
  });
}

export async function swapBookingTables(
  store: Store,
  input: { bookingIdA: string; bookingIdB: string; actorId: string; now: Date },
) {
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const [a, b] = await Promise.all([
      tx.findBookingById(input.bookingIdA),
      tx.findBookingById(input.bookingIdB),
    ]);
    if (a === null || b === null) {
      throw new DomainError("not_found", "Бронь не найдена");
    }
    if (a.id === b.id) {
      throw new DomainError("bad_request", "Выберите две разные брони");
    }
    for (const booking of [a, b]) {
      if (booking.status !== "confirmed" && booking.status !== "seated") {
        throw new DomainError("bad_request", "Обмен только для активных броней");
      }
      if (booking.tableId === null) {
        throw new DomainError("bad_request", "У обеих броней должен быть стол");
      }
    }
    const tableA = a.tableId!;
    const tableB = b.tableId!;
    await tx.updateBooking(a.id, { tableId: tableB, tableAssignedAt: input.now });
    await tx.updateBooking(b.id, { tableId: tableA, tableAssignedAt: input.now });
    await tx.createStaffActionLog({
      actorId: input.actorId,
      guestId: null,
      action: "booking_table_swap",
      payload: { bookingIdA: a.id, bookingIdB: b.id, tableA, tableB },
    });
    const updatedA = await tx.findBookingById(a.id);
    const updatedB = await tx.findBookingById(b.id);
    return { a: updatedA!, b: updatedB! };
  });
}

export async function markBookingSeated(
  store: Store,
  input: { bookingId: string; actorId: string; now: Date },
) {
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const booking = await tx.findBookingById(input.bookingId);
    if (booking === null) {
      throw new DomainError("not_found", "Заявка не найдена");
    }
    if (booking.status !== "confirmed") {
      throw new DomainError("bad_request", "Посадка только для подтверждённой брони");
    }
    return tx.updateBooking(booking.id, {
      status: "seated",
      seatedAt: input.now,
    });
  });
}

export async function listBookingsForMoscowDay(store: Store, at: Date) {
  const local = DateTime.fromJSDate(at, { zone: MOSCOW });
  return store.listBookingsBetween({
    from: local.startOf("day").toJSDate(),
    to: local.endOf("day").toJSDate(),
  });
}

export async function runBookingReminders(store: Store, api: import("grammy").Api, now: Date) {
  const due = await store.listBookingsNeedingReminder(now);
  for (const booking of due) {
    const guest = await store.findUserById(booking.userId);
    if (guest === null) {
      continue;
    }
    const table = booking.tableId !== null ? await store.findTableById(booking.tableId) : null;
    const tablePart = table !== null ? `, стол ${table.label}` : "";
    try {
      await api.sendMessage(
        guest.telegramId.toString(),
        `Напоминание: бронь на ${formatBookingSlot(booking.requestedFor)}${tablePart}, ${booking.partySize} чел.`,
      );
      await store.updateBooking(booking.id, { reminderSent: true });
    } catch {
      // skip failed delivery
    }
  }
}
