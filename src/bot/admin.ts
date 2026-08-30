import type { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import type { Api, Bot } from "grammy";
import { recipientsForSegment, broadcastSegmentLabel, previewSegmentCount } from "../domain/broadcast.ts";
import { listRejectedSessions } from "../domain/games.ts";
import { promoRuleKindLabelRu } from "../domain/promo-rules.ts";
import { startQuizSession, notifyActiveGuestsOfQuiz, addQuizQuestion } from "../domain/quiz.ts";
import type { BroadcastSegmentId, PromoRuleKind } from "../domain/types.ts";
import { addMenuItem, savePage } from "../domain/content.ts";
import { DomainError } from "../domain/errors.ts";
import { assignRole } from "../domain/roles.ts";
import type { PrizePlace, Role, Settings } from "../domain/types.ts";
import { adminAppUrl } from "../web-app-url.ts";
import {
  askCancellableInt,
  askCancellablePriceOrSkip,
  askCancellableText,
  askCancellableYesNo,
  replyMainMenu,
  runCancellable,
  throwIfCancel,
  waitCancellablePhoto,
  waitCancellablePhotoOrSkip,
  waitCancellableText,
} from "./conversation-cancel.ts";
import type { BotContext } from "./context.ts";
import { enterConversation } from "./enter-conversation.ts";
import { cancelKeyboard } from "./keyboards.ts";

type BotConversation = Conversation<BotContext, BotContext>;

const BROADCAST_SEGMENTS: BroadcastSegmentId[] = [
  "all",
  "inactive_30d",
  "active_7d",
  "balance_gt",
  "has_coupon",
  "birthday_week",
  "referrers",
  "weekly_top",
];

const parseBroadcastSegment = (raw: string): BroadcastSegmentId | null => {
  const trimmed = raw.trim();
  const byIndex = Number(trimmed);
  if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= BROADCAST_SEGMENTS.length) {
    return BROADCAST_SEGMENTS[byIndex - 1] ?? null;
  }
  if ((BROADCAST_SEGMENTS as readonly string[]).includes(trimmed)) {
    return trimmed as BroadcastSegmentId;
  }
  return null;
};

const segmentMenuText = () => {
  return BROADCAST_SEGMENTS.map((segment, index) => `${index + 1}. ${broadcastSegmentLabel(segment)}`).join("\n");
};

const parsePromoRuleKind = (raw: string): PromoRuleKind | null => {
  const trimmed = raw.trim();
  const kinds: PromoRuleKind[] = [
    "double_check_bonus",
    "min_check_bonus",
    "weekday_multiplier",
    "promo_code",
  ];
  const byIndex = Number(trimmed);
  if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= kinds.length) {
    return kinds[byIndex - 1] ?? null;
  }
  if ((kinds as readonly string[]).includes(trimmed)) {
    return trimmed as PromoRuleKind;
  }
  return null;
};

const promoRuleMenuText = () => {
  const kinds: PromoRuleKind[] = [
    "double_check_bonus",
    "min_check_bonus",
    "weekday_multiplier",
    "promo_code",
  ];
  return kinds.map((kind, index) => `${index + 1}. ${promoRuleKindLabelRu(kind)}`).join("\n");
};

