import { conversations, createConversation } from "@grammyjs/conversations";
import type { BotConfig } from "grammy";
import { Bot, session } from "grammy";
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
  setWeeklyPrizesConversation,
  wireAdminHandlers,
} from "./admin.ts";
import type { BotContext } from "./context.ts";
import { editGuestProfileConversation, wireGuestHandlers } from "./guest.ts";
import { hydrateBotContext } from "./hydrate.ts";
import { ignoreMyChatMember } from "./ignore-my-chat-member.ts";
import { registerGuestConversation } from "./register.ts";
import { requireRegisteredUser } from "./require-registered.ts";
import {
  staffCheckConversation,
  staffCouponRedeemConversation,
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
  botConfig?: BotConfig<BotContext>,
) {
  const bot = new Bot<BotContext>(token, botConfig);
  const hydrate = hydrateBotContext({ store, config });
  bot.use(session({ initial: () => ({}) }));
  bot.use(hydrate);
  bot.use(conversations({ plugins: [hydrate] }));
  bot.catch((err) => {
    const inner = err.error;
    console.error(err.message);
    if (inner instanceof Error) {
      console.error(inner.message);
    }
  });
  bot.use(ignoreMyChatMember);
  bot.use(createConversation(registerGuestConversation, "registerGuest"));
  bot.use(createConversation(editGuestProfileConversation, "editGuestProfile"));
  bot.use(createConversation(staffFindConversation, "staffFind"));
  bot.use(createConversation(staffCheckConversation, "staffCheck"));
  bot.use(createConversation(staffRedeemConversation, "staffRedeem"));
  bot.use(createConversation(staffManualConversation, "staffManual"));
  bot.use(createConversation(staffVisitConversation, "staffVisit"));
  bot.use(createConversation(staffCouponRedeemConversation, "staffCouponRedeem"));
  bot.use(createConversation(setPercentConversation, "setPercent"));
  bot.use(createConversation(setRegistrationBonusConversation, "setRegistrationBonus"));
  bot.use(createConversation(setBirthdayBonusConversation, "setBirthdayBonus"));
  bot.use(createConversation(setVisitHoursConversation, "setVisitHours"));
  bot.use(createConversation(setWeeklyPrizesConversation, "setWeeklyPrizes"));
  bot.use(createConversation(assignRoleConversation, "assignRole"));
  bot.use(createConversation(addMenuItemConversation, "addMenuItem"));
  bot.use(createConversation(editContactsConversation, "editContacts"));
  bot.use(createConversation(editDirectionsConversation, "editDirections"));
  bot.use(createConversation(createPromoConversation, "createPromo"));
  bot.use(requireRegisteredUser);
  wireGuestHandlers(bot);
  wireStaffHandlers(bot);
  wireAdminHandlers(bot);
  return bot;
}
