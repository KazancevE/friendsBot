import { DomainError } from "./errors.ts";
import { maskPhone, normalizePhone } from "./phone.ts";
import type { UserRecord } from "./types.ts";
import type { Store } from "../store/types.ts";

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

export type GuestSearchHit = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneMasked: string | null;
  telegramUsername: string | null;
  telegramId: string;
  balance: number;
  visitActive: boolean;
};

const normalizeQuery = (raw: string) => {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
};

const fullName = (user: UserRecord) => {
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim().toLowerCase();
};

const rankMatch = (user: UserRecord, query: string): number => {
  const first = (user.firstName ?? "").trim().toLowerCase();
  const last = (user.lastName ?? "").trim().toLowerCase();
  const combined = fullName(user);
  const username = (user.telegramUsername ?? "").trim().toLowerCase();
  if (first === query || last === query || combined === query || username === query) {
    return 0;
  }
  if (
    first.startsWith(query) ||
    last.startsWith(query) ||
    combined.startsWith(query) ||
    username.startsWith(query)
  ) {
    return 1;
  }
  return 2;
};

const looksLikePhone = (query: string) => {
  return /^[\d+\s()-]{6,}$/.test(query);
};

const looksLikeTelegramId = (query: string) => {
  return /^\d{5,}$/.test(query);
};

const looksLikeUsername = (query: string) => {
  return query.startsWith("@") || /^[a-z0-9_]{3,}$/i.test(query);
};

export async function searchGuests(
  store: Store,
  input: { query: string; now: Date },
): Promise<GuestSearchHit[]> {
  const raw = input.query.trim();
  if (raw.length < MIN_QUERY_LENGTH) {
    throw new DomainError("query_too_short", "Введите минимум 2 символа");
  }

  let candidates: UserRecord[] = [];
  if (looksLikePhone(raw)) {
    try {
      const guest = await store.findUserByPhone(normalizePhone(raw));
      if (guest !== null) {
        candidates = [guest];
      }
    } catch {
      // fall through to name search
    }
  } else if (looksLikeTelegramId(raw)) {
    const guest = await store.findUserByTelegramId(BigInt(raw));
    if (guest !== null) {
      candidates = [guest];
    }
  } else if (looksLikeUsername(raw)) {
    const username = raw.replace(/^@/, "");
    candidates = await store.searchGuestsByUsername(username, MAX_RESULTS);
  }

  if (candidates.length === 0) {
    const query = normalizeQuery(raw);
    candidates = await store.searchGuestsByName(query, MAX_RESULTS * 3);
    const ranked = candidates
      .map((user) => ({ user, rank: rankMatch(user, query) }))
      .sort((a, b) => {
        if (a.rank !== b.rank) {
          return a.rank - b.rank;
        }
        return b.user.createdAt.getTime() - a.user.createdAt.getTime();
      })
      .slice(0, MAX_RESULTS);
    candidates = ranked.map((row) => row.user);
  }

  const hits: GuestSearchHit[] = [];
  for (const user of candidates.slice(0, MAX_RESULTS)) {
    const visit = await store.getActiveVisit(user.id, input.now);
    hits.push({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneMasked: maskPhone(user.phone),
      telegramUsername: user.telegramUsername,
      telegramId: user.telegramId.toString(),
      balance: user.balance,
      visitActive: visit !== null,
    });
  }
  return hits;
}

/** @deprecated use searchGuests */
export const searchGuestsByName = searchGuests;

export const guestSearchButtonLabel = (hit: GuestSearchHit) => {
  const name = `${hit.firstName ?? ""} ${hit.lastName ?? ""}`.trim() || "—";
  const phone = hit.phoneMasked ?? "—";
  const username = hit.telegramUsername ? `@${hit.telegramUsername}` : null;
  return username !== null ? `${name} · ${username} · ${phone}` : `${name} · ${phone}`;
};
