import { DateTime } from "luxon";
import type { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard, InputFile } from "grammy";
import type { Bot } from "grammy";
import { createExportToken } from "../domain/export-token.ts";
import { exportCsv, exportRowCount, EXPORT_ROW_LIMIT, type ExportType } from "../domain/export.ts";
import {
  formatStatsDetails,
  formatStatsSummary,
  getStatsSummary,
  periodLastDays,
  periodToday,
  staffActionLabel,
  type StatsPeriod,
} from "../domain/stats.ts";
import type { BotContext } from "./context.ts";
import { enterConversation } from "./enter-conversation.ts";
import { MOSCOW } from "../domain/week.ts";

type BotConversation = Conversation<BotContext, BotContext>;

const ADMIN_ONLY = "Только для админа";

const isAdmin = (ctx: BotContext) => ctx.dbUser?.role === "admin";

const requireAdminOrReply = async (ctx: BotContext) => {
  if (isAdmin(ctx)) {
    return true;
  }
  await ctx.reply(ADMIN_ONLY);
  return false;
};

const periodFromKey = (key: string, now: Date): StatsPeriod => {
  if (key === "7") {
    return periodLastDays(now, 7);
  }
  if (key === "30") {
    return periodLastDays(now, 30);
  }
  return periodToday(now);
};

const formatStaffLogLine = async (ctx: BotContext, row: Awaited<ReturnType<typeof ctx.store.listStaffActionLog>>[number]) => {
  const actor = await ctx.store.findUserById(row.actorId);
  const guest = row.guestId === null ? null : await ctx.store.findUserById(row.guestId);
  const actorName = actor ? `${actor.firstName ?? ""}`.trim() || "—" : "—";
  const guestName = guest ? `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim() || "—" : "—";
  const at = DateTime.fromJSDate(row.createdAt, { zone: MOSCOW }).toFormat("dd.MM HH:mm");
  const payload =
    row.action === "check" && typeof row.payload.checkRubles === "number"
      ? ` · чек ${row.payload.checkRubles} ₽`
      : row.action === "redeem" && typeof row.payload.amount === "number"
        ? ` · ${row.payload.amount} бонусов`
        : "";
  return `${at} · ${actorName} · ${staffActionLabel(row.action)} · ${guestName}${payload}`;
};

export async function adminStatsConversation(conversation: BotConversation, ctx: BotContext) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }
  await ctx.reply("Период: сегодня / 7 / 30");
  const raw = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте: сегодня, 7 или 30"),
    })
  ).msg.text.trim().toLowerCase();

  const periodKey =
    raw === "7" || raw === "7d" ? "7" : raw === "30" || raw === "30d" ? "30" : "today";

  const result = await conversation.external(async (outer) => {
    const now = new Date();
    const period = periodFromKey(periodKey, now);
    const summary = await getStatsSummary(outer.store, period, now);
    return formatStatsSummary(summary);
  });

  await ctx.reply(result, {
    reply_markup: new InlineKeyboard().text("Подробнее", `admin:statsDetail:${periodKey}`),
  });
}

export async function adminStaffLogConversation(conversation: BotConversation, ctx: BotContext) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }
  const rows = await conversation.external(async (outer) => {
    const now = new Date();
    return outer.store.listStaffActionLog({
      from: periodLastDays(now, 7).from,
      to: now,
      limit: 20,
      offset: 0,
    });
  });

  if (rows.length === 0) {
    await ctx.reply("История пуста за 7 дней");
    return;
  }

  const lines = await conversation.external(async (outer) => {
    return Promise.all(rows.map((row) => formatStaffLogLine({ ...ctx, store: outer.store }, row)));
  });
  await ctx.reply(lines.join("\n"));
}

export async function adminExportConversation(conversation: BotConversation, ctx: BotContext) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }
  await ctx.reply("Тип: ledger / visits / checkins / coupons / staff_log");
  const typeRaw = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте тип экспорта"),
    })
  ).msg.text.trim() as ExportType;

  const exportResult = await conversation.external(async (outer) => {
    const now = new Date();
    const period = periodLastDays(now, 7);
    const count = await exportRowCount(outer.store, { type: typeRaw, from: period.from, to: now });
    if (count > EXPORT_ROW_LIMIT) {
      const token = createExportToken({ type: typeRaw, from: period.from, to: now, now });
      return { kind: "link" as const, count, token };
    }
    const csv = await exportCsv(outer.store, { type: typeRaw, from: period.from, to: now });
    return { kind: "file" as const, csv };
  });

  if (exportResult.kind === "link") {
    const origin = ctx.config.publicUrl.replace(/\/$/, "");
    await ctx.reply(
      `Слишком много строк (${exportResult.count}). Скачайте по ссылке (15 мин):\n${origin}/api/admin/export.csv?token=${exportResult.token}`,
    );
    return;
  }

  await ctx.replyWithDocument(new InputFile(Buffer.from(exportResult.csv, "utf-8"), `${typeRaw}.csv`));
}

export function wireAdminOpsHandlers(bot: Bot<BotContext>) {
  bot.hears("Статистика", async (ctx) => {
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    await enterConversation(ctx, "adminStats");
  });

  bot.hears("История персонала", async (ctx) => {
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    await enterConversation(ctx, "adminStaffLog");
  });

  bot.hears("Экспорт", async (ctx) => {
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    await enterConversation(ctx, "adminExport");
  });

  bot.callbackQuery(/^admin:statsDetail:(today|7|30)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    const key = ctx.match[1] ?? "today";
    const now = new Date();
    const details = await formatStatsDetails(ctx.store, periodFromKey(key, now));
    await ctx.reply(details);
  });
}
