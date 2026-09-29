import { DateTime } from "luxon";
import type { PrismaClient } from "@prisma/client";
import { serviceSlug, type BarberLevelName } from "../src/salon/catalog.ts";
import { newQrToken } from "../src/domain/qr-token.ts";
import { telegramAdminIdsFromEnv } from "../src/prod/telegram-admins.ts";
import { DEMO_GUEST_TELEGRAM_ID, SALON_STAFF_TELEGRAM_ID } from "../src/salon/service.ts";
import { venue } from "../src/venue/salon.ts";

const setSetting = async (prisma: PrismaClient, key: string, value: string) => {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
};

export async function seedSalon(prisma: PrismaClient) {
  const already = await prisma.setting.findUnique({ where: { key: "salon.seeded" } });
  if (!already) {
    await setSetting(prisma, "percent", String(venue.loyalty.cashbackPercent));
    await setSetting(prisma, "venueTimezone", venue.timezone);
    await setSetting(prisma, "haircutNudgeWeeks", String(venue.loyalty.haircutNudgeWeeks));
    await setSetting(prisma, "reminderLeadHours", JSON.stringify(venue.loyalty.reminderLeadHours));
    await setSetting(prisma, "referralBonusReferrer", String(venue.loyalty.referralReferrer));
    await setSetting(prisma, "referralBonusReferee", String(venue.loyalty.referralReferee));
    await setSetting(prisma, "birthdayBonus", String(venue.loyalty.birthdayBonus));
    await setSetting(prisma, "bookingHoursStart", String(venue.openMin / 60));
    await setSetting(prisma, "bookingHoursEnd", String(venue.closeMin / 60));
    await setSetting(prisma, "bookingSlotMinutes", "30");
    await setSetting(prisma, "importWelcomeBonus", String(venue.loyalty.importWelcomeBonus));
    await prisma.contentPage.upsert({
      where: { slug: "contacts" },
      create: { slug: "contacts", body: venue.copy.contactsBody, mapUrl: null },
      update: { body: venue.copy.contactsBody },
    });
    await setSetting(prisma, "salon.seeded", "1");
  }

  for (const branch of venue.branches) {
    await prisma.branch.upsert({
      where: { slug: branch.slug },
      create: {
        slug: branch.slug,
        name: branch.name,
        address: branch.address,
        sort: branch.sort,
        openMin: venue.openMin,
        closeMin: venue.closeMin,
        city: branch.city,
      },
      update: {
        name: branch.name,
        address: branch.address,
        sort: branch.sort,
        city: branch.city,
        openMin: venue.openMin,
        closeMin: venue.closeMin,
      },
    });
  }
  const branches = await prisma.branch.findMany();
  const branchId = new Map(branches.map((branch) => [branch.slug, branch.id]));

  if ((await prisma.service.count()) === 0) {
    const services = venue.services.map((service, sort) => ({ ...service, sort }));
    for (const service of services) {
      await prisma.service.create({
        data: { slug: serviceSlug(service.name), name: service.name, category: service.category, sort: service.sort },
      });
    }
    const serviceRows = await prisma.service.findMany();
    const serviceId = new Map(serviceRows.map((service) => [service.name, service.id]));
    const levelsAtBranch = new Map<string, Set<BarberLevelName>>();
    for (const master of venue.masters) {
      const set = levelsAtBranch.get(master.branch) ?? new Set<BarberLevelName>();
      set.add(master.level);
      levelsAtBranch.set(master.branch, set);
    }
    const prices: Array<{
      serviceId: string;
      branchId: string;
      level: BarberLevelName;
      priceRub: number;
      priceFrom: boolean;
      durationMinutes: number;
      anyLevel: boolean;
    }> = [];
    for (const service of venue.services) {
      const sid = serviceId.get(service.name);
      if (!sid) {
        continue;
      }
      for (const slug of service.branches) {
        const bid = branchId.get(slug);
        const levels = levelsAtBranch.get(slug);
        if (!bid || !levels) {
          continue;
        }
        for (const level of levels) {
          prices.push({
            serviceId: sid,
            branchId: bid,
            level,
            priceRub: service.priceRub,
            priceFrom: false,
            durationMinutes: service.durationMinutes,
            anyLevel: false,
          });
        }
      }
    }
    await prisma.servicePrice.createMany({ data: prices });
  }

  for (const master of venue.masters) {
    const bid = branchId.get(master.branch);
    if (!bid) {
      continue;
    }
    const existing = await prisma.barber.findFirst({ where: { name: master.name, branchId: bid } });
    const barber =
      existing ??
      (await prisma.barber.create({
        data: {
          name: master.name,
          level: master.level,
          branchId: bid,
          rating: null,
          ratingCount: 0,
          sort: master.sort,
        },
      }));
    const scheduleCount = await prisma.barberSchedule.count({ where: { barberId: barber.id } });
    if (scheduleCount === 0) {
      await prisma.barberSchedule.createMany({
        data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          barberId: barber.id,
          weekday,
          startMin: venue.openMin,
          endMin: venue.closeMin,
        })),
      });
    }
  }

  if ((await prisma.promo.count()) === 0) {
    await prisma.promo.create({ data: { body: venue.examplePromo, showInFeed: true } });
  }

  const guest = await prisma.user.upsert({
    where: { telegramId: DEMO_GUEST_TELEGRAM_ID },
    create: {
      telegramId: DEMO_GUEST_TELEGRAM_ID,
      role: "guest",
      firstName: "Демо",
      lastName: "Гость",
      balance: 740,
      qrToken: "demo-guest-qr",
      referralCode: "BRO",
      phone: null,
      birthday: new Date("1992-04-15"),
    },
    update: {},
  });
  await prisma.user.upsert({
    where: { telegramId: SALON_STAFF_TELEGRAM_ID },
    create: {
      telegramId: SALON_STAFF_TELEGRAM_ID,
      role: "admin",
      firstName: "Касса",
      lastName: venue.brandName,
      qrToken: "salon-staff-qr",
      phone: null,
    },
    update: { role: "admin" },
  });
  for (const telegramId of telegramAdminIdsFromEnv(process.env.TELEGRAM_ADMIN_ID)) {
    if (telegramId === DEMO_GUEST_TELEGRAM_ID || telegramId === SALON_STAFF_TELEGRAM_ID) {
      continue;
    }
    await prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        role: "admin",
        firstName: "Админ",
        lastName: null,
        qrToken: newQrToken(),
        phone: null,
      },
      update: { role: "admin" },
    });
  }

  const demoBookings = await prisma.appointment.count({ where: { userId: guest.id } });
  if (demoBookings === 0) {
    const zone = venue.timezone;
    const haircut = await prisma.service.findFirst({ where: { name: "Мужская стрижка" } });
    const beard = await prisma.service.findFirst({ where: { name: "Оформление бороды" } });
    const lenina = branchId.get("lenina126");
    const lazurnaya = branchId.get("lazurnaya19");
    const ambassador = lenina
      ? await prisma.barber.findFirst({ where: { branchId: lenina, level: "chef" } })
      : null;
    const top = lazurnaya
      ? await prisma.barber.findFirst({ where: { branchId: lazurnaya, level: "senior" } })
      : null;
    const tomorrow = DateTime.now().setZone(zone).plus({ days: 1 }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
    const after = DateTime.now().setZone(zone).plus({ days: 2 }).set({ hour: 16, minute: 0, second: 0, millisecond: 0 });
    if (haircut && ambassador) {
      const price = await prisma.servicePrice.findFirst({
        where: { serviceId: haircut.id, branchId: ambassador.branchId, level: ambassador.level },
      });
      await prisma.appointment.create({
        data: {
          userId: guest.id,
          branchId: ambassador.branchId,
          serviceId: haircut.id,
          barberId: ambassador.id,
          startsAt: tomorrow.toJSDate(),
          endsAt: tomorrow.plus({ minutes: price?.durationMinutes ?? 50 }).toJSDate(),
          priceRub: price?.priceRub ?? 1800,
          status: "confirmed",
        },
      });
    }
    if (beard && top) {
      const price = await prisma.servicePrice.findFirst({
        where: { serviceId: beard.id, branchId: top.branchId, level: top.level },
      });
      await prisma.appointment.create({
        data: {
          userId: guest.id,
          branchId: top.branchId,
          serviceId: beard.id,
          barberId: top.id,
          startsAt: after.toJSDate(),
          endsAt: after.plus({ minutes: price?.durationMinutes ?? 40 }).toJSDate(),
          priceRub: price?.priceRub ?? 1300,
          status: "confirmed",
        },
      });
    }
  }
}
