import { conversations, createConversation } from "@grammyjs/conversations";
import { Bot, session } from "grammy";
import { newQrToken } from "../domain/qr-token.ts";
import type { Store } from "../store/types.ts";
import {
  addMenuItemConversation,
  assignRoleConversation,
  createPromoConversation,
  editContactsConversation,
  editDirectionsConversation,
  setBirthdayBonusConversation,
  setPercentConversation,
  setRegistrationBonusConversation,
  setVisitHoursConversation,
  wireAdminHandlers,
} from "./admin.ts";
import type { BotContext } from "./context.ts";
import { editGuestProfileConversation, wireGuestHandlers } from "./guest.ts";
import { registerGuestConversation } from "./register.ts";
import {
  staffCheckConversation,
  staffFindConversation,
  staffManualConversation,
  staffRedeemConversation,
  staffVisitConversation,
  wireStaffHandlers,
} from "./staff.ts";

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
  bot.use(createConversation(editGuestProfileConversation, "editGuestProfile"));
  bot.use(createConversation(staffFindConversation, "staffFind"));
  bot.use(createConversation(staffCheckConversation, "staffCheck"));
  bot.use(createConversation(staffRedeemConversation, "staffRedeem"));
  bot.use(createConversation(staffManualConversation, "staffManual"));
  bot.use(createConversation(staffVisitConversation, "staffVisit"));
  bot.use(createConversation(setPercentConversation, "setPercent"));
  bot.use(createConversation(setRegistrationBonusConversation, "setRegistrationBonus"));
  bot.use(createConversation(setBirthdayBonusConversation, "setBirthdayBonus"));
  bot.use(createConversation(setVisitHoursConversation, "setVisitHours"));
  bot.use(createConversation(assignRoleConversation, "assignRole"));
  bot.use(createConversation(addMenuItemConversation, "addMenuItem"));
  bot.use(createConversation(editContactsConversation, "editContacts"));
  bot.use(createConversation(editDirectionsConversation, "editDirections"));
  bot.use(createConversation(createPromoConversation, "createPromo"));
  wireGuestHandlers(bot);
  wireStaffHandlers(bot);
  wireAdminHandlers(bot);
  return bot;
}
