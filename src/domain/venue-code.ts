import { randomInt } from "node:crypto";
import { DateTime } from "luxon";
import { nanoid } from "nanoid";
import { DomainError } from "./errors.ts";
import type { VenueCodeRecord } from "./types.ts";
import { MOSCOW } from "./week.ts";
import type { Store } from "../store/types.ts";

export const VENUE_CODE_HOURS = 2;
export const VENUE_QR_PREFIX = "friends://checkin?t=";

export const scheduledSlotStart = (at: Date) => {
  const local = DateTime.fromJSDate(at).setZone(MOSCOW);
  const evenHour = local.hour - (local.hour % VENUE_CODE_HOURS);
  return local.set({ hour: evenHour, minute: 0, second: 0, millisecond: 0 }).toJSDate();
};

export const slotEndFromStart = (slotStart: Date) => {
  return DateTime.fromJSDate(slotStart).setZone(MOSCOW).plus({ hours: VENUE_CODE_HOURS }).toJSDate();
};

export const newVenuePin = () => {
  return String(randomInt(0, 10_000)).padStart(4, "0");
};

export const newVenueToken = () => {
  return nanoid(24);
};

export const venueQrPayload = (token: string) => {
  return `${VENUE_QR_PREFIX}${token}`;
};

export const parseVenueToken = (raw: string) => {
  const trimmed = raw.trim();
  if (trimmed.startsWith(VENUE_QR_PREFIX)) {
    return trimmed.slice(VENUE_QR_PREFIX.length);
  }
  const queryMatch = /[?&]t=([^&]+)/.exec(trimmed);
  if (queryMatch?.[1] !== undefined) {
    return queryMatch[1];
  }
  return trimmed;
};

const isActive = (code: VenueCodeRecord, now: Date) => {
  return code.revokedAt === null && code.validFrom <= now && now < code.validUntil;
};

export async function getActiveVenueCode(store: Store, now: Date) {
  return store.findActiveVenueCode(now);
}

async function generateUniquePin(_store: Store) {
  return newVenuePin();
}

export async function createVenueCode(
  store: Store,
  input: { validFrom: Date; validUntil: Date; createdBy: string | null; now: Date },
) {
  return store.withTransaction(async (tx) => {
    await tx.revokeActiveVenueCodes(input.now);
    const pin = await generateUniquePin(tx);
    return tx.createVenueCode({
      pin,
      token: newVenueToken(),
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      createdBy: input.createdBy,
      createdAt: input.now,
    });
  });
}

export async function rotateScheduledVenueCode(store: Store, now: Date) {
  const validFrom = scheduledSlotStart(now);
  const validUntil = slotEndFromStart(validFrom);
  const current = await store.findActiveVenueCode(now);
  if (current !== null && current.validFrom.getTime() === validFrom.getTime()) {
    return current;
  }
  return createVenueCode(store, { validFrom, validUntil, createdBy: null, now });
}

export async function regenerateVenueCode(store: Store, actorId: string, now: Date) {
  const validFrom = now;
  const validUntil = DateTime.fromJSDate(now).plus({ hours: VENUE_CODE_HOURS }).toJSDate();
  return createVenueCode(store, { validFrom, validUntil, createdBy: actorId, now });
}

export async function ensureActiveVenueCode(store: Store, now: Date) {
  const current = await store.findActiveVenueCode(now);
  if (current !== null) {
    return current;
  }
  return rotateScheduledVenueCode(store, now);
}

export async function resolveVenueCodeForCheckIn(
  store: Store,
  input: { method: "qr" | "pin"; token?: string; pin?: string; now: Date },
) {
  const active = await ensureActiveVenueCode(store, input.now);
  if (input.method === "qr") {
    const token = input.token?.trim();
    if (token === undefined || token.length === 0) {
      throw new DomainError("bad_request", "Нужен код QR");
    }
    const parsed = parseVenueToken(token);
    if (parsed !== active.token) {
      throw new DomainError("bad_code", "Неверный или устаревший код");
    }
    return active;
  }
  const pin = input.pin?.trim();
  if (pin === undefined || !/^\d{4}$/.test(pin)) {
    throw new DomainError("bad_request", "Введите 4 цифры");
  }
  if (pin !== active.pin) {
    throw new DomainError("bad_code", "Неверный или устаревший код");
  }
  if (!isActive(active, input.now)) {
    throw new DomainError("bad_code", "Неверный или устаревший код");
  }
  return active;
}
