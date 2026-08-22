import type { Bot } from "grammy";
import { newQrToken } from "../domain/qr-token.ts";
import type { BotContext } from "./context.ts";
import { mainKeyboard } from "./keyboards.ts";

export function wireGuestHandlers(bot: Bot<BotContext>) {
  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) {
      await ctx.reply("Не удалось определить пользователя");
      return;
    }

    const isEnvAdmin = BigInt(from.id) === ctx.config.adminTelegramId;

    if (!ctx.dbUser) {
      if (isEnvAdmin) {
        ctx.dbUser = await ctx.store.createUser({
          telegramId: BigInt(from.id),
          role: "admin",
          firstName: from.first_name ?? "Админ",
          lastName: null,
          birthday: null,
          phone: null,
          qrToken: newQrToken(),
        });
      } else {
        await ctx.conversation.enter("registerGuest");
        return;
      }
    }

    await ctx.reply("Добро пожаловать в Друзья", {
      reply_markup: mainKeyboard(ctx.dbUser.role),
    });
  });

  bot.hears("Баланс и QR", async (ctx) => {
    if (!ctx.dbUser) {
      await ctx.conversation.enter("registerGuest");
      return;
    }
    await ctx.reply(`Баланс: ${ctx.dbUser.balance}\nКод: ${ctx.dbUser.qrToken}`);
  });

  bot.hears("История", async (ctx) => {
    if (!ctx.dbUser) {
      await ctx.conversation.enter("registerGuest");
      return;
    }
    const rows = await ctx.store.listLedger(ctx.dbUser.id);
    if (rows.length === 0) {
      await ctx.reply("История пуста");
      return;
    }
    const text = rows
      .map((row) => {
        const sign = row.amount > 0 ? "+" : "";
        const label = row.comment ?? row.type;
        return `${row.createdAt.toISOString().slice(0, 10)} ${label}: ${sign}${row.amount}`;
      })
      .join("\n");
    await ctx.reply(text);
  });
}
