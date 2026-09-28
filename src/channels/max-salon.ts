import { Bot, Keyboard } from "@maxhub/max-bot-api";
import { SalonFlow } from "../salon/flow.ts";
import type { Notifier, OutMessage } from "../salon/outbound.ts";

const attachments = (message: OutMessage) => {
  const rows = (message.buttons ?? []).map((row) =>
    row.map((button) =>
      button.url
        ? Keyboard.button.link(button.text, button.url)
        : Keyboard.button.callback(button.text, button.callback ?? button.text),
    ),
  );
  if (message.requestContact) {
    rows.push([Keyboard.button.requestContact("Отправить телефон")]);
  }
  if (rows.length === 0) {
    return undefined;
  }
  return [Keyboard.inlineKeyboard(rows)];
};

export const sendMax = async (bot: Bot, userId: number, message: OutMessage) => {
  const extra = attachments(message);
  await bot.api.sendMessageToUser(userId, message.text, extra ? { attachments: extra } : undefined);
};

export const createSalonMaxBot = (
  token: string,
  flow: SalonFlow,
  notifier: Notifier & { use?: (channel: "max", send: (externalId: string, message: OutMessage) => Promise<void>) => void },
  hooks?: { onNotice?: (text: string) => Promise<void> },
) => {
  const bot = new Bot(token);
  notifier.use?.("max", async (externalId, message) => {
    await sendMax(bot, Number(externalId), message);
  });

  const respond = async (
    userId: number,
    input: { text?: string; callback?: string; phone?: string; firstName?: string; startPayload?: string },
  ) => {
    const result = await flow.handle({ channel: "max", externalId: String(userId), ...input });
    for (const message of result.messages) {
      await sendMax(bot, userId, message);
    }
    if (result.notice && hooks?.onNotice) {
      await hooks.onNotice(result.notice);
    }
  };

  bot.on("bot_started", async (ctx) => {
    const user = ctx.user;
    if (!user) {
      return;
    }
    await respond(user.user_id, {
      text: "/start",
      firstName: user.name,
      startPayload: ctx.startPayload ?? undefined,
    });
  });

  bot.on("message_created", async (ctx) => {
    const user = ctx.message?.sender;
    if (!user || user.is_bot) {
      return;
    }
    const phone = ctx.contactInfo?.tel;
    const text = ctx.message?.body.text ?? undefined;
    if (!phone && text?.startsWith("/")) {
      return;
    }
    await respond(user.user_id, {
      text: phone ? undefined : text ?? undefined,
      phone,
      firstName: user.name,
    });
  });

  bot.on("message_callback", async (ctx) => {
    const user = ctx.callback?.user;
    if (!user) {
      return;
    }
    if (ctx.callback?.callback_id) {
      await ctx.answerOnCallback({ notification: "Готово" }).catch(() => undefined);
    }
    await respond(user.user_id, {
      callback: ctx.callback?.payload ?? undefined,
      firstName: user.name,
    });
  });

  bot.catch((error) => {
    console.error("max", error);
  });
  return bot;
};
