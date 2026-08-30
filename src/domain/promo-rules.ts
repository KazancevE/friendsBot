import { DateTime } from "luxon";
import { createLotForCredit } from "./bonus-lots.ts";
import type { PromoRuleKind, PromoRuleRecord } from "./types.ts";
import { MOSCOW } from "./week.ts";
import type { Store } from "../store/types.ts";

export type CheckPromoInput = {
  checkRubles: number;
  now: Date;
  promoCode?: string | null;
};

export type PromoCheckAdjustment = {
  checkBonusMultiplier: number;
  extraBonus: number;
  ruleId: string | null;
  label: string | null;
};

const isRuleActive = (rule: PromoRuleRecord, now: Date) => {
  if (!rule.active) {
    return false;
  }
  if (rule.validFrom !== null && now < rule.validFrom) {
    return false;
  }
  if (rule.validUntil !== null && now > rule.validUntil) {
    return false;
  }
  return true;
};

const weekdayMoscow = (now: Date) => {
  return DateTime.fromJSDate(now, { zone: MOSCOW }).weekday - 1;
};

const evaluateRule = (
  rule: PromoRuleRecord,
  input: CheckPromoInput,
  baseBonus: number,
): PromoCheckAdjustment | null => {
  switch (rule.kind) {
    case "double_check_bonus": {
      if (baseBonus <= 0) {
        return null;
      }
      return {
        checkBonusMultiplier: 2,
        extraBonus: 0,
        ruleId: rule.id,
        label: "×2 бонусы",
      };
    }
    case "min_check_bonus": {
      const minRubles = Number(rule.params.minRubles ?? 0);
      const bonus = Number(rule.params.bonus ?? 0);
      if (input.checkRubles < minRubles || bonus <= 0) {
        return null;
      }
      return {
        checkBonusMultiplier: 1,
        extraBonus: bonus,
        ruleId: rule.id,
        label: `бонус от ${minRubles} ₽`,
      };
    }
    case "weekday_multiplier": {
      const weekday = Number(rule.params.weekday ?? -1);
      const multiplier = Number(rule.params.multiplier ?? 1);
      if (weekdayMoscow(input.now) !== weekday || baseBonus <= 0 || multiplier <= 1) {
        return null;
      }
      return {
        checkBonusMultiplier: multiplier,
        extraBonus: 0,
        ruleId: rule.id,
        label: `×${multiplier} в этот день`,
      };
    }
    case "promo_code": {
      const code = String(rule.params.code ?? "").trim().toUpperCase();
      const bonus = Number(rule.params.bonus ?? 0);
      const entered = (input.promoCode ?? "").trim().toUpperCase();
      if (code.length === 0 || bonus <= 0 || entered !== code) {
        return null;
      }
      return {
        checkBonusMultiplier: 1,
        extraBonus: bonus,
        ruleId: rule.id,
        label: `промокод ${code}`,
      };
    }
    default: {
      const _exhaustive: never = rule.kind;
      return _exhaustive;
    }
  }
};

export const pickPromoAdjustment = (
  rules: ReadonlyArray<PromoRuleRecord>,
  input: CheckPromoInput,
  baseBonus: number,
): PromoCheckAdjustment => {
  const applicable = rules
    .filter((rule) => isRuleActive(rule, input.now))
    .sort((a, b) => b.priority - a.priority);
  for (const rule of applicable) {
    const result = evaluateRule(rule, input, baseBonus);
    if (result !== null) {
      return result;
    }
  }
  return { checkBonusMultiplier: 1, extraBonus: 0, ruleId: null, label: null };
};

export async function creditPromoBonus(
  tx: Store,
  input: {
    guestId: string;
    amount: number;
    label: string | null;
    settings: Awaited<ReturnType<Store["getSettings"]>>;
    createdAt: Date;
  },
) {
  if (input.amount <= 0) {
    return;
  }
  const guest = await tx.findUserById(input.guestId);
  if (guest === null) {
    return;
  }
  await tx.updateUser(guest.id, { balance: guest.balance + input.amount });
  const ledger = await tx.addLedger({
    userId: guest.id,
    type: "promo_bonus",
    amount: input.amount,
    actorId: null,
    comment: input.label ?? "Акция",
    checkAmount: null,
  });
  await createLotForCredit(tx, {
    userId: guest.id,
    ledgerId: ledger.id,
    type: "promo_bonus",
    amount: input.amount,
    createdAt: input.createdAt,
    settings: input.settings,
  });
}

export const promoRuleKindLabel = (kind: PromoRuleKind): string => {
  switch (kind) {
    case "double_check_bonus":
      return "×2 бонусы с чека";
    case "min_check_bonus":
      return "бонус от суммы чека";
    case "weekday_multiplier":
      return "множитель по дню недели";
    case "promo_code":
      return "promo_code";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
};

export const promoRuleKindLabelRu = (kind: PromoRuleKind): string => {
  switch (kind) {
    case "double_check_bonus":
      return "×2 бонусы с чека";
    case "min_check_bonus":
      return "бонус от суммы чека";
    case "weekday_multiplier":
      return "множитель по дню недели";
    case "promo_code":
      return "промокод";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
};
