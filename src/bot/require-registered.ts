import type { NextFunction } from "grammy";
import type { BotContext } from "./context.ts";
import { enterConversation } from "./enter-conversation.ts";

export const requireRegisteredUser = async (ctx: BotContext, next: NextFunction) => {
  if (ctx.dbUser) {
    await next();
    return;
  }
  if (ctx.from === undefined) {
    return;
  }
  await enterConversation(ctx, "registerGuest");
};
