import type { NextFunction } from "grammy";
import { newQrToken } from "../domain/qr-token.ts";
import { isTelegramAdmin } from "../prod/telegram-admins.ts";
import type { Store } from "../store/types.ts";
import type { BotContext } from "./context.ts";

type HydrateBotContextParameters = {
  readonly store: Store;
  readonly config: { adminTelegramId: bigint; adminTelegramIds?: readonly bigint[]; publicUrl: string };
};

export const hydrateBotContext = ({ store, config }: HydrateBotContextParameters) => {
  return async (ctx: BotContext, next: NextFunction) => {
    ctx.store = store;
    ctx.config = config;
    const id = ctx.from?.id;
    ctx.dbUser = id ? await store.findUserByTelegramId(BigInt(id)) : null;
    const admins = config.adminTelegramIds?.length ? config.adminTelegramIds : [config.adminTelegramId];
    if (id && isTelegramAdmin(BigInt(id), admins) && ctx.dbUser?.role !== "admin") {
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
  };
};