const askPromoRuleParams = async (
  conversation: BotConversation,
  ctx: BotContext,
  kind: PromoRuleKind,
): Promise<Record<string, unknown>> => {
  switch (kind) {
    case "double_check_bonus":
      return {};
    case "min_check_bonus": {
      const minRubles = await askCancellableInt({
        conversation,
        ctx,
        prompt: "Минимальная сумма чека (₽)",
      });
      const bonus = await askCancellableInt({
        conversation,
        ctx,
        prompt: "Дополнительный бонус",
      });
      return { minRubles, bonus };
    }
    case "weekday_multiplier": {
      const weekday = await askCancellableInt({
        conversation,
        ctx,
        prompt: "День недели (0=пн … 6=вс)",
      });
      const multiplier = await askCancellableInt({
        conversation,
        ctx,
        prompt: "Множитель (целое число, например 2)",
      });
      return { weekday, multiplier };
    }
    case "promo_code": {
      const code = (
        await waitCancellableText({
          conversation,
          ctx,
          otherwise: "Введите промокод",
        })
      ).trim();
      const bonus = await askCancellableInt({
        conversation,
        ctx,
        prompt: "Бонус за промокод",
      });
      return { code: code.toUpperCase(), bonus };
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
};

const ADMIN_ONLY = "Только для админа";
const BROADCAST_BATCH_SIZE = 25;

const SETTINGS_CONVERSATIONS = {
  percent: "setPercent",
  registration: "setRegistrationBonus",
  birthday: "setBirthdayBonus",
  visitHours: "setVisitHours",
  checkTtl: "setCheckBonusTtl",
  giftTtl: "setGiftBonusTtl",
  couponDefault: "setCouponClaimDefault",
  notifyMin: "setExpireNotifyMin",
  prizes: "setWeeklyPrizes",
} as const;

type SettingsAction = keyof typeof SETTINGS_CONVERSATIONS;

const isSettingsAction = (value: string): value is SettingsAction => {
  return value in SETTINGS_CONVERSATIONS;
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
    .text("Визит", "admin:visitHours")
    .row()
    .text("Срок чековых", "admin:checkTtl")
    .text("Срок подарочных", "admin:giftTtl")
    .row()
    .text("Купон (дефолт)", "admin:couponDefault")
    .text("Порог уведомл.", "admin:notifyMin")
    .row()
    .text("Призы недели", "admin:prizes");
};

const formatPrizeRow = (row: PrizePlace) => {
  const coupon = row.couponTitle === null ? "без купона" : row.couponTitle;
  return `${row.place} место: ${row.bonuses} бонусов, ${coupon}`;
};

const formatSettings = (settings: Settings): string => {
  return [
    `Процент с чека: ${settings.percent}`,
    `Бонус регистрации: ${settings.registrationBonus}`,
    `Бонус на день рождения: ${settings.birthdayBonus}`,
    `Длина визита (часы): ${settings.visitHours}`,
    `Срок чековых бонусов (дни): ${settings.checkBonusTtlDays}`,
    `Срок подарочных/призовых (дни): ${settings.giftBonusTtlDays}`,
    `Срок купона — дефолт (дни): ${settings.couponClaimDaysDefault}`,
    `Срок купона в розыгрыше (дни): ${settings.couponClaimDays}`,
    `Порог уведомлений о бонусах: ${settings.expireNotifyMinBonuses}`,
    `Check-in уведомления: ${settings.checkInNotifyEnabled ? "вкл" : "выкл"}`,
    "Предупреждения о сгорании: за 7, 3 и 1 день",
    `Победителей: ${settings.winnersCount}`,
    "Призы:",
    ...settings.prizeTable.map(formatPrizeRow),
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

const sendPromoToChat = async (input: {
  api: Api;
  chatId: string;
  body: string;
  photoId: string | undefined;
}) => {
  if (input.photoId !== undefined) {
    await input.api.sendPhoto(input.chatId, input.photoId, { caption: input.body });
    return;
  }
  await input.api.sendMessage(input.chatId, input.body);
};

const sendBroadcast = async (input: {
  api: Api;
  telegramIds: readonly bigint[];
  body: string;
  photoId: string | undefined;
}): Promise<{ sent: number; failed: number }> => {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < input.telegramIds.length; i += BROADCAST_BATCH_SIZE) {
    const batch = input.telegramIds.slice(i, i + BROADCAST_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (telegramId) => {
        try {
          await sendPromoToChat({
            api: input.api,
            chatId: telegramId.toString(),
            body: input.body,
            photoId: input.photoId,
          });
          return true;
        } catch {
          return false;
        }
      }),
    );
    sent += results.filter((ok) => ok).length;
    failed += results.filter((ok) => !ok).length;
  }
  return { sent, failed };
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

async function setDaysSettingConversation(
  conversation: BotConversation,
  ctx: BotContext,
  input: {
    prompt: (current: Settings) => string;
    apply: (value: number) => Partial<Settings>;
    confirm: (value: number) => string;
    min?: number;
  },
) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }
  const current = await conversation.external((outer) => outer.store.getSettings());
  const value = await askInt(conversation, ctx, input.prompt(current));
  const min = input.min ?? 1;
  if (value < min) {
    await ctx.reply(`Значение должно быть ≥ ${min}`);
    return;
  }
  const result = await conversation.external(async (outer) => {
    if (outer.dbUser?.role !== "admin") {
      return { ok: false as const, message: ADMIN_ONLY };
    }
    try {
      const settings = await outer.store.updateSettings(input.apply(value));
      return { ok: true as const, value };
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
  await ctx.reply(input.confirm(result.value));
}

export async function setCheckBonusTtlConversation(conversation: BotConversation, ctx: BotContext) {
  await setDaysSettingConversation(conversation, ctx, {
    prompt: (s) => `Срок чековых бонусов в днях (сейчас ${s.checkBonusTtlDays}). Введите новое значение`,
    apply: (checkBonusTtlDays) => ({ checkBonusTtlDays }),
    confirm: (v) => `Срок чековых бонусов: ${v} дн.`,
  });
}

export async function setGiftBonusTtlConversation(conversation: BotConversation, ctx: BotContext) {
  await setDaysSettingConversation(conversation, ctx, {
    prompt: (s) => `Срок подарочных/призовых бонусов в днях (сейчас ${s.giftBonusTtlDays}). Введите новое значение`,
    apply: (giftBonusTtlDays) => ({ giftBonusTtlDays }),
    confirm: (v) => `Срок подарочных/призовых: ${v} дн.`,
  });
}

export async function setCouponClaimDefaultConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  await setDaysSettingConversation(conversation, ctx, {
    prompt: (s) =>
      `Дефолт срока забора купона в днях (сейчас ${s.couponClaimDaysDefault}). Введите новое значение`,
    apply: (couponClaimDaysDefault) => ({ couponClaimDaysDefault }),
    confirm: (v) => `Дефолт срока купона: ${v} дн.`,
  });
}

export async function setExpireNotifyMinConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  await setDaysSettingConversation(conversation, ctx, {
    prompt: (s) =>
      `Мин. сумма бонусов для уведомлений (сейчас ${s.expireNotifyMinBonuses}). Введите новое значение`,
    apply: (expireNotifyMinBonuses) => ({ expireNotifyMinBonuses }),
    confirm: (v) => `Порог уведомлений: ${v} бонусов`,
    min: 0,
  });
}

export async function setWeeklyPrizesConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }
  const current = await conversation.external((outer) => outer.store.getSettings());
  await runCancellable({
    ctx,
    body: async () => {
      const winnersCount = await askCancellableInt({
        conversation,
        ctx,
        prompt: `Сколько победителей (сейчас ${current.winnersCount}). Введите N`,
      });
      if (winnersCount < 1) {
        await replyMainMenu({ ctx, text: "N должно быть ≥ 1" });
        return;
      }
      const prizeTable: PrizePlace[] = [];
      for (let place = 1; place <= winnersCount; place += 1) {
        const bonuses = await askCancellableInt({
          conversation,
          ctx,
          prompt: `Место ${place}: бонусы`,
        });
        const raw = (
          await askCancellableText({
            conversation,
            ctx,
            prompt: `Место ${place}: название купона или «-»`,
            otherwise: "Отправьте название купона или «-»",
          })
        ).trim();
        const couponTitle = raw === "-" || raw.length === 0 ? null : raw;
        prizeTable.push({ place, bonuses, couponTitle });
      }
      const couponClaimDays = await askCancellableInt({
        conversation,
        ctx,
        prompt: `Срок забора купонов в днях (сейчас ${current.couponClaimDays})`,
      });
      if (couponClaimDays < 1) {
        await replyMainMenu({ ctx, text: "Срок купона должен быть ≥ 1" });
        return;
      }
      const result = await conversation.external(async (outer) => {
        if (outer.dbUser?.role !== "admin") {
          return { ok: false as const, message: ADMIN_ONLY };
        }
        try {
          const settings = await outer.store.updateSettings({ winnersCount, prizeTable, couponClaimDays });
          return { ok: true as const, settings };
        } catch (err) {
          if (err instanceof DomainError) {
            return { ok: false as const, message: err.message };
          }
          throw err;
        }
      });
      if (!result.ok) {
        await replyMainMenu({ ctx, text: result.message });
        return;
      }
      await replyMainMenu({ ctx, text: formatSettings(result.settings) });
    },
  });
}

