import type { Bot } from "grammy";
import type { BotContext } from "./context.ts";
import {
  BTN_WEB_ADMIN,
  inlineAdminAppKeyboard,
  inlineMiniAppKeyboard,
  MINI_APP_GUEST_LABEL,
  MINI_APP_STAFF_LABEL,
} from "./keyboards.ts";

export function wireMiniAppLaunchHandlers(bot: Bot<BotContext>) {
  bot.hears(MINI_APP_GUEST_LABEL, async (ctx) => {
    await ctx.reply("Нажмите кнопку ниже, чтобы открыть игры", {
      reply_markup: inlineMiniAppKeyboard(ctx.config.publicUrl, MINI_APP_GUEST_LABEL),
    });
  });

  bot.hears(MINI_APP_STAFF_LABEL, async (ctx) => {
    await ctx.reply("Нажмите кнопку ниже, чтобы открыть приложение", {
      reply_markup: inlineMiniAppKeyboard(ctx.config.publicUrl, MINI_APP_STAFF_LABEL),
    });
  });

  bot.hears(BTN_WEB_ADMIN, async (ctx) => {
    if (ctx.dbUser?.role !== "admin") {
      await ctx.reply("Только для админа");
      return;
    }
    await ctx.reply("Нажмите кнопку ниже, чтобы открыть веб-админ", {
      reply_markup: inlineAdminAppKeyboard(ctx.config.publicUrl),
    });
  });
}
