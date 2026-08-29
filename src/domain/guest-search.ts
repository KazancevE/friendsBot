import { DomainError } from "./errors.ts";
import { maskPhone } from "./phone.ts";
import type { UserRecord } from "./types.ts";
import type { Store } from "../store/types.ts";

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

export type GuestSearchHit = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneMasked: string | null;
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
  if (first === query || last === query || combined === query) {
    return 0;
  }
  if (first.startsWith(query) || last.startsWith(query) || combined.startsWith(query)) {
    return 1;
  }
  return 2;
};

export async function searchGuestsByName(
  store: Store,
  input: { query: string; now: Date },
): Promise<GuestSearchHit[]> {
  const query = normalizeQuery(input.query);
  if (query.length < MIN_QUERY_LENGTH) {
    throw new DomainError("query_too_short", "Введите минимум 2 символа");
  }
  const candidates = await store.searchGuestsByName(query, MAX_RESULTS * 3);
  const ranked = candidates
    .map((user) => ({ user, rank: rankMatch(user, query) }))
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      return b.user.createdAt.getTime() - a.user.createdAt.getTime();
    })
    .slice(0, MAX_RESULTS);

  const hits: GuestSearchHit[] = [];
  for (const { user } of ranked) {
    const visit = await store.getActiveVisit(user.id, input.now);
    hits.push({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneMasked: maskPhone(user.phone),
      balance: user.balance,
      visitActive: visit !== null,
    });
  }
  return hits;
}

export const guestSearchButtonLabel = (hit: GuestSearchHit) => {
  const name = `${hit.firstName ?? ""} ${hit.lastName ?? ""}`.trim() || "—";
  const phone = hit.phoneMasked ?? "—";
  return `${name} · ${phone}`;
};
