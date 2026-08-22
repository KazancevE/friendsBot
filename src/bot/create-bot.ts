import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { newQrToken } from "../domain/qr-token.ts";
import type { Store } from "../store/types.ts";
import type { BotContext } from "./context.ts";
import { wireGuestHandlers } from "./guest.ts";
import { registerGuestConversation } from "./register.ts";

export function createBot(
  token: string,
  store: Store,
  config: { adminTelegramId: bigint; publicUrl: string },
) {
  const bot = new Bot<BotContext>(token);
  bot.use(session({ initial: () => ({}) }));
  bot.use(conversations());
  bot.use(async (ctx, next) => {
    ctx.store = store;
    ctx.config = config;
    const id = ctx.from?.id;
    ctx.dbUser = id ? await store.findUserByTelegramId(BigInt(id)) : null;
    if (id && BigInt(id) === config.adminTelegramId && ctx.dbUser?.role !== "admin") {
      ctx.dbUser = ctx.dbUser
        ? await store.updateUser(ctx.dbUser.id, { role: "admin" })
        : await store.createUser({
            telegramId: BigInt(id),
            role: "admin",
            firstName: ctx.from?.first_name ?? "Админ",
            lastName: null,
            birthday: null,
            phone: null,
            qrToken: newQrToken(),
          });
    }
    await next();
  });
  bot.use(createConversation(registerGuestConversation, "registerGuest"));
  wireGuestHandlers(bot);
  return bot;
}
