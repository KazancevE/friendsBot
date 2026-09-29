import { DateTime } from "luxon";
import QRCode from "qrcode";
import type { PrismaClient } from "@prisma/client";
import { createLotForCredit } from "../domain/bonus-lots.ts";
import { DomainError } from "../domain/errors.ts";
import { isBirthdayWeek } from "../domain/birthday.ts";
import { applyCheck, redeemBonuses } from "../domain/ledger.ts";
import { maskPhone, normalizePhone } from "../domain/phone.ts";
import { newQrToken } from "../domain/qr-token.ts";
import { ensureReferralCode, parseReferralStartPayload, referralLink } from "../domain/referral.ts";
import {
  consentIsRenewal,
  isPromoAudience,
  mergedConsentPatch,
  nextOnboardingStep,
  promoIsRenewal,
  referralAttachDecision,
} from "./onboarding.ts";
import { miniAppUrl } from "../web-app-url.ts";
import type { Settings, UserRecord } from "../domain/types.ts";
import { parseVenueDay } from "../domain/venue-time.ts";
import { appTimezone } from "../domain/week.ts";
import type { Store } from "../store/types.ts";
import { ALL_LEVELS, LEVEL_LABEL, type BarberLevelName } from "./catalog.ts";
import { venue } from "../venue/salon.ts";
import { formatAppointmentWhen, formatDayLabel, formatMinutes, formatPrice } from "./format.ts";
import { channelIdsToMove, decidePhoneLink, type SalonChannelName } from "./identity.ts";
import { commitClientImport, type ImportReport } from "./import-commit.ts";
import { buildImportPlan, isFirstMessengerLink, type ColumnMapping } from "./import.ts";
import { isHaircutNudgeDue } from "./nudge.ts";
import { dueReminders, type ReminderKind } from "./reminders.ts";
import { anonymizedProfile } from "../prod/privacy.ts";
import { freeSlotStarts } from "./slots.ts";

export const DEMO_GUEST_TELEGRAM_ID = 900000001n;
export const SALON_STAFF_TELEGRAM_ID = 900000002n;

export type SlotOffer = {
  startMin: number;
  barberId: string;
  barberName: string;
  level: BarberLevelName;
  priceRub: number;
  priceFrom: boolean;
  durationMinutes: number;
};

const asLevel = (value: string): BarberLevelName => {
  if (value === "junior" || value === "barber" || value === "senior" || value === "chef") {
    return value;
  }
  return "barber";
};

