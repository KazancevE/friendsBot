import type { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { DomainError } from "../domain/errors.ts";
import { assignRole } from "../domain/roles.ts";
import type { Role, Settings } from "../domain/types.ts";
import type { BotContext } from "./context.ts";

type BotConversation = Conversation<BotContext, BotContext>;

const ADMIN_ONLY = "Только для админа";

const SETTINGS_CONVERSATIONS = {
  percent: "setPercent",
  registration: "setRegistrationBonus",
  birthday: "setBirthdayBonus",
  visitHours: "setVisitHours",
} as const;

type SettingsAction = keyof typeof SETTINGS_CONVERSATIONS;

const isSettingsAction = (value: string): value is SettingsAction => {
  return (
    value === "percent" ||
    value === "registration" ||
    value === "birthday" ||
    value === "visitHours"
  );
};

const isAdmin = (ctx: BotContext): boolean => {
  return ctx.dbUser?.role === "admin";
};

const settingsKeyboard = (): InlineKeyboard => {
  return new InlineKeyboard()
    .text("Процент", "admin:percent")
    .text("Регистрация", "admin:registration")
    .row()
    .text("День рождения", "admin:birthday")
    .text("Визит", "admin:visitHours");
};

const formatSettings = (settings: Settings): string => {
  return [
    `Процент с чека: ${settings.percent}`,
    `Бонус регистрации: ${settings.registrationBonus}`,
    `Бонус на день рождения: ${settings.birthdayBonus}`,
    `Длина визита (часы): ${settings.visitHours}`,
  ].join("\n");
};

const askInt = async (
  conversation: BotConversation,
  ctx: BotContext,
  prompt: string,
): Promise<number> => {
  await ctx.reply(prompt);
  return conversation.form.int({
    otherwise: (c) => c.reply("Введите целое число"),
  });
};

const requireAdminOrReply = async (ctx: BotContext): Promise<boolean> => {
  if (isAdmin(ctx)) {
    return true;
  }
  await ctx.reply(ADMIN_ONLY);
  return false;
};

export async function setPercentConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }
  const current = await conversation.external((outer) => outer.store.getSettings());
  const percent = await askInt(
    conversation,
    ctx,
    `Процент с чека (сейчас ${current.percent}). Введите новое значение`,
  );
  const result = await conversation.external(async (outer) => {
    if (outer.dbUser?.role !== "admin") {
      return { ok: false as const, message: ADMIN_ONLY };
    }
    try {
      const settings = await outer.store.updateSettings({ percent });
      return { ok: true as const, value: settings.percent };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });
  if (!result.ok) {
    await ctx.reply(result.message);
    return;
  }
  await ctx.reply(`Процент с чека: ${result.value}`);
}

export async function setRegistrationBonusConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }
  const current = await conversation.external((outer) => outer.store.getSettings());
  const registrationBonus = await askInt(
    conversation,
    ctx,
    `Бонус за регистрацию (сейчас ${current.registrationBonus}). Введите новое значение`,
  );
  const result = await conversation.external(async (outer) => {
    if (outer.dbUser?.role !== "admin") {
      return { ok: false as const, message: ADMIN_ONLY };
    }
    try {
      const settings = await outer.store.updateSettings({ registrationBonus });
      return { ok: true as const, value: settings.registrationBonus };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });
  if (!result.ok) {
    await ctx.reply(result.message);
    return;
  }
  await ctx.reply(`Бонус за регистрацию: ${result.value}`);
}

export async function setBirthdayBonusConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }
  const current = await conversation.external((outer) => outer.store.getSettings());
  const birthdayBonus = await askInt(
    conversation,
    ctx,
    `Бонус на день рождения (сейчас ${current.birthdayBonus}). Введите новое значение`,
  );
  const result = await conversation.external(async (outer) => {
    if (outer.dbUser?.role !== "admin") {
      return { ok: false as const, message: ADMIN_ONLY };
    }
    try {
      const settings = await outer.store.updateSettings({ birthdayBonus });
      return { ok: true as const, value: settings.birthdayBonus };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });
  if (!result.ok) {
    await ctx.reply(result.message);
    return;
  }
  await ctx.reply(`Бонус на день рождения: ${result.value}`);
}

export async function setVisitHoursConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }
  const current = await conversation.external((outer) => outer.store.getSettings());
  const visitHours = await askInt(
    conversation,
    ctx,
    `Длина визита в часах (сейчас ${current.visitHours}). Введите новое значение`,
  );
  const result = await conversation.external(async (outer) => {
    if (outer.dbUser?.role !== "admin") {
      return { ok: false as const, message: ADMIN_ONLY };
    }
    try {
      const settings = await outer.store.updateSettings({ visitHours });
      return { ok: true as const, value: settings.visitHours };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });
  if (!result.ok) {
    await ctx.reply(result.message);
    return;
  }
  await ctx.reply(`Длина визита: ${result.value} ч`);
}

export async function assignRoleConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }

  await ctx.reply("Telegram ID пользователя");
  let telegramId: bigint | undefined;
  while (telegramId === undefined) {
    const raw = (
      await conversation.waitFor(":text", {
        otherwise: (c) => c.reply("Отправьте Telegram ID числом"),
      })
    ).msg.text.trim();
    if (!/^\d+$/.test(raw)) {
      await ctx.reply("Отправьте Telegram ID числом");
      continue;
    }
    telegramId = BigInt(raw);
  }

  await ctx.reply("Роль: guest, master или admin");
  let role: Role | undefined;
  while (role === undefined) {
    const raw = (
      await conversation.waitFor(":text", {
        otherwise: (c) => c.reply("Укажите guest, master или admin"),
      })
    ).msg.text.trim().toLowerCase();
    if (raw === "guest" || raw === "master" || raw === "admin") {
      role = raw;
      break;
    }
    await ctx.reply("Укажите guest, master или admin");
  }

  const result = await conversation.external(async (outer) => {
    const actor = outer.dbUser;
    if (!actor || actor.role !== "admin") {
      return { ok: false as const, message: ADMIN_ONLY };
    }
    try {
      const user = await assignRole(outer.store, {
        actorId: actor.id,
        telegramId,
        role,
      });
      return { ok: true as const, role: user.role };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });

  if (!result.ok) {
    await ctx.reply(result.message);
    return;
  }

  await ctx.reply(`Роль назначена: ${result.role}`);
}

export function wireAdminHandlers(bot: Bot<BotContext>) {
  bot.hears("Настройки", async (ctx) => {
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    const settings = await ctx.store.getSettings();
    await ctx.reply(formatSettings(settings), { reply_markup: settingsKeyboard() });
  });

  bot.hears("Роли", async (ctx) => {
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    await ctx.conversation.enter("assignRole");
  });

  bot.hears("Рассылка", async (ctx) => {
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    await ctx.reply("Настройка рассылки будет в следующей версии");
  });

  bot.callbackQuery(/^admin:(percent|registration|birthday|visitHours)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    const matched = ctx.match;
    const action = Array.isArray(matched) ? matched[1] : undefined;
    if (action === undefined || !isSettingsAction(action)) {
      return;
    }
    await ctx.conversation.enter(SETTINGS_CONVERSATIONS[action]);
  });
}
