import { DateTime } from "luxon";
import type { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import {
  bookingSlotStarts,
  createBookingRequest,
  formatBookingSlot,
  handleBookingRequest,
} from "../domain/booking.ts";
import { DomainError } from "../domain/errors.ts";
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

  const slots = bookingSlotStarts();
  const keyboard = new InlineKeyboard();
  for (const slot of slots) {
    const label = `${String(slot.hour % 24).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
    keyboard.text(label, `booking:slot:${slot.hour}:${slot.minute}`).row();
  }
  await ctx.reply("Выберите время", { reply_markup: keyboard });

  const slotCtx = await conversation.waitFor("callback_query:data");
  await slotCtx.answerCallbackQuery();
  const data = slotCtx.callbackQuery.data;
  const match = /^booking:slot:(\d+):(\d+)$/.exec(data);
  if (match === null) {
    await ctx.reply("Время не выбрано");
    return;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const requestedFor = parsedDate.set({ hour: hour % 24, minute, second: 0, millisecond: 0 }).toJSDate();

  await ctx.reply("Сколько гостей?");
  const partySize = await conversation.form.int({
    otherwise: (c) => c.reply("Введите число от 1 до 20"),
  });

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

  await ctx.reply(`Заявка отправлена на ${formatBookingSlot(result.booking.requestedFor)}`);

  await conversation.external(async (outer) => {
    const guest = outer.dbUser;
    if (guest === null) {
      return;
    }
    const staffIds = await outer.store.listStaffTelegramIds();
    const text = [
      "📅 Новая заявка на бронь",
      `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim(),
      formatBookingSlot(result.booking.requestedFor),
      `${result.booking.partySize} чел.`,
      result.booking.comment ?? "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");
    const keyboard = new InlineKeyboard()
      .text("Подтвердить", `booking:confirm:${result.booking.id}`)
      .text("Отменить", `booking:cancel:${result.booking.id}`);
    await Promise.all(
      staffIds.map(async (telegramId) => {
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
}
