export const POLICY_VERSION_DEFAULT = "2026-09-29";

export const consentDecision = (input: { hasConsent: boolean; callback: string | null }) => {
  if (input.hasConsent) {
    return "pass" as const;
  }
  if (input.callback === "pd:yes") {
    return "accept" as const;
  }
  if (input.callback === "pd:no") {
    return "refuse" as const;
  }
  return "ask" as const;
};

export const anonymizedProfile = () => ({
  firstName: "Удалён",
  lastName: null,
  phone: null,
  birthday: null,
  telegramUsername: null,
  staffNote: null,
  preferredBarberName: null,
  personalDataConsentAt: null,
  personalDataPolicyVersion: null,
  promoConsentAt: null,
  promoConsentPolicyVersion: null,
  promoConsentGranted: null,
  nameConfirmedAt: null,
  birthdayPromptedAt: null,
  broadcastOptOut: true,
});
