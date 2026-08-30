import type { Conversation } from "@grammyjs/conversations";
import { InputFile } from "grammy";
import { DomainError } from "../domain/errors.ts";
import { registerGuest } from "../domain/users.ts";
import { parseReferralStartPayload, resolveReferrerByCode } from "../domain/referral.ts";
import type { BotContext } from "./context.ts";
import { contactKeyboard, mainKeyboard } from "./keyboards.ts";
import { qrPngBuffer } from "./qr.ts";

const BIRTHDAY_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

export async function registerGuestConversation(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  const fromId = ctx.from?.id;
  if (fromId === undefined) {
    await ctx.reply("Не удалось определить пользователя");
    return;
  }

  if (ctx.session?.pendingReferralCode !== undefined) {
    await ctx.reply("👋 Вы пришли по приглашению друга! Бонусы начислятся после первого визита.");
  }

  await ctx.reply(
    "🌫️ Добро пожаловать в «Друзья»!\n\nРегистрация займёт минуту: бонусы за чеки, игры недели и призы.\n\nШаг 1/4 — как вас зовут?",
  );
  const firstName = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте имя текстом"),
    })
  ).msg.text.trim();

  await ctx.reply("Шаг 2/4 — фамилия?");
  const lastName = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте фамилию текстом"),
    })
  ).msg.text.trim();

  await ctx.reply("Шаг 3/4 — дата рождения");
  const birthday = await askBirthday(conversation, ctx);

  await ctx.reply(
    "Шаг 4/4 — телефон\n\n📱 Нужен для начисления бонусов и быстрого поиска на кассе.",
    { reply_markup: contactKeyboard() },
  );
  const contact = await conversation.form.contact({
    otherwise: (c) => c.reply("Нажмите кнопку «Поделиться контактом»"),
  });

  const result = await conversation.external(async (outer) => {
    try {
      let referredByUserId: string | null = null;
      const pendingCode = outer.session.pendingReferralCode;
      if (pendingCode !== undefined) {
        const referrer = await resolveReferrerByCode(outer.store, pendingCode);
        if (referrer !== null && referrer.telegramId !== BigInt(fromId)) {
          referredByUserId = referrer.id;
        }
        delete outer.session.pendingReferralCode;
      }
      const user = await registerGuest(outer.store, {
        telegramId: BigInt(fromId),
        firstName,
        lastName,
        birthday,
        phone: contact.phone_number,
        referredByUserId,
      });
      return { ok: true as const, balance: user.balance, role: user.role, qrToken: user.qrToken };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });

  if (!result.ok) {
    await ctx.reply(result.message, { reply_markup: { remove_keyboard: true } });
    return;
  }

  const buf = await qrPngBuffer(result.qrToken);
  await ctx.replyWithPhoto(new InputFile(buf), {
    caption: `✅ Регистрация завершена!\n\n💰 Баланс: ${result.balance} бонусов\n📱 Ваш QR для кассы — на фото\n\n🎮 Отметьтесь в зале, чтобы открыть игры недели.`,
    reply_markup: mainKeyboard({ role: result.role, publicUrl: ctx.config.publicUrl }),
  });
};

export async function askBirthday(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
): Promise<Date> {
  await ctx.reply("Дата рождения, ДД.ММ.ГГГГ");
  for (;;) {
    const text = (await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Введите дату в формате ДД.ММ.ГГГГ"),
    })).msg.text.trim();
    const parsed = parseBirthday(text);
    if (parsed) {
      return parsed;
    }
    await ctx.reply("Введите дату в формате ДД.ММ.ГГГГ");
  }
}

export function formatBirthday(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}.${month}.${year}`;
}

export function parseBirthday(text: string): Date | null {
  const match = BIRTHDAY_RE.exec(text);
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
