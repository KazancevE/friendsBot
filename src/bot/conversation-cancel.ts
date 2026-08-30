import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "./context.ts";
import {
  CANCEL_TEXT,
  cancelKeyboard,
  contactOrCancelKeyboard,
  mainKeyboard,
} from "./keyboards.ts";
import { parseBirthday } from "./register.ts";

type BotConversation = Conversation<BotContext, BotContext>;

export class ConversationCancelled extends Error {
  readonly name = "ConversationCancelled";

  constructor() {
    super("cancelled");
  }
}

export const isCancelText = (text: string | undefined): boolean => {
  return text === CANCEL_TEXT;
};

const throwIfCancel = (text: string | undefined) => {
  if (isCancelText(text)) {
    throw new ConversationCancelled();
  }
};

export { throwIfCancel };

const isSkipText = (text: string): boolean => {
  const lower = text.trim().toLowerCase();
  return lower === "пропустить" || lower === "-" || lower === "нет";
};

const parseYesNo = (raw: string): boolean | undefined => {
  const value = raw.trim().toLowerCase();
  if (value === "да" || value === "yes" || value === "+") {
    return true;
  }
  if (value === "нет" || value === "no" || value === "-") {
    return false;
  }
  return undefined;
};

type ReplyMainMenuParameters = {
  readonly ctx: BotContext;
  readonly text: string;
};

export const replyMainMenu = async ({ ctx, text }: ReplyMainMenuParameters) => {
  const role = ctx.dbUser?.role;
  if (role === undefined) {
    await ctx.reply(text);
    return;
  }
  await ctx.reply(text, {
    reply_markup: mainKeyboard({ role }),
  });
};

type RunCancellableParameters = {
  readonly ctx: BotContext;
  readonly body: () => Promise<void>;
};

export const runCancellable = async ({ ctx, body }: RunCancellableParameters) => {
  try {
    await body();
  } catch (err) {
    if (err instanceof ConversationCancelled) {
      await replyMainMenu({ ctx, text: "Отменено" });
      return;
    }
    throw err;
  }
};

type WaitTextParameters = {
  readonly conversation: BotConversation;
  readonly ctx: BotContext;
  readonly otherwise: string;
};

export const waitCancellableText = async ({
  conversation,
  ctx,
  otherwise,
}: WaitTextParameters): Promise<string> => {
  const msg = await conversation.waitFor(":text", {
    otherwise: (c) => c.reply(otherwise, { reply_markup: cancelKeyboard() }),
  });
  throwIfCancel(msg.msg.text);
  return msg.msg.text;
};

type AskTextParameters = {
  readonly conversation: BotConversation;
  readonly ctx: BotContext;
  readonly prompt: string;
  readonly otherwise: string;
};

export const askCancellableText = async ({
  conversation,
  ctx,
  prompt,
  otherwise,
}: AskTextParameters): Promise<string> => {
  await ctx.reply(prompt, { reply_markup: cancelKeyboard() });
  return waitCancellableText({ conversation, ctx, otherwise });
};

type AskIntParameters = {
  readonly conversation: BotConversation;
  readonly ctx: BotContext;
  readonly prompt: string;
};

export const askCancellableInt = async ({
  conversation,
  ctx,
  prompt,
}: AskIntParameters): Promise<number> => {
  await ctx.reply(prompt, { reply_markup: cancelKeyboard() });
  for (;;) {
    const raw = (
      await waitCancellableText({
        conversation,
        ctx,
        otherwise: "Введите целое число",
      })
    ).trim();
    if (!/^-?\d+$/.test(raw)) {
      await ctx.reply("Введите целое число", { reply_markup: cancelKeyboard() });
      continue;
    }
    return Number.parseInt(raw, 10);
  }
};

type AskYesNoParameters = {
  readonly conversation: BotConversation;
  readonly ctx: BotContext;
  readonly prompt: string;
};

export const askCancellableYesNo = async ({
  conversation,
  ctx,
  prompt,
}: AskYesNoParameters): Promise<boolean> => {
  await ctx.reply(prompt, { reply_markup: cancelKeyboard() });
  for (;;) {
    const raw = await waitCancellableText({
      conversation,
      ctx,
      otherwise: "Ответьте «да» или «нет»",
    });
    const parsed = parseYesNo(raw);
    if (parsed !== undefined) {
      return parsed;
    }
    await ctx.reply("Ответьте «да» или «нет»", { reply_markup: cancelKeyboard() });
  }
};

