import { expect, test } from "vitest";
import type { UserRecord } from "../../src/domain/types.ts";
import { SalonFlow } from "../../src/salon/flow.ts";
import type { InboundMessage } from "../../src/salon/outbound.ts";
import {
  consentIsRenewal,
  isPromoAudience,
  mergedConsentPatch,
  nextOnboardingStep,
  promoIsRenewal,
  referralAttachDecision,
  type OnboardingProfile,
} from "../../src/salon/onboarding.ts";
import type { SalonService } from "../../src/salon/service.ts";

const version = "2026-09-29";

const blank = (): OnboardingProfile => ({
  personalDataConsentAt: null,
  personalDataPolicyVersion: null,
  anonymizedAt: null,
  promoConsentAt: null,
  promoConsentPolicyVersion: null,
  promoConsentGranted: null,
  phone: null,
  nameConfirmedAt: null,
  birthday: null,
  birthdayPromptedAt: null,
});

test("onboarding order, promo audience and a new policy version", () => {
  const row = blank();
  expect(nextOnboardingStep(row, version)).toBe("consent");
  row.personalDataConsentAt = new Date("2026-09-29T00:00:00Z");
  row.personalDataPolicyVersion = version;
  expect(nextOnboardingStep(row, version)).toBe("promo");
  row.promoConsentAt = new Date("2026-09-29T00:01:00Z");
  row.promoConsentPolicyVersion = version;
  row.promoConsentGranted = false;
  expect(nextOnboardingStep(row, version)).toBe("phone");
  expect(isPromoAudience(row, version)).toBe(false);
  row.phone = "+79990001122";
  expect(nextOnboardingStep(row, version)).toBe("name");
  row.nameConfirmedAt = new Date("2026-09-29T00:02:00Z");
  expect(nextOnboardingStep(row, version)).toBe("birthday");
  row.birthdayPromptedAt = new Date("2026-09-29T00:03:00Z");
  expect(nextOnboardingStep(row, version)).toBe("ready");
  row.promoConsentGranted = true;
  expect(isPromoAudience(row, version)).toBe(true);
  expect(isPromoAudience({ ...row, anonymizedAt: new Date() }, version)).toBe(false);
  expect(consentIsRenewal(row, "2027-01-01")).toBe(true);
  expect(promoIsRenewal(row, "2027-01-01")).toBe(true);
  expect(nextOnboardingStep(row, "2027-01-01")).toBe("consent");
  row.personalDataPolicyVersion = "2027-01-01";
  expect(nextOnboardingStep(row, "2027-01-01")).toBe("promo");
  row.promoConsentPolicyVersion = "2027-01-01";
  expect(nextOnboardingStep(row, "2027-01-01")).toBe("ready");
});

test("phone link keeps consent and a declined promo, and a referral payload is not dropped", () => {
  const canonical = {
    personalDataConsentAt: null,
    personalDataPolicyVersion: null,
    promoConsentAt: null,
    promoConsentPolicyVersion: null,
    promoConsentGranted: null,
    nameConfirmedAt: null,
    birthdayPromptedAt: null,
    broadcastOptOut: false,
  };
  const current = {
    ...canonical,
    personalDataConsentAt: new Date("2026-09-29T00:00:00Z"),
    personalDataPolicyVersion: version,
    promoConsentAt: new Date("2026-09-29T00:01:00Z"),
    promoConsentPolicyVersion: version,
    promoConsentGranted: false,
    broadcastOptOut: true,
  };
  expect(mergedConsentPatch(canonical, current)).toMatchObject({
    personalDataPolicyVersion: version,
    promoConsentGranted: false,
    broadcastOptOut: true,
  });
  expect(referralAttachDecision({ id: "guest", referredByUserId: null }, "ref_ABCD1234", "friend")).toBe("friend");
  expect(referralAttachDecision({ id: "guest", referredByUserId: "kept" }, "ref_ABCD1234", "friend")).toBeNull();
  expect(referralAttachDecision({ id: "guest", referredByUserId: null }, "hello", "friend")).toBeNull();
  expect(referralAttachDecision({ id: "guest", referredByUserId: null }, "ref_ABCD1234", "guest")).toBeNull();
});

