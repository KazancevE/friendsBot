import { DateTime } from "luxon";
import { DomainError } from "./errors.ts";
import type { Store } from "../store/types.ts";
import { MOSCOW } from "./week.ts";

const BOOKING_HOURS = { start: 18, end: 26 } as const;
const SLOT_MINUTES = 30;

export const bookingSlotStarts = () => {
  const slots: Array<{ hour: number; minute: number }> = [];
  for (let hour = BOOKING_HOURS.start; hour < BOOKING_HOURS.end; hour += 1) {
    for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
      slots.push({ hour, minute });
    }
  }
  return slots;
};

export const formatBookingSlot = (at: Date) => {
  return DateTime.fromJSDate(at, { zone: MOSCOW }).toFormat("dd.MM.yyyy HH:mm");
};

export async function createBookingRequest(
  store: Store,
  input: {
    userId: string;
    requestedFor: Date;
    partySize: number;
    comment: string | null;
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
  const requested = DateTime.fromJSDate(input.requestedFor, { zone: MOSCOW });
  if (requested <= DateTime.fromJSDate(input.now, { zone: MOSCOW })) {
    throw new DomainError("bad_request", "Выберите время в будущем");
  }
  return store.createBookingRequest({
    userId: input.userId,
    requestedFor: input.requestedFor,
    partySize: input.partySize,
    comment: input.comment,
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
    return tx.updateBooking(booking.id, {
      status: input.status,
      handledBy: input.actorId,
      handledAt: input.now,
    });
  });
}

export async function runBookingReminders(store: Store, api: import("grammy").Api, now: Date) {
  const due = await store.listBookingsNeedingReminder(now);
  for (const booking of due) {
    const guest = await store.findUserById(booking.userId);
    if (guest === null) {
      continue;
    }
    try {
      await api.sendMessage(
        guest.telegramId.toString(),
        `Напоминание: бронь на ${formatBookingSlot(booking.requestedFor)}, ${booking.partySize} чел.`,
      );
      await store.updateBooking(booking.id, { reminderSent: true });
    } catch {
      // skip failed delivery
    }
  }
}
