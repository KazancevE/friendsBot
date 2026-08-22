import { DomainError } from "./errors.ts";
import { newQrToken } from "./qr-token.ts";
import type { Role } from "./types.ts";
import type { Store } from "../store/types.ts";

export async function assignRole(
  store: Store,
  input: { actorId: string; telegramId: bigint; role: Role },
) {
  const actor = await store.findUserById(input.actorId);
  if (!actor || actor.role !== "admin") {
    throw new DomainError("forbidden", "Только админ");
  }
  const existing = await store.findUserByTelegramId(input.telegramId);
  if (existing) return store.updateUser(existing.id, { role: input.role });
  return store.createUser({
    telegramId: input.telegramId,
    role: input.role,
    firstName: null,
    lastName: null,
    birthday: null,
    phone: null,
    qrToken: newQrToken(),
  });
}