type AskPhotoParameters = {
  readonly conversation: BotConversation;
  readonly ctx: BotContext;
  readonly prompt: string;
};

export const waitCancellablePhotoOrSkip = async ({
  conversation,
  ctx,
  prompt,
}: AskPhotoParameters): Promise<string | undefined> => {
  await ctx.reply(prompt, { reply_markup: cancelKeyboard() });
  for (;;) {
    const next = await conversation.wait();
    throwIfCancel(next.message?.text);
    const photos = next.message?.photo;
    if (photos !== undefined && photos.length > 0) {
      const largest = photos[photos.length - 1];
      if (largest !== undefined) {
        return largest.file_id;
      }
    }
    if (next.message?.text !== undefined && isSkipText(next.message.text)) {
      return undefined;
    }
    await ctx.reply("Пришлите фото или «пропустить»", { reply_markup: cancelKeyboard() });
  }
};

export const waitCancellablePhoto = async ({
  conversation,
  ctx,
  prompt,
}: AskPhotoParameters): Promise<string> => {
  await ctx.reply(prompt, { reply_markup: cancelKeyboard() });
  for (;;) {
    const next = await conversation.wait();
    throwIfCancel(next.message?.text);
    const photos = next.message?.photo;
    if (photos !== undefined && photos.length > 0) {
      const largest = photos[photos.length - 1];
      if (largest !== undefined) {
        return largest.file_id;
      }
    }
    await ctx.reply("Пришлите фото", { reply_markup: cancelKeyboard() });
  }
};

type AskPriceParameters = {
  readonly conversation: BotConversation;
  readonly ctx: BotContext;
};

export const askCancellablePriceOrSkip = async ({
  conversation,
  ctx,
}: AskPriceParameters): Promise<number | null> => {
  await ctx.reply("Цена в рублях или «пропустить»", { reply_markup: cancelKeyboard() });
  for (;;) {
    const raw = (
      await waitCancellableText({
        conversation,
        ctx,
        otherwise: "Отправьте цену числом или «пропустить»",
      })
    ).trim();
    if (isSkipText(raw)) {
      return null;
    }
    if (!/^\d+$/.test(raw)) {
      await ctx.reply("Отправьте цену числом или «пропустить»", {
        reply_markup: cancelKeyboard(),
      });
      continue;
    }
    return Number.parseInt(raw, 10);
  }
};

type AskBirthdayParameters = {
  readonly conversation: BotConversation;
  readonly ctx: BotContext;
};

export const askCancellableBirthday = async ({
  conversation,
  ctx,
}: AskBirthdayParameters): Promise<Date> => {
  await ctx.reply("Дата рождения, ДД.ММ.ГГГГ", { reply_markup: cancelKeyboard() });
  for (;;) {
    const text = (
      await waitCancellableText({
        conversation,
        ctx,
        otherwise: "Введите дату в формате ДД.ММ.ГГГГ",
      })
    ).trim();
    const parsed = parseBirthday(text);
    if (parsed) {
      return parsed;
    }
    await ctx.reply("Введите дату в формате ДД.ММ.ГГГГ", { reply_markup: cancelKeyboard() });
  }
};

type AskContactParameters = {
  readonly conversation: BotConversation;
  readonly ctx: BotContext;
  readonly prompt: string;
};

export const waitCancellableContactOrSkip = async ({
  conversation,
  ctx,
  prompt,
}: AskContactParameters): Promise<string | undefined> => {
  await ctx.reply(prompt, { reply_markup: contactOrCancelKeyboard() });
  for (;;) {
    const next = await conversation.wait();
    throwIfCancel(next.message?.text);
    const contact = next.message?.contact;
    if (contact) {
      return contact.phone_number;
    }
    if (next.message?.text !== undefined && isSkipText(next.message.text)) {
      return undefined;
    }
    await ctx.reply("Нажмите «Поделиться контактом» или напишите «пропустить»", {
      reply_markup: contactOrCancelKeyboard(),
    });
  }
};
