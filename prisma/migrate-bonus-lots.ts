/**
 * One-time data migration: rebuild BonusLot rows from ledger history.
 * Run after applying prisma migrate: `tsx prisma/migrate-bonus-lots.ts`
 */
import { PrismaClient } from "@prisma/client";
import {
  lotCategoryForLedger,
  ttlDaysForCategory,
} from "../src/domain/bonus-lots.ts";
import { expiresAfterDays } from "../src/domain/settings.ts";
import type { LedgerType } from "../src/domain/types.ts";
import { PrismaStore } from "../src/store/prisma-store.ts";

const CREDIT_TYPES = new Set<LedgerType>([
  "check",
  "registration",
  "birthday",
  "manual",
  "weekly_prize",
]);

type VirtualLot = {
  ledgerId: string;
  category: "gift" | "check";
  remaining: number;
  createdAt: Date;
};

const prisma = new PrismaClient();
const store = new PrismaStore(prisma);

const spendFromVirtual = (lots: VirtualLot[], amount: number) => {
  let left = amount;
  const gift = lots.filter((lot) => lot.category === "gift" && lot.remaining > 0);
  const check = lots.filter((lot) => lot.category === "check" && lot.remaining > 0);
  for (const lot of [...gift, ...check]) {
    if (left <= 0) break;
    const take = Math.min(lot.remaining, left);
    lot.remaining -= take;
    left -= take;
  }
};

async function main() {
  const settings = await store.getSettings();
  const users = await prisma.user.findMany({ select: { id: true, balance: true } });

  for (const user of users) {
    await prisma.bonusLot.deleteMany({ where: { userId: user.id } });
    const rows = await prisma.ledger.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    const virtual: VirtualLot[] = [];
    for (const row of rows) {
      const type = row.type as LedgerType;
      if (CREDIT_TYPES.has(type) && row.amount > 0) {
        const category = lotCategoryForLedger(type, row.amount);
        if (category !== null) {
          virtual.push({
            ledgerId: row.id,
            category,
            remaining: row.amount,
            createdAt: row.createdAt,
          });
        }
        continue;
      }
      if (type === "redeem" || (type === "manual" && row.amount < 0)) {
        spendFromVirtual(virtual, Math.abs(row.amount));
      }
    }

    let rebuilt = 0;
    for (const lot of virtual) {
      if (lot.remaining <= 0) continue;
      const ttl = ttlDaysForCategory(lot.category, settings);
      const expiresAt = expiresAfterDays(lot.createdAt, ttl);
      await store.createBonusLot({
        userId: user.id,
        ledgerId: lot.ledgerId,
        category: lot.category,
        initial: lot.remaining,
        remaining: expiresAt.getTime() <= Date.now() ? 0 : lot.remaining,
        expiresAt,
        createdAt: lot.createdAt,
      });
      rebuilt += lot.remaining;
    }

    const diff = user.balance - rebuilt;
    if (diff > 0) {
      await store.createBonusLot({
        userId: user.id,
        ledgerId: null,
        category: "gift",
        initial: diff,
        remaining: diff,
        expiresAt: expiresAfterDays(new Date(), settings.giftBonusTtlDays),
        createdAt: new Date(),
      });
    }
  }

  const couponDays = settings.couponClaimDays;
  const coupons = await prisma.coupon.findMany();
  for (const coupon of coupons) {
    let base = new Date();
    if (coupon.weekId) {
      const week = await prisma.gameWeek.findUnique({ where: { id: coupon.weekId } });
      if (week?.closedAt) {
        base = week.closedAt;
      }
    }
    await prisma.coupon.update({
      where: { id: coupon.id },
      data: { expiresAt: expiresAfterDays(base, couponDays) },
    });
  }

  console.log("bonus lot migration complete");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
