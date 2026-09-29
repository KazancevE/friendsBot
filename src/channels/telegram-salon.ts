import { Bot, InlineKeyboard, Keyboard } from "grammy";
import type { OutMessage } from "../salon/outbound.ts";
import { SalonFlow } from "../salon/flow.ts";
import type { Notifier } from "../salon/outbound.ts";
import { telegramClientOptions } from "./telegram-client.ts";

const markup = (message: OutMessage) => {
  if (message.requestContact) {
    return new Keyboard().requestContact("Отправить телефон").resized().oneTime();
  }
  if (message.removeKeyboard && !message.buttons?.length) {
    return { remove_keyboard: true as const };
  }
  if (!message.buttons?.length) {
    return message.removeKeyboard ? { remove_keyboard: true as const } : undefined;
  }
  const keyboard = new InlineKeyboard();
  for (const row of message.buttons) {
    for (const button of row) {
      if (button.webApp) {
        keyboard.webApp(button.text, button.webApp);
      } else if (button.url) {
        keyboard.url(button.text, button.url);
      } else if (button.callback) {
        keyboard.text(button.text, button.callback);
      }
    }
    keyboard.row();
  }
  return keyboard;
};

export const sendTelegram = async (bot: Bot, chatId: string, message: OutMessage) => {
  const replyMarkup = markup(message);
  if (message.removeKeyboard && message.buttons?.length) {
    await bot.api.sendMessage(chatId, message.text, { reply_markup: { remove_keyboard: true } });
    await bot.api.sendMessage(chatId, "Меню", { reply_markup: markup({ ...message, removeKeyboard: false }) });
    return;
  }
  await bot.api.sendMessage(chatId, message.text, replyMarkup ? { reply_markup: replyMarkup } : undefined);
};

export const createSalonTelegramBot = (
  token: string,
  flow: SalonFlow,
  notifier: Notifier & { use?: (channel: "telegram", send: (externalId: string, message: OutMessage) => Promise<void>) => void },
  hooks?: { onNotice?: (text: string) => Promise<void> },
) => {
  const client = telegramClientOptions();
  if (client) {
    console.log("telegram proxy: исходящие запросы к Bot API идут через TELEGRAM_PROXY");
  }
  const bot = new Bot(token, client ? { client } : undefined);
  notifier.use?.("telegram", async (externalId, message) => {
    await sendTelegram(bot, externalId, message);
  });

  const respond = async (
    chatId: number,
    input: {
      text?: string;
      callback?: string;
      phone?: string;
      firstName?: string;
      startPayload?: string;
    },
  ) => {
    const result = await flow.handle({ channel: "telegram", externalId: String(chatId), ...input });
    for (const message of result.messages) {
      await sendTelegram(bot, String(chatId), message);
    }
    if (result.notice) {
      await hooks?.onNotice?.(result.notice);
    }
    return result.notice;
  };

  bot.command("start", async (ctx) => {
    const payload = ctx.match?.trim();
    await respond(ctx.chat.id, {
      text: "/start",
      firstName: ctx.from?.first_name,
      startPayload: payload && payload.length > 0 ? payload : undefined,
    });
  });
  bot.on("message:contact", async (ctx) => {
    await respond(ctx.chat.id, {
      phone: ctx.message.contact.phone_number,
      firstName: ctx.from?.first_name,
    });
  });
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      return;
    }
    await respond(ctx.chat.id, { text: ctx.message.text, firstName: ctx.from?.first_name });
  });
  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery();
    await respond(ctx.chat?.id ?? ctx.from.id, {
      callback: ctx.callbackQuery.data,
      firstName: ctx.from.first_name,
    });
  });
  bot.catch((error) => {
    console.error("telegram", error);
  });
  return bot;
};
