import { randomInt } from "node:crypto";
import { DateTime } from "luxon";
import { createLotForCredit } from "./bonus-lots.ts";
import { DomainError } from "./errors.ts";
import type { ReferralStats, UserRecord } from "./types.ts";
import { MOSCOW } from "./week.ts";
import type { Store } from "../store/types.ts";

const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_START_PREFIX = "ref_";

export const newReferralCode = () => {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    code += REFERRAL_ALPHABET[randomInt(0, REFERRAL_ALPHABET.length)]!;
  }
  return code;
};

export const parseReferralStartPayload = (payload: string | undefined) => {
  if (payload === undefined || payload.length === 0) {
    return null;
  }
  if (!payload.startsWith(REFERRAL_START_PREFIX)) {
    return null;
  }
  const code = payload.slice(REFERRAL_START_PREFIX.length).trim().toUpperCase();
  if (code.length < 4) {
    return null;
  }
  return code;
};

export const referralLink = (botUsername: string, code: string) => {
  return `https://t.me/${botUsername}?start=${REFERRAL_START_PREFIX}${code}`;
};

export async function ensureReferralCode(store: Store, userId: string): Promise<string> {
  const user = await store.findUserById(userId);
  if (user === null) {
    throw new DomainError("not_found", "Пользователь не найден");
  }
  if (user.referralCode !== null) {
    return user.referralCode;
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = newReferralCode();
    const existing = await store.findUserByReferralCode(code);
    if (existing !== null) {
      continue;
    }
    const updated = await store.updateUser(userId, { referralCode: code });
    return updated.referralCode!;
  }
  throw new DomainError("internal", "Не удалось создать реферальный код");
}

export async function resolveReferrerByCode(store: Store, code: string): Promise<UserRecord | null> {
  return store.findUserByReferralCode(code.toUpperCase());
}

const withinActivationWindow = (guest: UserRecord, now: Date, activationDays: number) => {
  const deadline = DateTime.fromJSDate(guest.createdAt, { zone: MOSCOW })
    .plus({ days: activationDays })
    .endOf("day");
  return DateTime.fromJSDate(now, { zone: MOSCOW }) <= deadline;
};

export async function tryActivateReferral(
  store: Store,
  input: { guestId: string; now: Date; visitId?: string },
): Promise<boolean> {
  const settings = await store.getSettings();
  if (!settings.referralEnabled) {
    return false;
  }
  const guest = await store.findUserById(input.guestId);
  if (guest === null || guest.role !== "guest" || guest.referredByUserId === null) {
    return false;
  }
  if (guest.referredByUserId === guest.id) {
    return false;
  }
  if (await store.hasReferralActivation(guest.id)) {
    return false;
  }
  if (!withinActivationWindow(guest, input.now, settings.referralActivationDays)) {
    return false;
  }

  return store.withTransaction(async (tx) => {
    const current = await tx.findUserById(guest.id);
    if (current === null || current.referredByUserId === null) {
      return false;
    }
    if (await tx.hasReferralActivation(current.id)) {
      return false;
    }
    const referrer = await tx.findUserById(current.referredByUserId);
    if (referrer === null || referrer.role !== "guest") {
      return false;
    }

    const creditReferral = async (userId: string, amount: number, comment: string) => {
      const user = await tx.findUserById(userId);
      if (user === null) {
        throw new DomainError("not_found", "Пользователь не найден");
      }
      await tx.updateUser(userId, { balance: user.balance + amount });
      const ledger = await tx.addLedger({
        userId,
        type: "referral",
        amount,
        actorId: null,
        comment,
        checkAmount: null,
      });
      await createLotForCredit(tx, {
        userId,
        ledgerId: ledger.id,
        type: "referral",
        amount,
        createdAt: ledger.createdAt,
        settings,
      });
      return ledger.id;
    };

    const referrerLedgerId = await creditReferral(
      referrer.id,
      settings.referralBonusReferrer,
      "Реферал: друг активировался",
    );
    const refereeLedgerId = await creditReferral(
      current.id,
      settings.referralBonusReferee,
      "Реферал: первый визит",
    );

    await tx.createReferralActivation({
      referrerId: referrer.id,
      refereeId: current.id,
      activatedAt: input.now,
      visitId: input.visitId ?? null,
      ledgerIdReferrer: referrerLedgerId,
      ledgerIdReferee: refereeLedgerId,
    });
    return true;
  });
}

export async function getReferralStats(store: Store, userId: string): Promise<ReferralStats> {
  return store.getReferralStats(userId);
}
