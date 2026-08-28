import { InlineKeyboard, InputFile } from "grammy";
import type { Bot } from "grammy";
import {
  ensureActiveVenueCode,
  regenerateVenueCode,
  venueQrPayload,
} from "../domain/venue-code.ts";
import { MOSCOW } from "../domain/week.ts";
import type { Role } from "../domain/types.ts";
import type { BotContext } from "./context.ts";
import { qrPngBuffer } from "./qr.ts";

const isStaffRole = (role: Role | undefined): boolean => {
  return role === "master" || role === "admin";
};

const formatUntil = (at: Date) => {
  return at.toLocaleString("ru-RU", { timeZone: MOSCOW, hour: "2-digit", minute: "2-digit" });
};

const venueCaption = (pin: string, validUntil: Date, activeCount: number) => {
  return [
    `Код зала: ${pin}`,
    `Действует до ${formatUntil(validUntil)}`,
    `Сейчас в зале: ${activeCount}`,
    "Покажите QR или цифры гостям",
  ].join("\n");
};

const venueKeyboard = () => {
  return new InlineKeyboard()
    .text("Обновить код", "venue:regenerate")
    .text("Обновить счётчик", "venue:refresh");
};

export const sendVenueCodeCard = async (ctx: BotContext) => {
  if (!isStaffRole(ctx.dbUser?.role)) {
    await ctx.reply("Недостаточно прав");
    return;
  }
  const now = new Date();
  const code = await ensureActiveVenueCode(ctx.store, now);
  const visits = await ctx.store.listActiveVisits(now);
  const buf = await qrPngBuffer(venueQrPayload(code.token));
  await ctx.replyWithPhoto(new InputFile(buf), {
    caption: venueCaption(code.pin, code.validUntil, visits.length),
    reply_markup: venueKeyboard(),
  });
};

export function wireVenueCodeHandlers(bot: Bot<BotContext>) {
  bot.hears("Код зала", async (ctx) => {
    await sendVenueCodeCard(ctx);
  });

  bot.callbackQuery(/^venue:(regenerate|refresh)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isStaffRole(ctx.dbUser?.role)) {
      await ctx.reply("Недостаточно прав");
      return;
    }
    const now = new Date();
    const action = ctx.match;
    const kind = Array.isArray(action) ? action[1] : undefined;
    const code =
      kind === "regenerate" && ctx.dbUser !== undefined
        ? await regenerateVenueCode(ctx.store, ctx.dbUser.id, now)
        : await ensureActiveVenueCode(ctx.store, now);
    const visits = await ctx.store.listActiveVisits(now);
    const buf = await qrPngBuffer(venueQrPayload(code.token));
    const caption = venueCaption(code.pin, code.validUntil, visits.length);
    const media = { type: "photo" as const, media: new InputFile(buf), caption };
    if (ctx.callbackQuery.message !== undefined) {
      await ctx.editMessageMedia(media, { reply_markup: venueKeyboard() });
      return;
    }
    await ctx.replyWithPhoto(new InputFile(buf), {
      caption,
      reply_markup: venueKeyboard(),
    });
  });
}
