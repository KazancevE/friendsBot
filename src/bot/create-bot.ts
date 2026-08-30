import { conversations, createConversation } from "@grammyjs/conversations";
import type { BotConfig } from "grammy";
import { Bot, session } from "grammy";
import type { Store } from "../store/types.ts";
import {
  addMenuItemConversation,
  addQuizQuestionConversation,
  assignRoleConversation,
  createPromoConversation,
  editContactsConversation,
  editDirectionsConversation,
  setBirthdayBonusConversation,
  setCheckBonusTtlConversation,
  setCouponClaimDefaultConversation,
  setExpireNotifyMinConversation,
  setGiftBonusTtlConversation,
  setPercentConversation,
  setRegistrationBonusConversation,
  setVisitHoursConversation,
  setWeeklyPrizesConversation,
  wireAdminHandlers,
} from "./admin.ts";
import {
  adminExportConversation,
  adminStaffLogConversation,
  adminStatsConversation,
  wireAdminOpsHandlers,
} from "./admin-ops.ts";
import { guestBookingConversation, wireBookingHandlers } from "./booking.ts";
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
  staffNoteConversation,
  staffRedeemConversation,
  staffVisitConversation,
  wireStaffHandlers,
} from "./staff.ts";
import { wireMiniAppLaunchHandlers } from "./mini-app-launch.ts";
import { wireVenueCodeHandlers } from "./venue-code.ts";

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
  bot.use(createConversation(staffNoteConversation, "staffNote"));
  bot.use(createConversation(staffCouponRedeemConversation, "staffCouponRedeem"));
  bot.use(createConversation(adminStatsConversation, "adminStats"));
  bot.use(createConversation(adminStaffLogConversation, "adminStaffLog"));
  bot.use(createConversation(adminExportConversation, "adminExport"));
  bot.use(createConversation(guestBookingConversation, "guestBooking"));
  bot.use(createConversation(setPercentConversation, "setPercent"));
  bot.use(createConversation(setRegistrationBonusConversation, "setRegistrationBonus"));
  bot.use(createConversation(setBirthdayBonusConversation, "setBirthdayBonus"));
  bot.use(createConversation(setVisitHoursConversation, "setVisitHours"));
  bot.use(createConversation(setCheckBonusTtlConversation, "setCheckBonusTtl"));
  bot.use(createConversation(setGiftBonusTtlConversation, "setGiftBonusTtl"));
  bot.use(createConversation(setCouponClaimDefaultConversation, "setCouponClaimDefault"));
  bot.use(createConversation(setExpireNotifyMinConversation, "setExpireNotifyMin"));
  bot.use(createConversation(setWeeklyPrizesConversation, "setWeeklyPrizes"));
  bot.use(createConversation(assignRoleConversation, "assignRole"));
  bot.use(createConversation(addMenuItemConversation, "addMenuItem"));
  bot.use(createConversation(addQuizQuestionConversation, "addQuizQuestion"));
  bot.use(createConversation(editContactsConversation, "editContacts"));
  bot.use(createConversation(editDirectionsConversation, "editDirections"));
  bot.use(createConversation(createPromoConversation, "createPromo"));
  bot.use(requireRegisteredUser);
  wireGuestHandlers(bot);
  wireMiniAppLaunchHandlers(bot);
  wireStaffHandlers(bot);
  wireVenueCodeHandlers(bot);
  wireAdminHandlers(bot);
  wireAdminOpsHandlers(bot);
  wireBookingHandlers(bot);
  return bot;
}