type Row = OnboardingProfile & {
  id: string;
  key: string;
  firstName: string | null;
  referredByUserId: string | null;
  importedAt: Date | null;
};

const asUser = (row: Row): UserRecord => ({
  id: row.id,
  telegramId: 1n,
  telegramUsername: null,
  role: "guest",
  firstName: row.firstName,
  lastName: null,
  birthday: row.birthday,
  phone: row.phone,
  balance: 10,
  qrToken: "qr",
  broadcastOptOut: row.promoConsentGranted === false,
  staffNote: null,
  referralCode: null,
  referredByUserId: row.referredByUserId,
  birthdayWarnedYear: null,
  birthdayGreetedYear: null,
  createdAt: new Date("2026-09-29T00:00:00Z"),
});

const harness = () => {
  const rows = new Map<string, Row>();
  const referrers = new Map<string, string>([["ABCD1234", "friend"]]);
  let seq = 1;
  let policy = version;
  const branchCalls: string[] = [];
  const dialogs: string[] = [];
  const salon = {
    async ensureChannelUser(input: { channel: string; externalId: string; firstName?: string; startPayload?: string }) {
      const key = `${input.channel}:${input.externalId}`;
      let row = [...rows.values()].find((item) => item.key === key);
      if (!row) {
        row = {
          ...blank(),
          id: `u${seq}`,
          key,
          firstName: input.firstName ?? null,
          referredByUserId: null,
          importedAt: null,
        };
        seq += 1;
        rows.set(row.id, row);
      }
      const code = input.startPayload?.startsWith("ref_") ? input.startPayload.slice(4) : null;
      const referrerId = code ? referrers.get(code) ?? null : null;
      const attach = referralAttachDecision(row, input.startPayload, referrerId);
      if (attach) {
        row.referredByUserId = attach;
      }
      return asUser(row);
    },
    async onboardingView(userId: string) {
      const row = rows.get(userId)!;
      return {
        step: nextOnboardingStep(row, policy),
        firstName: row.firstName,
        renew: consentIsRenewal(row, policy),
        promoRenew: promoIsRenewal(row, policy),
        version: policy,
      };
    },
    async recordConsent(userId: string) {
      const row = rows.get(userId)!;
      row.personalDataConsentAt = new Date();
      row.personalDataPolicyVersion = policy;
      row.anonymizedAt = null;
    },
    async recordPromoConsent(userId: string, granted: boolean) {
      const row = rows.get(userId)!;
      row.promoConsentAt = new Date();
      row.promoConsentPolicyVersion = policy;
      row.promoConsentGranted = granted;
    },
    async savePhone(userId: string, raw: string) {
      const row = rows.get(userId)!;
      if (raw.replace(/\D/g, "").length < 10) {
        throw new Error("Некорректный телефон");
      }
      const imported = [...rows.values()].find((item) => item.importedAt && item.phone === "+79991112233");
      if (imported && raw.includes("9991112233")) {
        Object.assign(imported, mergedConsentPatch(imported, row));
        imported.referredByUserId = imported.referredByUserId ?? row.referredByUserId;
        imported.key = row.key;
        return asUser(imported);
      }
      row.phone = "+79990001122";
      return asUser(row);
    },
    async phoneLinksImport(userId: string) {
      return rows.get(userId)?.importedAt != null;
    },
    async saveName(userId: string, raw: string) {
      const cleaned = raw.trim();
      if (cleaned.length < 2) {
        throw new Error("Напишите имя");
      }
      const row = rows.get(userId)!;
      row.firstName = cleaned.split(" ")[0] ?? cleaned;
      row.nameConfirmedAt = new Date();
      return asUser(row);
    },
    async confirmKeptName(userId: string) {
      const row = rows.get(userId)!;
      if (!row.firstName || row.firstName.trim().length < 2) {
        throw new Error("Напишите имя");
      }
      row.nameConfirmedAt = new Date();
      return asUser(row);
    },
    async saveBirthday(userId: string, raw: string) {
      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(raw.trim())) {
        throw new Error("Дата как ДД.ММ.ГГГГ");
      }
      const row = rows.get(userId)!;
      row.birthday = new Date("1990-05-01");
      row.birthdayPromptedAt = new Date();
      return asUser(row);
    },
    async skipBirthday(userId: string) {
      const row = rows.get(userId)!;
      row.birthdayPromptedAt = new Date();
      return asUser(row);
    },
    async card() {
      return { balance: 10, cashbackPercent: 5, appointments: [] };
    },
    policyPublic: () => ({
      version: policy,
      url: "https://daddy.example/privacy",
      consentUrl: "https://daddy.example/consent",
    }),
    miniAppLink: () => "https://daddy.example/app/?v=20260929",
    async getDialog() {
      return null;
    },
    async saveDialog(input: { step: string }) {
      dialogs.push(input.step);
    },
    async branches() {
      branchCalls.push("branches");
      return [{ id: "b1", name: "Ленина 126" }];
    },
  };
  const flow = new SalonFlow(salon as unknown as SalonService);
  return { flow, rows, branchCalls, dialogs, setPolicy: (next: string) => { policy = next; } };
};

