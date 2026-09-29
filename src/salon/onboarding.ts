export type OnboardingStep = "consent" | "promo" | "phone" | "name" | "birthday" | "ready";

export type OnboardingProfile = {
  personalDataConsentAt: Date | null;
  personalDataPolicyVersion: string | null;
  anonymizedAt: Date | null;
  promoConsentAt: Date | null;
  promoConsentPolicyVersion: string | null;
  promoConsentGranted: boolean | null;
  phone: string | null;
  nameConfirmedAt: Date | null;
  birthday: Date | null;
  birthdayPromptedAt: Date | null;
};

export type PromoAudienceRow = {
  promoConsentGranted: boolean | null;
  promoConsentPolicyVersion: string | null;
  anonymizedAt: Date | null;
};

export const nextOnboardingStep = (row: OnboardingProfile, version: string): OnboardingStep => {
  const personal =
    Boolean(row.personalDataConsentAt) &&
    !row.anonymizedAt &&
    row.personalDataPolicyVersion === version;
  if (!personal) {
    return "consent";
  }
  const promo =
    Boolean(row.promoConsentAt) &&
    !row.anonymizedAt &&
    row.promoConsentPolicyVersion === version &&
    row.promoConsentGranted !== null;
  if (!promo) {
    return "promo";
  }
  if (!row.phone) {
    return "phone";
  }
  if (!row.nameConfirmedAt) {
    return "name";
  }
  if (!row.birthday && !row.birthdayPromptedAt) {
    return "birthday";
  }
  return "ready";
};

export const consentIsRenewal = (row: OnboardingProfile, version: string) =>
  Boolean(row.personalDataConsentAt) && !row.anonymizedAt && row.personalDataPolicyVersion !== version;

export const promoIsRenewal = (row: OnboardingProfile, version: string) =>
  Boolean(row.promoConsentAt) && !row.anonymizedAt && row.promoConsentPolicyVersion !== version;

export const isPromoAudience = (row: PromoAudienceRow, version: string) =>
  row.promoConsentGranted === true && row.promoConsentPolicyVersion === version && row.anonymizedAt == null;

export type ConsentCarry = {
  personalDataConsentAt: Date | null;
  personalDataPolicyVersion: string | null;
  promoConsentAt: Date | null;
  promoConsentPolicyVersion: string | null;
  promoConsentGranted: boolean | null;
  nameConfirmedAt: Date | null;
  birthdayPromptedAt: Date | null;
  broadcastOptOut: boolean;
};

export const mergedConsentPatch = (canonical: ConsentCarry, current: ConsentCarry): ConsentCarry => ({
  personalDataConsentAt: canonical.personalDataConsentAt ?? current.personalDataConsentAt,
  personalDataPolicyVersion: canonical.personalDataPolicyVersion ?? current.personalDataPolicyVersion,
  promoConsentAt: canonical.promoConsentAt ?? current.promoConsentAt,
  promoConsentPolicyVersion: canonical.promoConsentPolicyVersion ?? current.promoConsentPolicyVersion,
  promoConsentGranted: canonical.promoConsentGranted ?? current.promoConsentGranted,
  nameConfirmedAt: canonical.nameConfirmedAt ?? current.nameConfirmedAt,
  birthdayPromptedAt: canonical.birthdayPromptedAt ?? current.birthdayPromptedAt,
  broadcastOptOut:
    canonical.promoConsentGranted == null && current.promoConsentGranted === false ? true : canonical.broadcastOptOut,
});

export const referralAttachDecision = (
  user: { id: string; referredByUserId: string | null },
  payload: string | undefined,
  referrerId: string | null,
) => {
  if (!payload?.startsWith("ref_") || user.referredByUserId || !referrerId || referrerId === user.id) {
    return null;
  }
  return referrerId;
};