export async function assignRoleConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }

  await ctx.reply("Telegram ID или контакт пользователя");
  let telegramId: bigint | undefined;
  while (telegramId === undefined) {
    const next = await conversation.waitFor(["message:text", "message:contact"], {
      otherwise: (c) => c.reply("Отправьте Telegram ID числом или контакт"),
    });
    const fromContact = next.msg.contact?.user_id;
    if (fromContact !== undefined) {
      telegramId = BigInt(fromContact);
      continue;
    }
    const raw = next.msg.text?.trim() ?? "";
    if (!/^\d+$/.test(raw)) {
      await ctx.reply("Отправьте Telegram ID числом или контакт");
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

export async function addMenuItemConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }

  await runCancellable({
    ctx,
    body: async () => {
      const typeKeyboard = new InlineKeyboard()
        .text("Текстовая позиция", "menuItem:text")
        .text("Только картинка", "menuItem:image");

      await ctx.reply("Выберите тип позиции", { reply_markup: typeKeyboard });

      let itemType: "text" | "image" | undefined;
      while (itemType === undefined) {
        const next = await conversation.wait();
        throwIfCancel(next.message?.text);
        const data = next.callbackQuery?.data;
        if (data === "menuItem:text" || data === "menuItem:image") {
          await next.answerCallbackQuery();
          itemType = data === "menuItem:text" ? "text" : "image";
          continue;
        }
        await ctx.reply("Выберите тип позиции", { reply_markup: typeKeyboard });
      }

      let title = "";
      let description = "";
      let priceRubles: number | null = null;
      let imageFileId: string | null = null;

      if (itemType === "image") {
        imageFileId = await waitCancellablePhoto({
          conversation,
          ctx,
          prompt: "Пришлите фото позиции",
        });
        priceRubles = await askCancellablePriceOrSkip({ conversation, ctx });
      } else {
        title = (
          await askCancellableText({
            conversation,
            ctx,
            prompt: "Название позиции",
            otherwise: "Отправьте название текстом",
          })
        ).trim();
        description = await askCancellableText({
          conversation,
          ctx,
          prompt: "Описание",
          otherwise: "Отправьте описание текстом",
        });
        priceRubles = await askCancellablePriceOrSkip({ conversation, ctx });
        const addPhoto = await askCancellableYesNo({
          conversation,
          ctx,
          prompt: "Добавить фото? да/нет",
        });
        if (addPhoto) {
          imageFileId =
            (await waitCancellablePhotoOrSkip({
              conversation,
              ctx,
              prompt: "Пришлите фото",
            })) ?? null;
        }
      }

      const result = await conversation.external(async (outer) => {
        const actor = outer.dbUser;
        if (!actor || actor.role !== "admin") {
          return { ok: false as const, message: ADMIN_ONLY };
        }
        try {
          const item = await addMenuItem(outer.store, {
            actorId: actor.id,
            title,
            description,
            priceRubles,
            imageFileId,
          });
          return {
            ok: true as const,
            title: item.title,
            imageOnly: item.imageFileId !== null && item.title.length === 0,
          };
        } catch (err) {
          if (err instanceof DomainError) {
            return { ok: false as const, message: err.message };
          }
          throw err;
        }
      });

      if (!result.ok) {
        await replyMainMenu({ ctx, text: result.message });
        return;
      }

      const successText = result.imageOnly
        ? "Позиция добавлена"
        : `Позиция добавлена: ${result.title}`;
      await replyMainMenu({ ctx, text: successText });
    },
  });
}

