import type { BotContext } from "./context.ts";

export const enterConversation = async (ctx: BotContext, id: string) => {
  await ctx.conversation.exitAll();
  await ctx.conversation.enter(id);
};
