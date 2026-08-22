import { Context, SessionFlavor } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";
import type { Store } from "../store/types.ts";
import type { UserRecord } from "../domain/types.ts";

export type SessionData = { staffGuestId?: string; staffCouponId?: string };

export type BotContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor<Context> & {
    store: Store;
    dbUser: UserRecord | null;
    config: { adminTelegramId: bigint; publicUrl: string };
  };