export async function editContactsConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }

  const current = await conversation.external((outer) => outer.store.getPage("contacts"));
  await ctx.reply(
    current?.body?.trim()
      ? `Текущий текст:\n${current.body}\n\nОтправьте новый текст контактов`
      : "Отправьте текст контактов",
  );
  const body = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте текст контактов"),
    })
  ).msg.text;

  const result = await conversation.external(async (outer) => {
    const actor = outer.dbUser;
    if (!actor || actor.role !== "admin") {
      return { ok: false as const, message: ADMIN_ONLY };
    }
    try {
      await savePage(outer.store, {
        actorId: actor.id,
        slug: "contacts",
        body,
        mapUrl: null,
      });
      return { ok: true as const };
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

  await ctx.reply("Контакты обновлены");
}

export async function editDirectionsConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }

  const current = await conversation.external((outer) => outer.store.getPage("directions"));
  await ctx.reply(
    current?.body?.trim()
      ? `Текущий текст:\n${current.body}\n\nОтправьте новый текст «Как доехать»`
      : "Отправьте текст «Как доехать»",
  );
  const body = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте текст"),
    })
  ).msg.text;

  await ctx.reply("Ссылка на карту или «пропустить»");
  let mapUrl: string | null = current?.mapUrl ?? null;
  for (;;) {
    const raw = (
      await conversation.waitFor(":text", {
        otherwise: (c) => c.reply("Отправьте ссылку или «пропустить»"),
      })
    ).msg.text.trim();
    const lower = raw.toLowerCase();
    if (lower === "пропустить" || lower === "-" || lower === "нет") {
      mapUrl = null;
      break;
    }
    mapUrl = raw;
    break;
  }

  const result = await conversation.external(async (outer) => {
    const actor = outer.dbUser;
    if (!actor || actor.role !== "admin") {
      return { ok: false as const, message: ADMIN_ONLY };
    }
    try {
      await savePage(outer.store, {
        actorId: actor.id,
        slug: "directions",
        body,
        mapUrl,
      });
      return { ok: true as const };
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

  await ctx.reply("«Как доехать» обновлено");
}

export async function createPromoConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }

  await runCancellable({
    ctx,
    body: async () => {
      await ctx.reply("Кому отправить?\n" + segmentMenuText(), { reply_markup: cancelKeyboard() });
      let segment: BroadcastSegmentId | undefined;
      while (segment === undefined) {
        const raw = (
          await waitCancellableText({
            conversation,
            ctx,
            otherwise: "Выберите сегмент номером или id",
          })
        ).trim();
        const parsed = parseBroadcastSegment(raw);
        if (parsed === null) {
          await ctx.reply("Неизвестный сегмент. Попробуйте снова", { reply_markup: cancelKeyboard() });
          continue;
        }
        segment = parsed;
      }

      let balanceMin: number | undefined;
      if (segment === "balance_gt") {
        balanceMin = await askCancellableInt({
          conversation,
          ctx,
          prompt: "Минимальный баланс для сегмента",
        });
      }

      const preview = await conversation.external(async (outer) => {
        const count = await previewSegmentCount(outer.store, {
          segment,
          params: { balanceMin },
          now: new Date(),
        });
        return count;
      });
      await ctx.reply(`Получателей: ${preview}`, { reply_markup: cancelKeyboard() });

      await ctx.reply("Текст акции", { reply_markup: cancelKeyboard() });
      let body: string | undefined;
      while (body === undefined) {
        const raw = (
          await waitCancellableText({
            conversation,
            ctx,
            otherwise: "Отправьте текст акции",
          })
        ).trim();
        if (raw.length === 0) {
          await ctx.reply("Текст не должен быть пустым", { reply_markup: cancelKeyboard() });
          continue;
        }
        body = raw;
      }

      const photoId = await waitCancellablePhotoOrSkip({
        conversation,
        ctx,
        prompt: "Пришлите фото или «пропустить»",
      });
      const showInFeed = await askCancellableYesNo({
        conversation,
        ctx,
        prompt: "Показать в разделе «Акции»? да/нет",
      });
      const sendNow = await askCancellableYesNo({
        conversation,
        ctx,
        prompt: "Разослать сейчас? да/нет",
      });

      const result = await conversation.external(async (outer) => {
        const actor = outer.dbUser;
        if (!actor || actor.role !== "admin") {
          return { ok: false as const, message: ADMIN_ONLY };
        }
        try {
          const telegramIds = sendNow
            ? await recipientsForSegment(outer.store, {
                segment,
                params: { balanceMin },
                now: new Date(),
              })
            : [];
          const stats = sendNow
            ? await sendBroadcast({
                api: outer.api,
                telegramIds,
                body,
                photoId,
              })
            : { sent: 0, failed: 0 };
          const promo = await outer.store.createPromo({
            body,
            photos: photoId === undefined ? [] : [photoId],
            showInFeed,
            broadcastSegment: segment,
            broadcastRecipients: sendNow ? telegramIds.length : null,
            broadcastSent: sendNow ? stats.sent : null,
            broadcastFailed: sendNow ? stats.failed : null,
          });
          if (!sendNow) {
            return {
              ok: true as const,
              sent: 0,
              failed: 0,
              skippedSend: true as const,
              promoId: promo.id,
            };
          }
          return { ok: true as const, ...stats, skippedSend: false as const, promoId: promo.id };
        } catch (err) {
          if (err instanceof DomainError) {
            return { ok: false as const, message: err.message };
          }
          throw err;
        }
      });

      if (!result.ok) {
        await replyMainMenu({ ctx, text: result.message });
        return;
      }

      const addRule = await askCancellableYesNo({
        conversation,
        ctx,
        prompt: "Добавить условие начисления к акции? да/нет",
      });
      if (addRule) {
        await ctx.reply("Тип условия:\n" + promoRuleMenuText(), { reply_markup: cancelKeyboard() });
        let kind: PromoRuleKind | undefined;
        while (kind === undefined) {
          const raw = (
            await waitCancellableText({
              conversation,
              ctx,
              otherwise: "Выберите тип условия",
            })
          ).trim();
          const parsed = parsePromoRuleKind(raw);
          if (parsed === null) {
            await ctx.reply("Неизвестный тип. Попробуйте снова", { reply_markup: cancelKeyboard() });
            continue;
          }
          kind = parsed;
        }
        const params = await askPromoRuleParams(conversation, ctx, kind);
        await conversation.external(async (outer) => {
          await outer.store.createPromoRule({
            promoId: result.promoId,
            kind,
            params,
            active: true,
          });
        });
        await ctx.reply(`Условие «${promoRuleKindLabelRu(kind)}» добавлено`);
      }

      if (result.skippedSend) {
        await replyMainMenu({ ctx, text: "Акция сохранена" });
        return;
      }
      await replyMainMenu({
        ctx,
        text: `Акция сохранена. Разослано: ${result.sent}, ошибок: ${result.failed}`,
      });
    },
  });
}