const start = (payload?: string): InboundMessage => ({
  channel: "telegram",
  externalId: "42",
  text: "/start",
  firstName: "Иван",
  startPayload: payload,
});

test("start walks greeting, both consents, phone, name, birthday, then the menu", async () => {
  const { flow, rows, branchCalls } = harness();
  const greet = await flow.handle(start("ref_ABCD1234"));
  expect(greet.messages[0]?.text).toContain("Привет");
  expect(greet.messages[1]?.text).toContain("https://daddy.example/privacy");
  expect(greet.messages[1]?.text).toContain("https://daddy.example/consent");
  expect(greet.messages[1]?.buttons?.[0]?.[0]?.text).toBe("Согласен");
  expect(greet.messages[1]?.buttons?.[1]?.[0]?.text).toBe("Не согласен");
  expect([...rows.values()][0]?.referredByUserId).toBe("friend");

  const refused = await flow.handle({ ...start(), callback: "pd:no", text: undefined, startPayload: undefined });
  expect(refused.messages[0]?.text).toContain("Без согласия");
  expect(branchCalls).toEqual([]);

  const bookedEarly = await flow.handle({ ...start(), callback: "nav:book", text: undefined, startPayload: undefined });
  expect(bookedEarly.messages.map((message) => message.text).join("\n")).toContain("согласие");
  expect(branchCalls).toEqual([]);

  const promo = await flow.handle({ ...start(), callback: "pd:yes", text: undefined, startPayload: undefined });
  expect(promo.messages[0]?.text).toContain("рекламные сообщения");
  expect(promo.messages[0]?.buttons?.[1]?.[0]?.callback).toBe("pr:no");

  const phone = await flow.handle({ ...start(), callback: "pr:no", text: undefined, startPayload: undefined });
  expect(phone.messages[0]?.requestContact).toBe(true);
  expect(phone.messages[0]?.text).toContain("привяжем");
  const row = [...rows.values()][0]!;
  expect(isPromoAudience(row, version)).toBe(false);
  expect(nextOnboardingStep(row, version)).toBe("phone");

  const name = await flow.handle({ channel: "telegram", externalId: "42", phone: "+7 999 000-11-22" });
  expect(name.messages.map((message) => message.text).join("\n")).toContain("Иван");
  expect(name.messages[1]?.buttons?.[0]?.[0]?.callback).toBe("nm:keep");

  const birthday = await flow.handle({ channel: "telegram", externalId: "42", callback: "nm:keep" });
  expect(birthday.messages[0]?.text).toContain("бонус");
  expect(birthday.messages[0]?.buttons?.[0]?.[0]?.callback).toBe("bd:skip");

  const menu = await flow.handle({ channel: "telegram", externalId: "42", callback: "bd:skip" });
  expect(menu.messages[0]?.text).toContain("Карта готова");
  expect(menu.messages[0]?.buttons?.[0]?.[0]).toMatchObject({
    text: "Карта",
    webApp: "https://daddy.example/app/?v=20260929",
  });
  expect(row.referredByUserId).toBe("friend");
  expect(row.birthdayPromptedAt).not.toBeNull();

  const book = await flow.handle({ channel: "telegram", externalId: "42", callback: "nav:book" });
  expect(book.messages[0]?.text).toContain("филиал");
  expect(branchCalls).toEqual(["branches"]);
});

