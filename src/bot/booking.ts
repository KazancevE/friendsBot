import { DateTime } from "luxon";
import type { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import {
  assignTableToBooking,
  createBookingRequest,
  formatBookingSlot,
  handleBookingRequest,
  listAvailableBookingSlots,
  listAvailableTablesForSlot,
  listBookingsForMoscowDay,
  moveBookingTable,
} from "../domain/booking.ts";
import { DomainError } from "../domain/errors.ts";
import { listOnDutyStaffTelegramIds } from "../domain/staff-schedule.ts";
import type { BotContext } from "./context.ts";
import { enterConversation } from "./enter-conversation.ts";
import { MOSCOW } from "../domain/week.ts";

type BotConversation = Conversation<BotContext, BotContext>;

const isStaffRole = (role: string | undefined) => role === "master" || role === "admin";

export async function guestBookingConversation(conversation: BotConversation, ctx: BotContext) {
  if (!ctx.dbUser) {
    await ctx.reply("Сначала зарегистрируйтесь");
    return;
  }

  await ctx.reply("Дата брони (ДД.ММ.ГГГГ)");
  const dateRaw = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте дату"),
    })
  ).msg.text.trim();
  const parsedDate = DateTime.fromFormat(dateRaw, "dd.MM.yyyy", { zone: MOSCOW });
  if (!parsedDate.isValid) {
    await ctx.reply("Некорректная дата");
    return;
  }

  await ctx.reply("Сколько гостей?");
  const partySize = await conversation.form.int({
    otherwise: (c) => c.reply("Введите число от 1 до 20"),
  });

  const available = await conversation.external((outer) =>
    listAvailableBookingSlots(outer.store, {
      day: parsedDate.startOf("day").toJSDate(),
      partySize,
      now: new Date(),
    }),
  );
  if (available.length === 0) {
    await ctx.reply("На эту дату нет свободных слотов");
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const slot of available) {
    const label = `${String(slot.hour % 24).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
    keyboard.text(label, `booking:slot:${slot.requestedFor.getTime()}`).row();
  }
  await ctx.reply("Выберите время", { reply_markup: keyboard });

  const slotCtx = await conversation.waitFor("callback_query:data");
  await slotCtx.answerCallbackQuery();
  const data = slotCtx.callbackQuery.data;
  const match = /^booking:slot:(\d+)$/.exec(data);
  if (match === null) {
    await ctx.reply("Время не выбрано");
    return;
  }
  const requestedFor = new Date(Number(match[1]));

  const tables = await conversation.external((outer) =>
    listAvailableTablesForSlot(outer.store, { requestedFor, partySize }),
  );
  const freeTables = tables.filter((table) => table.free);
  let tableId: string | null = null;
  if (freeTables.length > 0) {
    const tableKeyboard = new InlineKeyboard();
    tableKeyboard.text("Любой стол", "booking:table:any").row();
    for (const table of freeTables.slice(0, 20)) {
      const hint = table.highlights.length > 0 ? ` · ${table.highlights[0]}` : "";
      tableKeyboard.text(`${table.label}${hint}`, `booking:table:${table.id}`).row();
    }
    await ctx.reply("Выберите стол (необязательно)", { reply_markup: tableKeyboard });
    const tableCtx = await conversation.waitFor("callback_query:data");
    await tableCtx.answerCallbackQuery();
    const tableData = tableCtx.callbackQuery.data;
    const tableMatch = /^booking:table:(.+)$/.exec(tableData);
    if (tableMatch !== null && tableMatch[1] !== "any") {
      tableId = tableMatch[1]!;
    }
  }

  await ctx.reply("Комментарий (или «-»)");
  const commentRaw = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте комментарий или «-»"),
    })
  ).msg.text.trim();
  const comment = commentRaw === "-" || commentRaw.length === 0 ? null : commentRaw;

  const result = await conversation.external(async (outer) => {
    try {
      const booking = await createBookingRequest(outer.store, {
        userId: outer.dbUser!.id,
        requestedFor,
        partySize,
        comment,
        tableId,
        now: new Date(),
      });
      return { ok: true as const, booking };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });

  if (!result.ok) {
    await ctx.reply(result.message);
    return;
  }

  const tableLabel =
    result.booking.tableId !== null
      ? tables.find((table) => table.id === result.booking.tableId)?.label
      : null;
  const tablePart = tableLabel !== undefined && tableLabel !== null ? `, стол ${tableLabel}` : "";
  await ctx.reply(`Заявка отправлена на ${formatBookingSlot(result.booking.requestedFor)}${tablePart}`);

  await conversation.external(async (outer) => {
    const guest = outer.dbUser;
    if (guest === null) {
      return;
    }
    const notifyIds = await listOnDutyStaffTelegramIds(outer.store, new Date());
    const text = [
      "📅 Новая заявка на бронь",
      `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim(),
      formatBookingSlot(result.booking.requestedFor),
      `${result.booking.partySize} чел.`,
      tableLabel !== undefined && tableLabel !== null ? `Стол: ${tableLabel}` : "",
      result.booking.comment ?? "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");
    const keyboard = new InlineKeyboard()
      .text("Подтвердить", `booking:confirm:${result.booking.id}`)
      .text("Отменить", `booking:cancel:${result.booking.id}`);
    await Promise.all(
      notifyIds.map(async (telegramId) => {
        try {
          await outer.api.sendMessage(telegramId.toString(), text, { reply_markup: keyboard });
        } catch {
          // ignore
        }
      }),
    );
  });
}