export async function addQuizQuestionConversation(conversation: BotConversation, ctx: BotContext) {
  if (!(await requireAdminOrReply(ctx))) {
    return;
  }
  const quiz = await conversation.external((outer) => outer.store.findActiveQuiz());
  if (quiz === null) {
    await ctx.reply("Нет активной викторины");
    return;
  }
  await ctx.reply("Текст вопроса", { reply_markup: cancelKeyboard() });
  const text = (await waitCancellableText({ conversation, ctx, otherwise: "Отправьте текст" })).trim();
  const options: string[] = [];
  for (let index = 1; index <= 4; index += 1) {
    await ctx.reply(`Вариант ${index}`, { reply_markup: cancelKeyboard() });
    options.push((await waitCancellableText({ conversation, ctx, otherwise: "Отправьте вариант" })).trim());
  }
  await ctx.reply("Номер правильного варианта (1-4)", { reply_markup: cancelKeyboard() });
  const correctRaw = Number(
    (await waitCancellableText({ conversation, ctx, otherwise: "Отправьте число 1-4" })).trim(),
  );
  const correctIndex = correctRaw - 1;
  const result = await conversation.external(async (outer) => {
    try {
      const question = await addQuizQuestion(outer.store, {
        quizId: quiz.id,
        text,
        options,
        correctIndex,
      });
      return { ok: true as const, sort: question.sort };
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
  await ctx.reply(`Вопрос #${result.sort} добавлен`);
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
    await enterConversation(ctx, "assignRole");
  });

  bot.hears("Рассылка", async (ctx) => {
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    await enterConversation(ctx, "createPromo");
  });

  bot.hears("Подозрительные партии", async (ctx) => {
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    const rows = await listRejectedSessions(ctx.store, 15);
    if (rows.length === 0) {
      await ctx.reply("Подозрительных партий нет");
      return;
    }
    const lines = rows.map(
      (row) =>
        `${row.slug}: ${row.points} (${row.rejectReason ?? "reject"}) · ${row.createdAt.toISOString()}`,
    );
    await ctx.reply(["Последние отклонённые партии:", ...lines].join("\n"));
  });

  bot.hears("Викторина", async (ctx) => {
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    const quiz = await ctx.store.findActiveQuiz();
    if (quiz === null) {
      await ctx.reply("Нет активной викторины в каталоге");
      return;
    }
    try {
      const now = new Date();
      const session = await startQuizSession(ctx.store, {
        quizId: quiz.id,
        durationMinutes: 30,
        now,
      });
      const notified = await notifyActiveGuestsOfQuiz(ctx.store, ctx.api, {
        quizTitle: quiz.title,
        now,
      });
      await ctx.reply(
        `Викторина «${quiz.title}» запущена до ${session.endsAt.toISOString()}\nУведомлено гостей с визитом: ${notified}`,
      );
    } catch (err) {
      if (err instanceof DomainError) {
        await ctx.reply(err.message);
        return;
      }
      throw err;
    }
  });

  bot.hears("Вопрос викторины", async (ctx) => {
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    await enterConversation(ctx, "addQuizQuestion");
  });

  bot.hears(["Веб-админ", "🖥 Веб-админ"], async (ctx) => {
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    await ctx.reply("Откройте панель администратора", {
      reply_markup: new InlineKeyboard().webApp("Открыть веб-админ", adminAppUrl(ctx.config.publicUrl)),
    });
  });

  bot.callbackQuery(
    /^admin:(percent|registration|birthday|visitHours|checkTtl|giftTtl|couponDefault|notifyMin|prizes)$/,
    async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    const matched = ctx.match;
    const action = Array.isArray(matched) ? matched[1] : undefined;
    if (action === undefined || !isSettingsAction(action)) {
      return;
    }
    await enterConversation(ctx, SETTINGS_CONVERSATIONS[action]);
  });

  bot.callbackQuery("admin:addMenuItem", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    await enterConversation(ctx, "addMenuItem");
  });

  bot.callbackQuery("admin:editContacts", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    await enterConversation(ctx, "editContacts");
  });

  bot.callbackQuery("admin:editDirections", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await requireAdminOrReply(ctx))) {
      return;
    }
    await enterConversation(ctx, "editDirections");
  });
}
