import { DomainError } from "./errors.ts";
import { normalizePhone } from "./phone.ts";
import { newQrToken } from "./qr-token.ts";
import type { Store } from "../store/types.ts";

export async function registerGuest(
  store: Store,
  input: {
    telegramId: bigint;
    firstName: string;
    lastName: string;
    birthday: Date;
    phone: string;
  },
) {
  const existing = await store.findUserByTelegramId(input.telegramId);
  if (existing) throw new DomainError("already_registered", "Уже зарегистрирован");
  const phone = normalizePhone(input.phone);
  if (await store.findUserByPhone(phone)) {
    throw new DomainError("phone_taken", "Телефон уже занят");
  }
  const settings = await store.getSettings();
  return store.withTransaction(async (tx) => {
    const user = await tx.createUser({
      telegramId: input.telegramId,
      role: "guest",
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      birthday: input.birthday,
      phone,
      qrToken: newQrToken(),
    });
    const next = await tx.updateUser(user.id, {
      balance: settings.registrationBonus,
    });
    await tx.addLedger({
      userId: user.id,
      type: "registration",
      amount: settings.registrationBonus,
      actorId: null,
      comment: "Регистрация",
      checkAmount: null,
    });
    return next;
  });
}

export async function updateGuestProfile(
  store: Store,
  userId: string,
  patch: { firstName?: string; lastName?: string; birthday?: Date; phone?: string },
) {
  if (patch.phone) {
    const phone = normalizePhone(patch.phone);
    const other = await store.findUserByPhone(phone);
    if (other && other.id !== userId) {
      throw new DomainError("phone_taken", "Телефон уже занят");
    }
    patch = { ...patch, phone };
  }
  return store.updateUser(userId, patch);
}
