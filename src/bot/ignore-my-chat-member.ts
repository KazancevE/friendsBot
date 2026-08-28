import type { NextFunction } from "grammy";
import type { BotContext } from "./context.ts";

export const ignoreMyChatMember = async (ctx: BotContext, next: NextFunction) => {
  if (ctx.update.my_chat_member !== undefined) {
    return;
  }
  await next();
};