export class SalonService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly store: Store,
    private readonly options: {
      publicUrl: string;
      telegramBotUsername: string | null;
      maxBotUrl: string | null;
    },
  ) {}

  async findChannelUser(channel: SalonChannelName, externalId: string): Promise<UserRecord | null> {
    if (channel === "telegram") {
      return this.store.findUserByTelegramId(BigInt(externalId));
    }
    const row = await this.prisma.user.findUnique({ where: { maxUserId: BigInt(externalId) } });
    return row ? this.store.findUserById(row.id) : null;
  }

  async ensureChannelUser(input: {
    channel: SalonChannelName;
    externalId: string;
    firstName?: string;
    startPayload?: string;
  }): Promise<UserRecord> {
    const existing = await this.findChannelUser(input.channel, input.externalId);
    if (existing) {
      return this.attachReferral(existing, input.startPayload);
    }
    const referrerCode = parseReferralStartPayload(input.startPayload ?? undefined);
    let referredByUserId: string | null = null;
    if (referrerCode) {
      const referrer = await this.store.findUserByReferralCode(referrerCode);
      if (referrer) {
        referredByUserId = referrer.id;
      }
    }
    const telegramId = input.channel === "telegram" ? BigInt(input.externalId) : -BigInt(input.externalId);
    const created = await this.store.createUser({
      telegramId,
      role: "guest",
      firstName: input.firstName?.trim() || null,
      lastName: null,
      birthday: null,
      phone: null,
      qrToken: newQrToken(),
    });
    if (referredByUserId && referredByUserId !== created.id) {
      await this.store.updateUser(created.id, { referredByUserId });
    }
    if (input.channel === "max") {
      await this.prisma.user.update({
        where: { id: created.id },
        data: { maxUserId: BigInt(input.externalId) },
      });
    }
    return this.attachReferral((await this.store.findUserById(created.id)) ?? created, input.startPayload);
  }

  private async attachReferral(user: UserRecord, startPayload?: string) {
    const code = parseReferralStartPayload(startPayload);
    const referrer = code ? await this.store.findUserByReferralCode(code) : null;
    const referrerId = referralAttachDecision(user, startPayload, referrer?.id ?? null);
    if (!referrerId) {
      return user;
    }
    return this.store.updateUser(user.id, { referredByUserId: referrerId });
  }

  async saveName(userId: string, raw: string): Promise<UserRecord> {
    const cleaned = raw.trim().replace(/\s+/g, " ");
    if (cleaned.length < 2) {
      throw new DomainError("bad_request", "Напишите имя");
    }
    const [firstName, ...rest] = cleaned.split(" ");
    const updated = await this.store.updateUser(userId, {
      firstName: firstName ?? cleaned,
      lastName: rest.length > 0 ? rest.join(" ") : null,
    });
    await this.prisma.user.update({ where: { id: userId }, data: { nameConfirmedAt: new Date() } });
    return updated;
  }

  async confirmKeptName(userId: string): Promise<UserRecord> {
    const user = await this.store.findUserById(userId);
    if (!user?.firstName || user.firstName.trim().length < 2) {
      throw new DomainError("bad_request", "Напишите имя");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { nameConfirmedAt: new Date() } });
    return user;
  }

  async saveBirthday(userId: string, raw: string | null): Promise<UserRecord> {
    if (raw === null) {
      return (await this.store.findUserById(userId))!;
    }
    const settings = await this.store.getSettings();
    const parsed = parseVenueDay(raw, settings);
    if (parsed === null) {
      throw new DomainError("bad_request", "Дата как ДД.ММ.ГГГГ");
    }
    const updated = await this.store.updateUser(userId, { birthday: parsed.toJSDate() });
    await this.prisma.user.update({ where: { id: userId }, data: { birthdayPromptedAt: new Date() } });
    return updated;
  }

  async skipBirthday(userId: string): Promise<UserRecord> {
    await this.prisma.user.update({ where: { id: userId }, data: { birthdayPromptedAt: new Date() } });
    const user = await this.store.findUserById(userId);
    if (!user) {
      throw new DomainError("not_found", "Клиент не найден");
    }
    return user;
  }

  async savePhone(userId: string, rawPhone: string, channel: SalonChannelName): Promise<UserRecord> {
    const phone = normalizePhone(rawPhone);
    const current = await this.store.findUserById(userId);
    if (!current) {
      throw new DomainError("not_found", "Клиент не найден");
    }
    const owner = await this.store.findUserByPhone(phone);
    const decision = decidePhoneLink(current.id, owner?.id ?? null);
    if (decision.action === "set_phone") {
      const updated = await this.store.updateUser(current.id, { phone });
      await this.grantRegistration(updated.id);
      return (await this.store.findUserById(updated.id)) ?? updated;
    }
    const before = await this.prisma.user.findUnique({
      where: { id: decision.canonicalUserId },
      select: { importedAt: true, importWelcomeGrantedAt: true, telegramId: true, maxUserId: true },
    });
    const canonical = await this.mergeInto(current, decision.canonicalUserId, channel);
    if (
      before &&
      isFirstMessengerLink({
        importedAt: before.importedAt,
        welcomeGrantedAt: before.importWelcomeGrantedAt,
        telegramId: before.telegramId,
        maxUserId: before.maxUserId,
      })
    ) {
      await this.grantImportWelcome(canonical.id);
    } else {
      await this.grantRegistration(canonical.id);
    }
    return canonical;
  }

  private async mergeInto(current: UserRecord, canonicalId: string, channel: SalonChannelName): Promise<UserRecord> {
    const canonical = await this.store.findUserById(canonicalId);
    const currentRow = await this.prisma.user.findUnique({ where: { id: current.id } });
    const canonicalRow = await this.prisma.user.findUnique({ where: { id: canonicalId } });
    if (!canonical || !currentRow || !canonicalRow) {
      throw new DomainError("not_found", "Клиент не найден");
    }
    const move = channelIdsToMove({
      channel,
      currentTelegramId: currentRow.telegramId,
      currentMaxUserId: currentRow.maxUserId,
      canonicalMaxUserId: canonicalRow.maxUserId,
      canonicalTelegramId: canonicalRow.telegramId,
    });
    await this.prisma.$transaction(async (tx) => {
      if (move.maxUserId !== null) {
        await tx.user.update({ where: { id: current.id }, data: { maxUserId: null } });
        await tx.user.update({ where: { id: canonicalId }, data: { maxUserId: move.maxUserId } });
      }
      if (move.telegramId !== null) {
        await tx.user.update({
          where: { id: current.id },
          data: { telegramId: -BigInt(Date.now()) },
        });
        await tx.user.update({
          where: { id: canonicalId },
          data: { telegramId: move.telegramId },
        });
      }
      await tx.appointment.updateMany({ where: { userId: current.id }, data: { userId: canonicalId } });
      await tx.visit.updateMany({ where: { userId: current.id }, data: { userId: canonicalId } });
      await tx.salonDialog.updateMany({ where: { userId: current.id }, data: { userId: canonicalId } });
      if (current.referredByUserId && !canonical.referredByUserId && current.referredByUserId !== canonicalId) {
        await tx.user.update({
          where: { id: canonicalId },
          data: { referredByUserId: current.referredByUserId },
        });
      }
      await tx.user.update({
        where: { id: canonicalId },
        data: mergedConsentPatch(canonicalRow, currentRow),
      });
    });
    if (current.balance > 0) {
      const fresh = await this.store.findUserById(canonicalId);
      if (fresh) {
        await this.store.updateUser(canonicalId, { balance: fresh.balance + current.balance });
        await this.store.updateUser(current.id, { balance: 0 });
      }
    }
    if (!canonical.firstName && current.firstName) {
      await this.store.updateUser(canonicalId, {
        firstName: current.firstName,
        lastName: current.lastName,
      });
    }
    return (await this.store.findUserById(canonicalId))!;
  }

  private async grantImportWelcome(userId: string) {
    const settings = await this.store.getSettings();
    const claimed = await this.prisma.user.updateMany({
      where: { id: userId, importedAt: { not: null }, importWelcomeGrantedAt: null },
      data: { importWelcomeGrantedAt: new Date() },
    });
    if (claimed.count === 0 || settings.importWelcomeBonus <= 0) {
      return;
    }
    const amount = settings.importWelcomeBonus;
    await this.store.withTransaction(async (tx) => {
      const user = await tx.findUserById(userId);
      if (!user) {
        return;
      }
      await tx.updateUser(userId, { balance: user.balance + amount });
      const ledger = await tx.addLedger({
        userId,
        type: "manual",
        amount,
        actorId: null,
        comment: "Приветственный бонус за привязку карты",
        checkAmount: null,
      });
      await createLotForCredit(tx, {
        userId,
        ledgerId: ledger.id,
        type: "manual",
        amount,
        createdAt: ledger.createdAt,
        settings,
      });
    });
  }

  private async grantRegistration(userId: string) {
    const existing = await this.prisma.ledger.findFirst({
      where: { userId, type: "registration" },
    });
    if (existing) {
      return;
    }
    const settings = await this.store.getSettings();
    if (settings.registrationBonus <= 0) {
      return;
    }
    await this.store.withTransaction(async (tx) => {
      const user = await tx.findUserById(userId);
      if (!user) {
        return;
      }
      await tx.updateUser(userId, { balance: user.balance + settings.registrationBonus });
      const ledger = await tx.addLedger({
        userId,
        type: "registration",
        amount: settings.registrationBonus,
        actorId: null,
        comment: "Регистрация",
        checkAmount: null,
      });
      await createLotForCredit(tx, {
        userId,
        ledgerId: ledger.id,
        type: "registration",
        amount: settings.registrationBonus,
        createdAt: ledger.createdAt,
        settings,
      });
    });
  }

  profileReady(user: UserRecord) {
    return Boolean(user.firstName && user.phone);
  }

  policyPublic() {
    const origin = this.options.publicUrl.replace(/\/$/, "");
    return {
      version: process.env.POLICY_VERSION?.trim() || "2026-09-29",
      url: `${origin}/privacy`,
      consentUrl: `${origin}/consent`,
    };
  }

  miniAppLink() {
    return miniAppUrl(this.options.publicUrl);
  }

  private async onboardingRow(userId: string) {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        phone: true,
        birthday: true,
        personalDataConsentAt: true,
        personalDataPolicyVersion: true,
        anonymizedAt: true,
        promoConsentAt: true,
        promoConsentPolicyVersion: true,
        promoConsentGranted: true,
        nameConfirmedAt: true,
        birthdayPromptedAt: true,
      },
    });
    if (!row) {
      throw new DomainError("not_found", "Клиент не найден");
    }
    return row;
  }

  async onboardingView(userId: string) {
    const row = await this.onboardingRow(userId);
    const version = this.policyPublic().version;
    return {
      step: nextOnboardingStep(row, version),
      firstName: row.firstName,
      renew: consentIsRenewal(row, version),
      promoRenew: promoIsRenewal(row, version),
      version,
    };
  }

  async onboardingComplete(userId: string) {
    return (await this.onboardingView(userId)).step === "ready";
  }

  async phoneLinksImport(userId: string) {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { importedAt: true },
    });
    return row?.importedAt != null;
  }

  async hasConsent(userId: string) {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { personalDataConsentAt: true, personalDataPolicyVersion: true, anonymizedAt: true },
    });
    return Boolean(row?.personalDataConsentAt) && !row?.anonymizedAt && row?.personalDataPolicyVersion === this.policyPublic().version;
  }

  async recordConsent(userId: string, at = new Date()) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        personalDataConsentAt: at,
        personalDataPolicyVersion: this.policyPublic().version,
        anonymizedAt: null,
      },
    });
  }

  async recordPromoConsent(userId: string, granted: boolean, at = new Date()) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        promoConsentAt: at,
        promoConsentPolicyVersion: this.policyPublic().version,
        promoConsentGranted: granted,
        broadcastOptOut: !granted,
      },
    });
  }

  async clientBranchIds(userId: string) {
    const [visits, appointments] = await Promise.all([
      this.prisma.visit.findMany({ where: { userId }, select: { branchId: true } }),
      this.prisma.appointment.findMany({ where: { userId }, select: { branchId: true } }),
    ]);
    return [...new Set([...visits.map((row) => row.branchId), ...appointments.map((row) => row.branchId)].filter((id): id is string => Boolean(id)))];
  }

  async exportClient(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        appointments: { select: { id: true, startsAt: true, status: true, branchId: true, serviceId: true } },
        visits: { select: { id: true, startedAt: true, branchId: true } },
        ledger: { select: { id: true, type: true, amount: true, createdAt: true, comment: true } },
      },
    });
    if (!user) {
      throw new DomainError("not_found", "Клиент не найден");
    }
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      birthday: user.birthday,
      telegramUsername: user.telegramUsername,
      balance: user.balance,
      consentAt: user.personalDataConsentAt,
      policyVersion: user.personalDataPolicyVersion,
      promoConsentAt: user.promoConsentAt,
      promoConsentGranted: user.promoConsentGranted,
      promoPolicyVersion: user.promoConsentPolicyVersion,
      anonymizedAt: user.anonymizedAt,
      appointments: user.appointments,
      visits: user.visits,
      ledger: user.ledger,
    };
  }

  async anonymizeClient(userId: string, at = new Date()) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) {
      throw new DomainError("not_found", "Клиент не найден");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { ...anonymizedProfile(), anonymizedAt: at },
    });
    return { id: userId, anonymizedAt: at.toISOString() };
  }

  async branches() {
    return this.prisma.branch.findMany({ where: { active: true }, orderBy: { sort: "asc" } });
  }

  async servicesForBranch(branchId: string) {
    const barbers = await this.prisma.barber.findMany({ where: { branchId, active: true } });
    const levels = new Set(barbers.map((barber) => barber.level));
    const prices = await this.prisma.servicePrice.findMany({
      where: { branchId, level: { in: [...levels] } },
      include: { service: true },
    });
    const byService = new Map<string, { id: string; name: string; category: string; minPrice: number; from: boolean }>();
    for (const price of prices) {
      if (!price.service.active) {
        continue;
      }
      const current = byService.get(price.serviceId);
      if (!current || price.priceRub < current.minPrice) {
        byService.set(price.serviceId, {
          id: price.serviceId,
          name: price.service.name,
          category: price.service.category,
          minPrice: price.priceRub,
          from: price.priceFrom || (current !== undefined && current.minPrice !== price.priceRub),
        });
      } else if (price.priceRub !== current.minPrice) {
        current.from = true;
      }
    }
    return [...byService.values()].sort((left, right) => left.name.localeCompare(right.name, "ru"));
  }

  async barbersForService(branchId: string, serviceId: string) {
    const prices = await this.prisma.servicePrice.findMany({ where: { branchId, serviceId } });
    const levels = new Set(prices.map((price) => price.level));
    const barbers = await this.prisma.barber.findMany({
      where: { branchId, active: true, level: { in: [...levels] } },
      orderBy: { sort: "asc" },
    });
    return barbers.map((barber) => {
      const price = prices.find((row) => row.level === barber.level);
      return {
        id: barber.id,
        name: barber.name,
        level: asLevel(barber.level),
        levelLabel: LEVEL_LABEL[asLevel(barber.level)],
        rating: barber.rating,
        ratingCount: barber.ratingCount,
        priceRub: price?.priceRub ?? 0,
        priceFrom: price?.priceFrom ?? false,
        durationMinutes: price?.durationMinutes ?? 0,
      };
    });
  }

  upcomingDates(now = new Date(), days = 14) {
    const zone = appTimezone();
    const start = DateTime.fromJSDate(now, { zone }).startOf("day");
    return Array.from({ length: days }, (_, index) => start.plus({ days: index }).toISODate()).filter(
      (value): value is string => value !== null,
    );
  }

  async listSlots(input: {
    branchId: string;
    serviceId: string;
    barberId: string | "any";
    date: string;
    now?: Date;
  }): Promise<SlotOffer[]> {
    const zone = appTimezone();
    const day = DateTime.fromISO(input.date, { zone });
    if (!day.isValid) {
      throw new DomainError("bad_request", "Некорректная дата");
    }
    const branch = await this.prisma.branch.findUnique({ where: { id: input.branchId } });
    const service = await this.prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!branch || !service) {
      throw new DomainError("not_found", "Филиал или услуга не найдены");
    }
    const masters = await this.barbersForService(input.branchId, input.serviceId);
    const chosen = input.barberId === "any" ? masters : masters.filter((master) => master.id === input.barberId);
    if (chosen.length === 0) {
      return [];
    }
    const now = input.now ?? new Date();
    const localNow = DateTime.fromJSDate(now, { zone });
    const earliest = day.hasSame(localNow, "day") ? localNow.hour * 60 + localNow.minute + 1 : null;
    const settings = await this.store.getSettings();
    const step = [15, 30, 60].includes(settings.bookingSlotMinutes) ? settings.bookingSlotMinutes : 30;
    const dayStart = day.startOf("day").toJSDate();
    const dayEnd = day.endOf("day").toJSDate();
    const schedules = await this.prisma.barberSchedule.findMany({
      where: { barberId: { in: chosen.map((master) => master.id) }, weekday: day.weekday },
    });
    const busyRows = await this.prisma.appointment.findMany({
      where: {
        barberId: { in: chosen.map((master) => master.id) },
        status: "confirmed",
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
    });
    const load = new Map<string, number>();
    const days: Array<{ id: string; openMin: number; closeMin: number; busy: { startMin: number; endMin: number }[] }> = [];
    for (const master of chosen) {
      const schedule = schedules.find((row) => row.barberId === master.id);
      if (!schedule) {
        continue;
      }
      const busy = busyRows
        .filter((row) => row.barberId === master.id)
        .map((row) => ({
          startMin: this.minuteOf(row.startsAt, zone),
          endMin: this.minuteOf(row.endsAt, zone),
        }));
      load.set(master.id, busy.length);
      days.push({
        id: master.id,
        openMin: Math.max(schedule.startMin, branch.openMin),
        closeMin: Math.min(schedule.endMin, branch.closeMin),
        busy,
      });
    }
    days.sort((left, right) => (load.get(left.id) ?? 0) - (load.get(right.id) ?? 0));
    const masterById = new Map(chosen.map((master) => [master.id, master]));
    if (input.barberId === "any") {
      const seen = new Set<number>();
      const offers: SlotOffer[] = [];
      for (const dayPlan of days) {
        const master = masterById.get(dayPlan.id);
        if (!master) {
          continue;
        }
        const starts = freeSlotStarts({
          openMin: dayPlan.openMin,
          closeMin: dayPlan.closeMin,
          durationMin: master.durationMinutes,
          stepMin: step,
          busy: dayPlan.busy,
          earliestStartMin: earliest,
        });
        for (const startMin of starts) {
          if (seen.has(startMin)) {
            continue;
          }
          seen.add(startMin);
          offers.push(this.offer(startMin, master));
        }
      }
      return offers.sort((left, right) => left.startMin - right.startMin);
    }
    const master = chosen[0];
    const dayPlan = days[0];
    if (!master || !dayPlan) {
      return [];
    }
    return freeSlotStarts({
      openMin: dayPlan.openMin,
      closeMin: dayPlan.closeMin,
      durationMin: master.durationMinutes,
      stepMin: step,
      busy: dayPlan.busy,
      earliestStartMin: earliest,
    }).map((startMin) => this.offer(startMin, master));
  }

  private offer(
    startMin: number,
    master: {
      id: string;
      name: string;
      level: BarberLevelName;
      priceRub: number;
      priceFrom: boolean;
      durationMinutes: number;
    },
  ): SlotOffer {
    return {
      startMin,
      barberId: master.id,
      barberName: master.name,
      level: master.level,
      priceRub: master.priceRub,
      priceFrom: master.priceFrom,
      durationMinutes: master.durationMinutes,
    };
  }

  private minuteOf(at: Date, zone: string) {
    const local = DateTime.fromJSDate(at, { zone });
    return local.hour * 60 + local.minute;
  }

  async book(input: {
    userId: string;
    branchId: string;
    serviceId: string;
    barberId: string;
    date: string;
    startMin: number;
    now?: Date;
  }) {
    const slots = await this.listSlots({
      branchId: input.branchId,
      serviceId: input.serviceId,
      barberId: input.barberId,
      date: input.date,
      now: input.now,
    });
    const slot = slots.find((row) => row.startMin === input.startMin && row.barberId === input.barberId);
    if (!slot) {
      throw new DomainError("slot_taken", "Это время уже занято. Выберите другое.");
    }
    const zone = appTimezone();
    const startsAt = DateTime.fromISO(input.date, { zone }).plus({ minutes: input.startMin }).toJSDate();
    const endsAt = DateTime.fromJSDate(startsAt).plus({ minutes: slot.durationMinutes }).toJSDate();
    const created = await this.prisma.$transaction(async (tx) => {
      const clash = await tx.appointment.findFirst({
        where: {
          barberId: input.barberId,
          status: "confirmed",
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });
      if (clash) {
        throw new DomainError("slot_taken", "Это время только что заняли. Выберите другое.");
      }
      return tx.appointment.create({
        data: {
          userId: input.userId,
          branchId: input.branchId,
          serviceId: input.serviceId,
          barberId: input.barberId,
          startsAt,
          endsAt,
          priceRub: slot.priceRub,
          status: "confirmed",
        },
        include: { branch: true, service: true, barber: true, user: true },
      });
    });
    const when = formatAppointmentWhen(created.startsAt);
    const body = `Новая запись: ${created.user.firstName ?? "Гость"}, ${created.branch.name}, ${created.service.name}, ${created.barber.name}, ${when}, ${formatPrice(created.priceRub, false)}`;
    await this.prisma.adminNotice.create({
      data: { kind: "booking_new", body, branchId: created.branchId },
    });
    return { appointment: created, notice: body };
  }

  async cancel(userId: string, appointmentId: string, byAdmin = false) {
    const row = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { branch: true, service: true, barber: true, user: true },
    });
    if (!row || (!byAdmin && row.userId !== userId)) {
      throw new DomainError("not_found", "Запись не найдена");
    }
    if (row.status !== "confirmed") {
      throw new DomainError("bad_request", "Эту запись уже нельзя отменить");
    }
    const updated = await this.prisma.appointment.update({
      where: { id: row.id },
      data: { status: "cancelled", cancelledAt: new Date() },
      include: { branch: true, service: true, barber: true, user: true },
    });
    const body = `Отмена: ${updated.user.firstName ?? "Гость"}, ${updated.branch.name}, ${updated.service.name}, ${updated.barber.name}, ${formatAppointmentWhen(updated.startsAt)}`;
    await this.prisma.adminNotice.create({
      data: { kind: "booking_cancel", body, branchId: updated.branchId },
    });
    return { appointment: updated, notice: body };
  }

  async myAppointments(userId: string) {
    return this.prisma.appointment.findMany({
      where: { userId, status: "confirmed", startsAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) } },
      include: { branch: true, service: true, barber: true },
      orderBy: { startsAt: "asc" },
      take: 10,
    });
  }

  async card(userId: string) {
    const user = await this.store.findUserById(userId);
    if (!user) {
      throw new DomainError("not_found", "Клиент не найден");
    }
    const settings = await this.store.getSettings();
    const code = await ensureReferralCode(this.store, userId);
    const appointments = await this.myAppointments(userId);
    const qrDataUrl = await QRCode.toDataURL(user.qrToken, {
      margin: 1,
      width: 280,
      color: { dark: "#1c1c1c", light: "#ffffff" },
    });
    const link = this.options.telegramBotUsername
      ? referralLink(this.options.telegramBotUsername, code)
      : `ref_${code}`;
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      balance: user.balance,
      cashbackPercent: settings.percent,
      referralBonus: settings.referralBonusReferrer,
      birthdayBonus: settings.birthdayBonus,
      referralCode: code,
      referralLink: link,
      maxReferralLink: this.options.maxBotUrl ? `${this.options.maxBotUrl}?start=ref_${code}` : null,
      qrToken: user.qrToken,
      qrDataUrl,
      appointments: appointments.map((row) => ({
        id: row.id,
        branch: row.branch.name,
        service: row.service.name,
        barber: row.barber.name,
        when: formatAppointmentWhen(row.startsAt),
        startsAt: row.startsAt.toISOString(),
        priceRub: row.priceRub,
      })),
    };
  }

  async getDialog(channel: SalonChannelName, externalId: string) {
    return this.prisma.salonDialog.findUnique({
      where: { channel_externalId: { channel, externalId } },
    });
  }

  async saveDialog(input: {
    channel: SalonChannelName;
    externalId: string;
    userId: string | null;
    step: string;
    payload: Record<string, unknown>;
  }) {
    return this.prisma.salonDialog.upsert({
      where: { channel_externalId: { channel: input.channel, externalId: input.externalId } },
      create: {
        channel: input.channel,
        externalId: input.externalId,
        userId: input.userId,
        step: input.step,
        payload: input.payload,
      },
      update: { userId: input.userId, step: input.step, payload: input.payload },
    });
  }

  async publicCatalog() {
    const settings = await this.store.getSettings();
    const branches = await this.branches();
    const services = await this.prisma.service.findMany({
      where: { active: true },
      include: { prices: true },
      orderBy: { sort: "asc" },
    });
    const masters = await this.prisma.barber.findMany({
      where: { active: true },
      include: { branch: true },
      orderBy: [{ branch: { sort: "asc" } }, { sort: "asc" }],
    });
    return {
      cashbackPercent: settings.percent,
      haircutNudgeWeeks: settings.haircutNudgeWeeks,
      branches: branches.map((branch) => {
        const meta = venue.branches.find((item) => item.slug === branch.slug);
        return {
          id: branch.id,
          slug: branch.slug,
          name: branch.name,
          address: branch.address,
          city: branch.city,
          hours: `${formatMinutes(branch.openMin)}–${formatMinutes(branch.closeMin)}`,
          phone: venue.contacts.phone,
          phoneExt: meta?.phoneExt ?? null,
          note: meta?.note ?? "",
        };
      }),
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        category: service.category,
        prices: service.prices.map((price) => ({
          branchId: price.branchId,
          level: price.level,
          levelLabel: LEVEL_LABEL[asLevel(price.level)],
          priceRub: price.priceRub,
          priceFrom: price.priceFrom,
          durationMinutes: price.durationMinutes,
        })),
      })),
      masters: masters.map((master) => ({
        id: master.id,
        name: master.name,
        level: master.level,
        levelLabel: LEVEL_LABEL[asLevel(master.level)],
        branchId: master.branchId,
        branchName: master.branch.name,
        rating: master.rating,
        ratingCount: master.ratingCount,
      })),
      levels: ALL_LEVELS.map((level) => ({ id: level, label: LEVEL_LABEL[level] })),
    };
  }

  async examplePromos() {
    const rows = await this.prisma.promo.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      example: true,
    }));
  }

  async reminderBatch(now = new Date()) {
    await this.prisma.appointment.updateMany({
      where: { status: "confirmed", endsAt: { lt: now } },
      data: { status: "completed" },
    });
    const settings = await this.store.getSettings();
    const [lead24, lead2] = this.leadHours(settings);
    const horizon = new Date(now.getTime() + lead24 * 60 * 60 * 1000);
    // Напоминания о визите — сервисные: согласие на рекламу не требуется.
    const rows = await this.prisma.appointment.findMany({
      where: { status: "confirmed", startsAt: { gt: now, lte: horizon } },
      include: { user: true, service: true, barber: true, branch: true },
    });
    const due: Array<{
      appointmentId: string;
      kind: ReminderKind;
      text: string;
      deliveries: Array<{ channel: SalonChannelName; externalId: string }>;
    }> = [];
    for (const row of rows) {
      const kinds = dueReminders({
        startsAt: row.startsAt,
        now,
        status: "confirmed",
        sent24: row.reminder24SentAt !== null,
        sent2: row.reminder2SentAt !== null,
        lead24Hours: lead24,
        lead2Hours: lead2,
      });
      for (const kind of kinds) {
        const when = formatAppointmentWhen(row.startsAt);
        const text =
          kind === "h24"
            ? `Напоминание: завтра ${when} — ${row.service.name} у ${row.barber.name}, ${row.branch.name}.`
            : `Через ${lead2} ч: ${when} — ${row.service.name} у ${row.barber.name}, ${row.branch.name}.`;
        due.push({
          appointmentId: row.id,
          kind,
          text,
          deliveries: this.deliveries(row.user.telegramId, row.user.maxUserId),
        });
      }
    }
    return due;
  }

  async markReminder(appointmentId: string, kind: ReminderKind, at = new Date()) {
    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: kind === "h24" ? { reminder24SentAt: at } : { reminder2SentAt: at },
    });
  }

  async nudgeBatch(now = new Date()) {
    const settings = await this.store.getSettings();
    const version = this.policyPublic().version;
    const users = await this.prisma.user.findMany({
      where: {
        role: "guest",
        promoConsentGranted: true,
        promoConsentPolicyVersion: version,
        anonymizedAt: null,
      },
      select: {
        id: true,
        telegramId: true,
        maxUserId: true,
        promoConsentGranted: true,
        promoConsentPolicyVersion: true,
        lastHaircutNudgeAt: true,
        visits: { orderBy: { startedAt: "desc" }, take: 1, select: { startedAt: true } },
        appointments: {
          where: { status: "completed" },
          orderBy: { startsAt: "desc" },
          take: 1,
          select: { startsAt: true },
        },
      },
    });
    const due: Array<{ userId: string; text: string; deliveries: Array<{ channel: SalonChannelName; externalId: string }> }> = [];
    for (const user of users) {
      const stamps = [user.visits[0]?.startedAt, user.appointments[0]?.startsAt].filter(
        (value): value is Date => value instanceof Date,
      );
      const lastVisitAt = stamps.sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
      if (
        !isPromoAudience(
          {
            promoConsentGranted: user.promoConsentGranted,
            promoConsentPolicyVersion: user.promoConsentPolicyVersion,
            anonymizedAt: null,
          },
          version,
        )
      ) {
        continue;
      }
      if (
        !isHaircutNudgeDue({
          lastVisitAt,
          lastNudgeAt: user.lastHaircutNudgeAt,
          now,
          weeks: settings.haircutNudgeWeeks,
        })
      ) {
        continue;
      }
      due.push({
        userId: user.id,
        text: venue.copy.nudge.replace("{weeks}", String(settings.haircutNudgeWeeks)),
        deliveries: this.deliveries(user.telegramId, user.maxUserId),
      });
    }
    return due;
  }

  async markNudge(userId: string, at = new Date()) {
    await this.prisma.user.update({ where: { id: userId }, data: { lastHaircutNudgeAt: at } });
  }

  private leadHours(settings: Settings) {
    const hours = [...settings.reminderLeadHours].sort((left, right) => right - left);
    return [hours[0] ?? 24, hours[1] ?? 2] as const;
  }

  private deliveries(telegramId: bigint, maxUserId: bigint | null) {
    const rows: Array<{ channel: SalonChannelName; externalId: string }> = [];
    if (telegramId > 0n) {
      rows.push({ channel: "telegram", externalId: telegramId.toString() });
    }
    if (maxUserId !== null) {
      rows.push({ channel: "max", externalId: maxUserId.toString() });
    }
    return rows;
  }

  async calendar(input: { branchId?: string; from: Date; to: Date }) {
    const branches = await this.branches();
    const branchId = input.branchId ?? branches[0]?.id;
    const barbers = await this.prisma.barber.findMany({
      where: { active: true, ...(branchId ? { branchId } : {}) },
      orderBy: { sort: "asc" },
    });
    const appointments = await this.prisma.appointment.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        status: { in: ["confirmed", "completed"] },
        startsAt: { lt: input.to },
        endsAt: { gt: input.from },
      },
      include: { user: true, service: true, barber: true, branch: true },
      orderBy: { startsAt: "asc" },
    });
    return {
      branches,
      branchId,
      barbers: barbers.map((barber) => ({
        id: barber.id,
        name: barber.name,
        levelLabel: LEVEL_LABEL[asLevel(barber.level)],
      })),
      appointments: appointments.map((row) => ({
        id: row.id,
        barberId: row.barberId,
        branchId: row.branchId,
        status: row.status,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        service: row.service.name,
        guest: [row.user.firstName, row.user.lastName].filter(Boolean).join(" ") || "Гость",
        phone: maskPhone(row.user.phone),
        priceRub: row.priceRub,
      })),
    };
  }

  async clients(input: { query?: string; branchId?: string }) {
    const query = input.query?.trim();
    const users = await this.prisma.user.findMany({
      where: {
        role: "guest",
        ...(query
          ? {
              OR: [
                { firstName: { contains: query, mode: "insensitive" } },
                { lastName: { contains: query, mode: "insensitive" } },
                { phone: { contains: query.replace(/\D/g, "") } },
              ],
            }
          : {}),
      },
      include: {
        visits: { orderBy: { startedAt: "desc" }, take: 1 },
        appointments: { orderBy: { startsAt: "desc" }, take: 1, include: { branch: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return users
      .filter((user) => {
        if (!input.branchId) {
          return true;
        }
        return (
          user.visits.some((visit) => visit.branchId === input.branchId) ||
          user.appointments.some((appointment) => appointment.branchId === input.branchId)
        );
      })
      .map((user) => ({
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Без имени",
        phone: maskPhone(user.phone),
        balance: user.balance,
        birthday: user.birthday ? DateTime.fromJSDate(user.birthday, { zone: "utc" }).toFormat("dd.MM.yyyy") : null,
        lastVisit: user.visits[0]?.startedAt.toISOString() ?? null,
        nextBooking: user.appointments.find((row) => row.status === "confirmed")?.startsAt.toISOString() ?? null,
        branchName: user.appointments[0]?.branch.name ?? null,
        channels: {
          telegram: user.telegramId > 0n,
          max: user.maxUserId !== null,
        },
        imported: user.importedAt !== null,
      }));
  }

  async staffActor() {
    const staff = await this.store.findUserByTelegramId(SALON_STAFF_TELEGRAM_ID);
    if (!staff) {
      throw new DomainError("not_found", "Не найден пользователь кассы. Запустите сид.");
    }
    return staff;
  }

  async accrue(input: { guestId: string; checkRubles: number; branchId?: string }) {
    const staff = await this.staffActor();
    const result = await applyCheck(this.store, {
      guestId: input.guestId,
      actorId: staff.id,
      checkRubles: input.checkRubles,
      now: new Date(),
    });
    if (input.branchId && result.visit) {
      await this.prisma.visit.update({
        where: { id: result.visit.id },
        data: { branchId: input.branchId },
      });
    }
    return { balance: result.user.balance, bonus: result.bonus };
  }

  async redeem(input: { guestId: string; amount: number }) {
    const staff = await this.staffActor();
    const user = await redeemBonuses(this.store, {
      guestId: input.guestId,
      actorId: staff.id,
      amount: input.amount,
    });
    return { balance: user.balance };
  }

  async broadcast(input: { segment: string; text: string; minBalance?: number; branchId?: string }) {
    const body = input.text.trim();
    if (body.length < 2) {
      throw new DomainError("bad_request", "Пустой текст рассылки");
    }
    const settings = await this.store.getSettings();
    const version = this.policyPublic().version;
    const users = await this.prisma.user.findMany({
      where: {
        role: "guest",
        promoConsentGranted: true,
        promoConsentPolicyVersion: version,
        anonymizedAt: null,
      },
      include: {
        visits: { orderBy: { startedAt: "desc" }, take: 1 },
        appointments: { orderBy: { startsAt: "desc" }, take: 8 },
      },
    });
    const now = new Date();
    const selected = users.filter((user) => {
      if (
        !isPromoAudience(
          {
            promoConsentGranted: user.promoConsentGranted,
            promoConsentPolicyVersion: user.promoConsentPolicyVersion,
            anonymizedAt: user.anonymizedAt,
          },
          version,
        )
      ) {
        return false;
      }
      if (input.segment === "balance_gt") {
        return user.balance >= (input.minBalance ?? 0);
      }
      if (input.segment === "birthday_week") {
        return user.birthday !== null && isBirthdayWeek(user.birthday, now);
      }
      if (input.segment === "branch") {
        return (
          user.visits.some((visit) => visit.branchId === input.branchId) ||
          user.appointments.some((appointment) => appointment.branchId === input.branchId)
        );
      }
      if (input.segment === "inactive_30d") {
        const last = user.visits[0]?.startedAt ?? user.appointments.find((row) => row.status === "completed")?.startsAt;
        if (!last) {
          return now.getTime() - user.createdAt.getTime() > 30 * 24 * 60 * 60 * 1000;
        }
        return now.getTime() - last.getTime() >= 30 * 24 * 60 * 60 * 1000;
      }
      return input.segment === "all";
    });
    const deliveries = selected.flatMap((user) =>
      this.deliveries(user.telegramId, user.maxUserId).map((delivery) => ({ ...delivery, text: body })),
    );
    await this.prisma.adminNotice.create({
      data: {
        kind: "broadcast",
        body: `Рассылка «${input.segment}»: ${selected.length} клиентов`,
        branchId: input.branchId ?? null,
      },
    });
    return { recipients: selected.length, deliveries, nudgeWeeks: settings.haircutNudgeWeeks };
  }

  async notices() {
    return this.prisma.adminNotice.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  }

  async replaceSchedule(barberId: string, days: Array<{ weekday: number; startMin: number; endMin: number }>) {
    await this.prisma.barberSchedule.deleteMany({ where: { barberId } });
    if (days.length === 0) {
      return;
    }
    await this.prisma.barberSchedule.createMany({
      data: days.map((day) => ({ barberId, weekday: day.weekday, startMin: day.startMin, endMin: day.endMin })),
    });
  }

  async schedules() {
    const barbers = await this.prisma.barber.findMany({
      include: { schedules: true, branch: true },
      orderBy: [{ branch: { sort: "asc" } }, { sort: "asc" }],
    });
    return barbers.map((barber) => ({
      id: barber.id,
      name: barber.name,
      level: barber.level,
      levelLabel: LEVEL_LABEL[asLevel(barber.level)],
      branchId: barber.branchId,
      branchName: barber.branch.name,
      active: barber.active,
      rating: barber.rating,
      ratingCount: barber.ratingCount,
      schedules: barber.schedules
        .sort((left, right) => left.weekday - right.weekday)
        .map((row) => ({
          weekday: row.weekday,
          startMin: row.startMin,
          endMin: row.endMin,
          label: `${formatMinutes(row.startMin)}–${formatMinutes(row.endMin)}`,
        })),
    }));
  }

  async createBarber(input: { name: string; level: BarberLevelName; branchId: string }) {
    const barber = await this.prisma.barber.create({
      data: { name: input.name.trim(), level: input.level, branchId: input.branchId },
    });
    await this.replaceSchedule(
      barber.id,
      [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMin: 600, endMin: 1260 })),
    );
    return barber;
  }

  async updatePrice(input: {
    serviceId: string;
    branchId: string;
    level: BarberLevelName;
    priceRub: number;
    durationMinutes: number;
    priceFrom: boolean;
  }) {
    return this.prisma.servicePrice.upsert({
      where: {
        serviceId_branchId_level: {
          serviceId: input.serviceId,
          branchId: input.branchId,
          level: input.level,
        },
      },
      create: {
        serviceId: input.serviceId,
        branchId: input.branchId,
        level: input.level,
        priceRub: input.priceRub,
        durationMinutes: input.durationMinutes,
        priceFrom: input.priceFrom,
      },
      update: {
        priceRub: input.priceRub,
        durationMinutes: input.durationMinutes,
        priceFrom: input.priceFrom,
      },
    });
  }

  dayLabel(isoDate: string) {
    return formatDayLabel(isoDate);
  }

  async planImport(input: { table: string[][]; mapping?: Partial<ColumnMapping> | null; now?: Date }) {
    const known = await this.prisma.user.findMany({
      where: { phone: { not: null } },
      select: { phone: true, birthday: true },
    });
    return buildImportPlan({
      table: input.table,
      mapping: input.mapping,
      now: input.now,
      zone: appTimezone(),
      existing: known.flatMap((user) => (user.phone ? [{ phone: user.phone, birthday: user.birthday }] : [])),
    });
  }

  async applyImport(rows: Parameters<typeof commitClientImport>[1], now?: Date): Promise<ImportReport> {
    return commitClientImport(this.prisma, rows, now);
  }
}