export function wireBookingHandlers(bot: Bot<BotContext>) {
  bot.hears("Брони сегодня", async (ctx) => {
    if (!isStaffRole(ctx.dbUser?.role)) {
      await ctx.reply("Недостаточно прав");
      return;
    }
    const rows = await listBookingsForMoscowDay(ctx.store, new Date());
    const active = rows.filter(
      (row) => row.status === "pending" || row.status === "confirmed" || row.status === "seated",
    );
    if (active.length === 0) {
      await ctx.reply("На сегодня броней нет");
      return;
    }
    const lines = await Promise.all(
      active.map(async (row) => {
        const guest = await ctx.store.findUserById(row.userId);
        const name = guest
          ? `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim() || "Гость"
          : "Гость";
        const tablePart = row.tableLabel ? ` · ${row.tableLabel}` : "";
        return `${formatBookingSlot(row.requestedFor)} · ${name} · ${row.partySize} чел.${tablePart} · ${row.status}`;
      }),
    );
    await ctx.reply(["Брони на сегодня:", ...lines].join("\n"));
  });

  bot.hears("Забронировать", async (ctx) => {
    if (!ctx.dbUser) {
      await enterConversation(ctx, "registerGuest");
      return;
    }
    await enterConversation(ctx, "guestBooking");
  });

  bot.callbackQuery(/^booking:(confirm|cancel):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isStaffRole(ctx.dbUser?.role)) {
      await ctx.reply("Недостаточно прав");
      return;
    }
    const matched = ctx.match;
    const action = Array.isArray(matched) ? matched[1] : undefined;
    const bookingId = Array.isArray(matched) ? matched[2] : undefined;
    if (action === undefined || bookingId === undefined || !ctx.dbUser) {
      return;
    }
    try {
      const booking = await handleBookingRequest(ctx.store, {
        bookingId,
        actorId: ctx.dbUser.id,
        status: action === "confirm" ? "confirmed" : "cancelled",
        now: new Date(),
      });
      const guest = await ctx.store.findUserById(booking.userId);
      if (guest !== null) {
        const label = action === "confirm" ? "подтверждена" : "отменена";
        await ctx.api.sendMessage(
          guest.telegramId.toString(),
          `Ваша заявка на ${formatBookingSlot(booking.requestedFor)} ${label}`,
        );
      }
      await ctx.reply(`Заявка ${action === "confirm" ? "подтверждена" : "отменена"}`);
    } catch (err) {
      const message = err instanceof DomainError ? err.message : "Ошибка";
      await ctx.reply(message);
    }
  });

  bot.callbackQuery(/^booking:assign:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isStaffRole(ctx.dbUser?.role) || !ctx.dbUser) {
      await ctx.reply("Недостаточно прав");
      return;
    }
    const matched = ctx.match;
    const bookingId = Array.isArray(matched) ? matched[1] : undefined;
    const tableId = Array.isArray(matched) ? matched[2] : undefined;
    if (bookingId === undefined || tableId === undefined) {
      return;
    }
    try {
      const booking = await assignTableToBooking(ctx.store, {
        bookingId,
        tableId,
        actorId: ctx.dbUser.id,
        now: new Date(),
      });
      const table = booking.tableId !== null ? await ctx.store.findTableById(booking.tableId) : null;
      await ctx.reply(`Стол ${table?.label ?? booking.tableId} назначен`);
    } catch (err) {
      const message = err instanceof DomainError ? err.message : "Ошибка";
      await ctx.reply(message);
    }
  });

  bot.callbackQuery(/^booking:move:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isStaffRole(ctx.dbUser?.role) || !ctx.dbUser) {
      await ctx.reply("Недостаточно прав");
      return;
    }
    const matched = ctx.match;
    const bookingId = Array.isArray(matched) ? matched[1] : undefined;
    const tableId = Array.isArray(matched) ? matched[2] : undefined;
    if (bookingId === undefined || tableId === undefined) {
      return;
    }
    try {
      const booking = await moveBookingTable(ctx.store, {
        bookingId,
        tableId,
        actorId: ctx.dbUser.id,
        now: new Date(),
      });
      const table = booking.tableId !== null ? await ctx.store.findTableById(booking.tableId) : null;
      await ctx.reply(`Гость пересажен на ${table?.label ?? booking.tableId}`);
    } catch (err) {
      const message = err instanceof DomainError ? err.message : "Ошибка";
      await ctx.reply(message);
    }
  });
}