test("a later start=ref_ survives onboarding and a policy change does not ask for the phone again", async () => {
  const { flow, rows, branchCalls, setPolicy } = harness();
  await flow.handle({ channel: "max", externalId: "7", text: "/start", firstName: "Пётр" });
  expect([...rows.values()][0]?.referredByUserId).toBeNull();
  const again = await flow.handle({
    channel: "max",
    externalId: "7",
    text: "/start",
    firstName: "Пётр",
    startPayload: "ref_ABCD1234",
  });
  expect(again.messages[0]?.text).toContain("Привет");
  expect([...rows.values()][0]?.referredByUserId).toBe("friend");

  await flow.handle({ channel: "max", externalId: "7", callback: "pd:yes" });
  await flow.handle({ channel: "max", externalId: "7", callback: "pr:yes" });
  await flow.handle({ channel: "max", externalId: "7", phone: "+79990001122" });
  await flow.handle({ channel: "max", externalId: "7", text: "Пётр Сергеев" });
  const done = await flow.handle({ channel: "max", externalId: "7", text: "01.05.1990" });
  expect(done.messages[0]?.text).toContain("Карта готова");
  expect(isPromoAudience([...rows.values()][0]!, version)).toBe(true);

  setPolicy("2027-01-01");
  const renew = await flow.handle({ channel: "max", externalId: "7", callback: "nav:book" });
  expect(renew.messages[0]?.text).toContain("обновилась");
  expect(renew.messages[0]?.text).not.toContain("Привет");
  expect(branchCalls).toEqual([]);
  await flow.handle({ channel: "max", externalId: "7", callback: "pd:yes" });
  const promo = await flow.handle({ channel: "max", externalId: "7", callback: "pr:no" });
  expect(promo.messages[0]?.text).toContain("BRO");
  expect(promo.messages[0]?.text).not.toContain("Отправь номер");
  expect(branchCalls).toEqual([]);
  expect([...rows.values()][0]?.phone).toBe("+79990001122");
  expect(isPromoAudience([...rows.values()][0]!, "2027-01-01")).toBe(false);
});

test("sharing a phone links an imported card and keeps the referral", async () => {
  const { flow, rows } = harness();
  rows.set("import", {
    ...blank(),
    id: "import",
    key: "import",
    firstName: "Сергей",
    phone: "+79991112233",
    referredByUserId: null,
    importedAt: new Date("2026-01-01T00:00:00Z"),
    birthday: new Date("1988-03-03"),
  });
  await flow.handle(start("ref_ABCD1234"));
  await flow.handle({ ...start(), callback: "pd:yes", text: undefined, startPayload: undefined });
  await flow.handle({ ...start(), callback: "pr:yes", text: undefined, startPayload: undefined });
  const linked = await flow.handle({ channel: "telegram", externalId: "42", phone: "+79991112233" });
  expect(linked.messages.map((message) => message.text).join("\n")).toContain("Нашли карту");
  expect(linked.messages.map((message) => message.text).join("\n")).toContain("Сергей");
  const menu = await flow.handle({ channel: "telegram", externalId: "42", callback: "nm:keep" });
  expect(menu.messages[0]?.text).toContain("Карта готова");
  expect(rows.get("import")?.referredByUserId).toBe("friend");
  expect(rows.get("import")?.personalDataPolicyVersion).toBe(version);
  expect(rows.get("import")?.promoConsentGranted).toBe(true);
});
