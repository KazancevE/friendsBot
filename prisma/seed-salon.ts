import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import type { PrismaClient } from "@prisma/client";
import {
  ALL_LEVELS,
  parsePriceCsv,
  serviceSlug,
  type BarberLevelName,
} from "../src/salon/catalog.ts";
import { SALON_DEFAULT_CASHBACK_PERCENT } from "../src/salon/money.ts";
import { DEMO_GUEST_TELEGRAM_ID, SALON_STAFF_TELEGRAM_ID } from "../src/salon/service.ts";

const BRANCHES = [
  {
    slug: "vasilyeva",
    name: "Васильева 55",
    address: "Бийск, ул. им. Героя Советского Союза Васильева, 55, 1 этаж",
    sort: 1,
  },
  {
    slug: "uchilishny",
    name: "Училищный 7",
    address: "Бийск, Училищный пер., 7",
    sort: 2,
  },
] as const;

const MASTERS: Array<{
  branch: "vasilyeva" | "uchilishny";
  name: string;
  level: BarberLevelName;
  rating: number | null;
  ratingCount: number;
  sort: number;
}> = [
  { branch: "vasilyeva", name: "Денис", level: "chef", rating: 5, ratingCount: 95, sort: 1 },
  { branch: "vasilyeva", name: "Алексей", level: "senior", rating: 4.8, ratingCount: 11, sort: 2 },
  { branch: "vasilyeva", name: "Севда", level: "senior", rating: 5, ratingCount: 43, sort: 3 },
  { branch: "vasilyeva", name: "Владислав", level: "barber", rating: 5, ratingCount: 6, sort: 4 },
  { branch: "uchilishny", name: "Арут", level: "chef", rating: 5, ratingCount: 30, sort: 1 },
  { branch: "uchilishny", name: "Анна", level: "senior", rating: 5, ratingCount: 46, sort: 2 },
  { branch: "uchilishny", name: "Роман", level: "barber", rating: 5, ratingCount: 31, sort: 3 },
  { branch: "uchilishny", name: "Вячеслав", level: "barber", rating: 5, ratingCount: 17, sort: 4 },
  { branch: "uchilishny", name: "Виктория", level: "barber", rating: 5, ratingCount: 2, sort: 5 },
  { branch: "uchilishny", name: "Елена", level: "junior", rating: null, ratingCount: 0, sort: 6 },
];

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
    await setSetting(prisma, "percent", String(SALON_DEFAULT_CASHBACK_PERCENT));
    await setSetting(prisma, "venueTimezone", "Asia/Barnaul");
    await setSetting(prisma, "haircutNudgeWeeks", "4");
    await setSetting(prisma, "reminderLeadHours", JSON.stringify([24, 2]));
    await setSetting(prisma, "referralBonusReferrer", "300");
    await setSetting(prisma, "referralBonusReferee", "300");
    await setSetting(prisma, "birthdayBonus", "500");
    await setSetting(prisma, "bookingHoursStart", "10");
    await setSetting(prisma, "bookingHoursEnd", "21");
    await setSetting(prisma, "bookingSlotMinutes", "30");
    await prisma.contentPage.upsert({
      where: { slug: "contacts" },
      create: {
        slug: "contacts",
        body: "Daddyson, Бийск. Два филиала, ежедневно 10:00–21:00. Запись в боте и в карте гостя.",
        mapUrl: null,
      },
      update: {
        body: "Daddyson, Бийск. Два филиала, ежедневно 10:00–21:00. Запись в боте и в карте гостя.",
      },
    });
    await setSetting(prisma, "salon.seeded", "1");
  }

  for (const branch of BRANCHES) {
    await prisma.branch.upsert({
      where: { slug: branch.slug },
      create: { ...branch, openMin: 600, closeMin: 1260, city: "Бийск" },
      update: { name: branch.name, address: branch.address, sort: branch.sort },
    });
  }
  const branches = await prisma.branch.findMany();
  const branchId = new Map(branches.map((branch) => [branch.slug, branch.id]));

  if ((await prisma.service.count()) === 0) {
    const csv = readFileSync("prisma/data/prices_dikidi.csv", "utf8");
    const parsed = parsePriceCsv(csv);
    const services = new Map<string, { name: string; category: string; sort: number }>();
    let sort = 0;
    for (const row of parsed) {
      if (!services.has(row.serviceName)) {
        services.set(row.serviceName, { name: row.serviceName, category: row.category, sort });
        sort += 1;
      }
    }
    for (const service of services.values()) {
      await prisma.service.create({
        data: { slug: serviceSlug(service.name), name: service.name, category: service.category, sort: service.sort },
      });
    }
    const serviceRows = await prisma.service.findMany();
    const serviceId = new Map(serviceRows.map((service) => [service.name, service.id]));
    const prices = new Map<string, { serviceId: string; branchId: string; level: BarberLevelName; priceRub: number; priceFrom: boolean; durationMinutes: number; anyLevel: boolean }>();
    for (const row of parsed) {
      const sid = serviceId.get(row.serviceName);
      const bid = branchId.get(row.branchSlug);
      if (!sid || !bid) {
        continue;
      }
      const levels: BarberLevelName[] = row.level === "any" ? ALL_LEVELS : [row.level];
      for (const level of levels) {
        const key = `${sid}|${bid}|${level}`;
        const existing = prices.get(key);
        if (existing && !existing.anyLevel) {
          continue;
        }
        if (existing && row.level === "any") {
          continue;
        }
        prices.set(key, {
          serviceId: sid,
          branchId: bid,
          level,
          priceRub: row.priceRub,
          priceFrom: row.priceFrom,
          durationMinutes: row.durationMinutes,
          anyLevel: row.level === "any",
        });
      }
    }
    await prisma.servicePrice.createMany({ data: [...prices.values()] });
  }

  for (const master of MASTERS) {
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
          rating: master.rating,
          ratingCount: master.ratingCount,
          sort: master.sort,
        },
      }));
    const scheduleCount = await prisma.barberSchedule.count({ where: { barberId: barber.id } });
    if (scheduleCount === 0) {
      await prisma.barberSchedule.createMany({
        data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          barberId: barber.id,
          weekday,
          startMin: 600,
          endMin: 1260,
        })),
      });
    }
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
      referralCode: "DADDYSON",
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
      lastName: "Daddyson",
      qrToken: "salon-staff-qr",
      phone: null,
    },
    update: { role: "admin" },
  });

  const demoBookings = await prisma.appointment.count({ where: { userId: guest.id } });
  if (demoBookings === 0) {
    const zone = "Asia/Barnaul";
    const haircut = await prisma.service.findFirst({ where: { name: "Стрижка" } });
    const beard = await prisma.service.findFirst({ where: { name: "Оформление бороды и усов" } });
    const denis = await prisma.barber.findFirst({ where: { name: "Денис" } });
    const arut = await prisma.barber.findFirst({ where: { name: "Арут" } });
    const tomorrow = DateTime.now().setZone(zone).plus({ days: 1 }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
    const after = DateTime.now().setZone(zone).plus({ days: 2 }).set({ hour: 16, minute: 0, second: 0, millisecond: 0 });
    if (haircut && denis) {
      const price = await prisma.servicePrice.findFirst({
        where: { serviceId: haircut.id, branchId: denis.branchId, level: denis.level },
      });
      await prisma.appointment.create({
        data: {
          userId: guest.id,
          branchId: denis.branchId,
          serviceId: haircut.id,
          barberId: denis.id,
          startsAt: tomorrow.toJSDate(),
          endsAt: tomorrow.plus({ minutes: price?.durationMinutes ?? 40 }).toJSDate(),
          priceRub: price?.priceRub ?? 1900,
          status: "confirmed",
        },
      });
    }
    if (beard && arut) {
      const price = await prisma.servicePrice.findFirst({
        where: { serviceId: beard.id, branchId: arut.branchId, level: arut.level },
      });
      await prisma.appointment.create({
        data: {
          userId: guest.id,
          branchId: arut.branchId,
          serviceId: beard.id,
          barberId: arut.id,
          startsAt: after.toJSDate(),
          endsAt: after.plus({ minutes: price?.durationMinutes ?? 30 }).toJSDate(),
          priceRub: price?.priceRub ?? 1300,
          status: "confirmed",
        },
      });
    }
  }
}
