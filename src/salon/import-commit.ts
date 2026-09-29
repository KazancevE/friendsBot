import { DateTime } from "luxon";
import type { PrismaClient } from "@prisma/client";
import { newQrToken } from "../domain/qr-token.ts";
import { appTimezone } from "../domain/week.ts";
import { canonicalService } from "./catalog.ts";
import { importTelegramId, type PlannedImportRow } from "./import.ts";

const fold = (value: string) => value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

export type ImportReport = {
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  bookingsCreated: number;
  bookingsSkipped: number;
  visitsWritten: number;
  messagesSent: 0;
  lines: Array<{ line: number; action: string; detail: string }>;
};

const matchBranch = (label: string, branches: Array<{ id: string; name: string; slug: string }>) => {
  const text = fold(label);
  if (!text) {
    return null;
  }
  if (text.includes("василь")) {
    return branches.find((branch) => branch.slug === "vasilyeva") ?? null;
  }
  if (text.includes("училищ")) {
    return branches.find((branch) => branch.slug === "uchilishny") ?? null;
  }
  return branches.find((branch) => fold(branch.name).includes(text) || text.includes(fold(branch.name))) ?? null;
};

export async function commitClientImport(prisma: PrismaClient, rows: PlannedImportRow[], now = new Date()): Promise<ImportReport> {
  const report: ImportReport = {
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    bookingsCreated: 0,
    bookingsSkipped: 0,
    visitsWritten: 0,
    messagesSent: 0,
    lines: [],
  };
  const zone = appTimezone();
  const branches = await prisma.branch.findMany();
  const services = await prisma.service.findMany({ where: { active: true } });
  const barbers = await prisma.barber.findMany({ where: { active: true } });
  const staff =
    (await prisma.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" } })) ?? null;

  for (const row of rows) {
    if (row.action === "error" || !row.phone) {
      report.errors += 1;
      report.lines.push({ line: row.line, action: "error", detail: row.errors.join("; ") || "Пропуск" });
      continue;
    }
    const phone = row.phone;
    const existing = await prisma.user.findUnique({ where: { phone } });
    let userId: string;
    let dirty = false;
    if (!existing) {
      const created = await prisma.user.create({
        data: {
          telegramId: importTelegramId(phone),
          role: "guest",
          firstName: row.name,
          lastName: row.lastName,
          birthday: row.birthday,
          phone,
          qrToken: newQrToken(),
          staffNote: row.notes,
          importedAt: now,
          preferredBarberName: row.preferredMaster,
          importedVisitCount: row.visitsCount,
          importedSpentRub: row.totalSpent,
        },
      });
      userId = created.id;
      report.created += 1;
      dirty = true;
    } else {
      userId = existing.id;
      const note = mergeNote(existing.staffNote, row.notes);
      const data: {
        firstName?: string;
        lastName?: string;
        birthday?: Date;
        staffNote?: string;
        preferredBarberName?: string;
        importedVisitCount?: number;
        importedSpentRub?: number;
        importedAt?: Date;
      } = {};
      if (!existing.firstName && row.name) data.firstName = row.name;
      if (!existing.lastName && row.lastName) data.lastName = row.lastName;
      if (!existing.birthday && row.birthday) data.birthday = row.birthday;
      if (note !== existing.staffNote) data.staffNote = note ?? undefined;
      if (row.preferredMaster && row.preferredMaster !== existing.preferredBarberName) {
        data.preferredBarberName = row.preferredMaster;
      }
      if (row.visitsCount !== null && row.visitsCount !== existing.importedVisitCount) {
        data.importedVisitCount = row.visitsCount;
      }
      if (row.totalSpent !== null && row.totalSpent !== existing.importedSpentRub) {
        data.importedSpentRub = row.totalSpent;
      }
      if (!existing.importedAt) data.importedAt = now;
      if (Object.keys(data).length > 0) {
        await prisma.user.update({ where: { id: existing.id }, data });
        dirty = true;
      }
    }

    if (row.lastVisit) {
      if (!staff) {
        report.lines.push({ line: row.line, action: "warning", detail: "Нет пользователя кассы, визит не записан" });
      } else {
        const written = await upsertImportedVisit(prisma, {
          userId,
          phone,
          startedAt: row.lastVisit,
          branchId: row.branchLabel ? matchBranch(row.branchLabel, branches)?.id ?? null : null,
          openedBy: staff.id,
        });
        if (written) {
          report.visitsWritten += 1;
          dirty = true;
        }
      }
    }

    if (row.booking) {
      const placed = await placeImportedBooking(prisma, {
        userId,
        phone,
        booking: row.booking,
        branches,
        services,
        barbers,
        zone,
      });
      if (placed.ok) {
        report.bookingsCreated += placed.created ? 1 : 0;
        if (placed.created) dirty = true;
      } else {
        report.bookingsSkipped += 1;
        report.lines.push({ line: row.line, action: "warning", detail: placed.reason });
      }
    }

    if (existing && !dirty) {
      report.unchanged += 1;
      report.lines.push({ line: row.line, action: "unchanged", detail: "Уже импортирован" });
    } else if (existing) {
      report.updated += 1;
      report.lines.push({ line: row.line, action: "update", detail: "Карта обновлена, сообщения не отправлялись" });
    } else {
      report.lines.push({ line: row.line, action: "create", detail: "Карта без мессенджера, сообщения не отправлялись" });
    }
  }
  return report;
}

const mergeNote = (current: string | null, incoming: string | null) => {
  if (!incoming) {
    return current;
  }
  if (!current) {
    return incoming;
  }
  if (current.includes(incoming)) {
    return current;
  }
  return `${current}\n${incoming}`;
};

const upsertImportedVisit = async (
  prisma: PrismaClient,
  input: { userId: string; phone: string; startedAt: Date; branchId: string | null; openedBy: string },
) => {
  const importKey = `last:${input.phone}`;
  const existing = await prisma.visit.findUnique({ where: { importKey } });
  const endsAt = new Date(input.startedAt.getTime() + 30 * 60 * 1000);
  if (!existing) {
    await prisma.visit.create({
      data: {
        userId: input.userId,
        openedBy: input.openedBy,
        startedAt: input.startedAt,
        endsAt,
        branchId: input.branchId,
        importKey,
      },
    });
    return true;
  }
  if (input.startedAt.getTime() > existing.startedAt.getTime()) {
    await prisma.visit.update({
      where: { id: existing.id },
      data: { startedAt: input.startedAt, endsAt, branchId: input.branchId ?? existing.branchId },
    });
    return true;
  }
  return false;
};

const placeImportedBooking = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    phone: string;
    booking: NonNullable<PlannedImportRow["booking"]>;
    branches: Array<{ id: string; name: string; slug: string }>;
    services: Array<{ id: string; name: string }>;
    barbers: Array<{ id: string; name: string; branchId: string; level: "junior" | "barber" | "senior" | "chef" }>;
    zone: string;
  },
): Promise<{ ok: true; created: boolean } | { ok: false; reason: string }> => {
  const branch = matchBranch(input.booking.branch, input.branches);
  if (!branch) {
    return { ok: false, reason: `Филиал «${input.booking.branch}» не найден` };
  }
  const wanted = fold(canonicalService(input.booking.service).name);
  const service =
    input.services.find((item) => fold(item.name) === wanted || fold(item.name) === fold(input.booking.service)) ?? null;
  if (!service) {
    return { ok: false, reason: `Услуга «${input.booking.service}» не найдена` };
  }
  const masterName = fold(input.booking.master);
  const barber =
    input.barbers.find((item) => item.branchId === branch.id && fold(item.name) === masterName) ??
    input.barbers.find((item) => fold(item.name) === masterName) ??
    null;
  if (!barber) {
    return { ok: false, reason: `Мастер «${input.booking.master}» не найден` };
  }
  const stamp = DateTime.fromJSDate(input.booking.at, { zone: input.zone }).toFormat("yyyyLLddHHmm");
  const importKey = `book:${input.phone}:${stamp}`;
  const existing = await prisma.appointment.findUnique({ where: { importKey } });
  if (existing) {
    return { ok: true, created: false };
  }
  const price = await prisma.servicePrice.findFirst({
    where: { serviceId: service.id, branchId: barber.branchId, level: barber.level },
  });
  const duration = price?.durationMinutes ?? 40;
  const endsAt = new Date(input.booking.at.getTime() + duration * 60 * 1000);
  const clash = await prisma.appointment.findFirst({
    where: {
      barberId: barber.id,
      status: "confirmed",
      startsAt: { lt: endsAt },
      endsAt: { gt: input.booking.at },
    },
  });
  if (clash) {
    return { ok: false, reason: "Это время у мастера уже занято" };
  }
  await prisma.appointment.create({
    data: {
      userId: input.userId,
      branchId: barber.branchId,
      serviceId: service.id,
      barberId: barber.id,
      startsAt: input.booking.at,
      endsAt,
      priceRub: price?.priceRub ?? 0,
      status: "confirmed",
      importKey,
    },
  });
  return { ok: true, created: true };
};
