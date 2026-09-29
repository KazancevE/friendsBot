import { calculateCheckBonus } from "../domain/settings.ts";

/** Кэшбэк барбершопа по умолчанию. В базе сид ставит то же значение, админ меняет процент. */
export const SALON_DEFAULT_CASHBACK_PERCENT = 5;

export const cashbackForCheck = (checkRubles: number, percent = SALON_DEFAULT_CASHBACK_PERCENT) => {
  return calculateCheckBonus(checkRubles, percent);
};
