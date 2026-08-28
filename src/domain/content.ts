import { DomainError } from "./errors.ts";
import type { Store } from "../store/types.ts";

async function requireAdmin(store: Store, actorId: string) {
  const actor = await store.findUserById(actorId);
  if (!actor || actor.role !== "admin") {
    throw new DomainError("forbidden", "Только админ");
  }
  return actor;
}

export async function addMenuItem(
  store: Store,
  input: {
    actorId: string;
    title: string;
    description: string;
    priceRubles: number | null;
    imageFileId?: string | null;
  },
) {
  await requireAdmin(store, input.actorId);
  const title = input.title.trim();
  const imageFileId = input.imageFileId ?? null;
  if (title.length === 0 && imageFileId === null) {
    throw new DomainError("invalid", "Нужно название или фото");
  }
  return store.upsertMenuItem({
    title,
    description: input.description,
    priceRubles: input.priceRubles,
    imageFileId,
    sort: 0,
    active: true,
  });
}

export async function listActiveMenu(store: Store) {
  return store.listMenu();
}

export async function savePage(
  store: Store,
  input: { actorId: string; slug: "contacts" | "directions"; body: string; mapUrl: string | null },
) {
  await requireAdmin(store, input.actorId);
  return store.upsertPage({ slug: input.slug, body: input.body, mapUrl: input.mapUrl });
}
