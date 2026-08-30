import { expect, test } from "vitest";
import type { Update, UserFromGetMe } from "grammy/types";
import { createBot } from "../../src/bot/create-bot.ts";
import { MemoryStore } from "../../src/store/memory.ts";

const ADMIN_ID = 500459806;
const GUEST_ID = 700000001;
const PUBLIC_URL = "https://bot.example";

const botInfo: UserFromGetMe = {
  id: 1,
  is_bot: true,
  first_name: "Friends",
  username: "friends_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
};

const dummyMessage = {
  message_id: 1,
  date: 1_700_000_000,
  chat: { id: 1, type: "private" as const },
  text: "ok",
};

type SendTextParameters = {
  readonly userId: number;
  readonly text: string;
  readonly updateId: number;
};

const sendText = async (
  bot: ReturnType<typeof createBot>,
  { userId, text, updateId }: SendTextParameters,
) => {
  const from = { id: userId, is_bot: false, first_name: "Test" };
  const update: Update = {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_700_000_000,
      chat: { id: userId, type: "private", first_name: "Test" },
      from,
      text,
      ...(text.startsWith("/")
        ? { entities: [{ offset: 0, length: text.length, type: "bot_command" as const }] }
        : {}),
    },
  };
  await bot.handleUpdate(update);
};

type SendCallbackParameters = {
  readonly userId: number;
  readonly data: string;
  readonly updateId: number;
};

const sendCallback = async (
  bot: ReturnType<typeof createBot>,
  { userId, data, updateId }: SendCallbackParameters,
) => {
  const from = { id: userId, is_bot: false, first_name: "Test" };
  await bot.handleUpdate({
    update_id: updateId,
    callback_query: {
      id: String(updateId),
      from,
      chat_instance: "test",
      data,
      message: {
        message_id: updateId,
        date: 1_700_000_000,
        chat: { id: userId, type: "private", first_name: "Test" },
        text: "profile",
      },
    },
  });
};

const sendContact = async (
  bot: ReturnType<typeof createBot>,
  userId: number,
  updateId: number,
  contactUserId: number = userId,
) => {
  const from = { id: userId, is_bot: false, first_name: "Test" };
  await bot.handleUpdate({
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_700_000_000,
      chat: { id: userId, type: "private", first_name: "Test" },
      from,
      contact: {
        phone_number: "+7 999 123-45-67",
        first_name: "Test",
        user_id: contactUserId,
      },
    },
  });
};

const sendMyChatMember = async (
  bot: ReturnType<typeof createBot>,
  userId: number,
  updateId: number,
  status: "member" | "kicked",
) => {
  const from = { id: userId, is_bot: false, first_name: "Test" };
  const botUser = { id: botInfo.id, is_bot: true, first_name: botInfo.first_name };
  await bot.handleUpdate({
    update_id: updateId,
    my_chat_member: {
      chat: { id: userId, type: "private", first_name: "Test" },
      from,
      date: 1_700_000_000,
      old_chat_member: { user: botUser, status: status === "kicked" ? "member" : "kicked" },
      new_chat_member: { user: botUser, status },
    },
  });
};

type SentMessage = {
  readonly method: string;
  readonly payload: Record<string, unknown>;
};

const parsePayload = (body: unknown): Record<string, unknown> => {
  if (body === undefined || body === null) {
    return {};
  }
  const raw = typeof body === "string" ? body : String(body);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  return {};
};

const hrefOf = (url: unknown): string => {
  if (typeof url === "string") {
    return url;
  }
  if (url instanceof URL) {
    return url.href;
  }
  return String(url);
};

const keyboardTexts = (sent: SentMessage | undefined): readonly string[] => {
  const markup = sent?.payload.reply_markup;
  if (typeof markup !== "object" || markup === null || !("keyboard" in markup)) {
    return [];
  }
  const keyboard = markup.keyboard;
  if (!Array.isArray(keyboard)) {
    return [];
  }
  return keyboard.flat().flatMap((button) => {
    if (typeof button === "object" && button !== null && "text" in button) {
      return [String(button.text)];
    }
    return [];
  });
};

const inlineKeyboardTexts = (sent: SentMessage | undefined): readonly string[] => {
  const markup = sent?.payload.reply_markup;
  if (typeof markup !== "object" || markup === null || !("inline_keyboard" in markup)) {
    return [];
  }
  const keyboard = markup.inline_keyboard;
  if (!Array.isArray(keyboard)) {
    return [];
  }
  return keyboard.flat().flatMap((button) => {
    if (typeof button === "object" && button !== null && "text" in button) {
      return [String(button.text)];
    }
    return [];
  });
};

const lastSendMessage = (sent: readonly SentMessage[]): SentMessage | undefined => {
  return [...sent].reverse().find((row) => row.method === "sendMessage");
};

const createTestBot = (
  store: MemoryStore,
  sent: SentMessage[] = [],
  failSendTexts: ReadonlyArray<string> = [],
) => {
  return createBot(
    "test-token",
    store,
    {
      adminTelegramId: BigInt(ADMIN_ID),
      publicUrl: PUBLIC_URL,
    },
    {
      botInfo,
      client: {
        fetch: (url, init) => {
          const payload = parsePayload(init?.body);
          sent.push({
            method: hrefOf(url).split("/").pop() ?? "",
            payload,
          });
          if (
            typeof payload.text === "string" &&
            failSendTexts.includes(payload.text)
          ) {
            return Promise.resolve({
              json: () =>
                Promise.resolve({
                  ok: false,
                  error_code: 403,
                  description: "Forbidden: bot was blocked by the user",
                }),
            });
          }
          return Promise.resolve({
            json: () => Promise.resolve({ ok: true, result: dummyMessage }),
          });
        },
      },
    },
  );
};

test("admin can assign master role through the conversation", async () => {
  const store = new MemoryStore();
  const bot = createTestBot(store);

  await sendText(bot, { userId: ADMIN_ID, text: "/start", updateId: 1 });
  await sendText(bot, { userId: ADMIN_ID, text: "Роли", updateId: 2 });
  await sendText(bot, { userId: ADMIN_ID, text: String(GUEST_ID), updateId: 3 });
  await sendText(bot, { userId: ADMIN_ID, text: "master", updateId: 4 });

  const guest = await store.findUserByTelegramId(BigInt(GUEST_ID));
  expect(guest?.role).toBe("master");
});

test("admin can assign role by sharing a contact", async () => {
  const store = new MemoryStore();
  const bot = createTestBot(store);

  await sendText(bot, { userId: ADMIN_ID, text: "/start", updateId: 1 });
  await sendText(bot, { userId: ADMIN_ID, text: "Роли", updateId: 2 });
  await sendContact(bot, ADMIN_ID, 3, GUEST_ID);
  await sendText(bot, { userId: ADMIN_ID, text: "master", updateId: 4 });

  const guest = await store.findUserByTelegramId(BigInt(GUEST_ID));
  expect(guest?.role).toBe("master");
});

test("blocked-bot update does not drop an active assign-role conversation", async () => {
  const store = new MemoryStore();
  const bot = createTestBot(store, [], ["Отправьте Telegram ID числом или контакт"]);

  await sendText(bot, { userId: ADMIN_ID, text: "/start", updateId: 1 });
  await sendText(bot, { userId: ADMIN_ID, text: "Роли", updateId: 2 });
  await sendMyChatMember(bot, ADMIN_ID, 3, "kicked");
  await sendText(bot, { userId: ADMIN_ID, text: String(GUEST_ID), updateId: 4 });
  await sendText(bot, { userId: ADMIN_ID, text: "master", updateId: 5 });

  const guest = await store.findUserByTelegramId(BigInt(GUEST_ID));
  expect(guest?.role).toBe("master");
});

test("guest registration finishes after name birthday and contact", async () => {
  const store = new MemoryStore();
  const bot = createTestBot(store);

  await sendText(bot, { userId: GUEST_ID, text: "/start", updateId: 1 });
  await sendText(bot, { userId: GUEST_ID, text: "Иван", updateId: 2 });
  await sendText(bot, { userId: GUEST_ID, text: "Петров", updateId: 3 });
  await sendText(bot, { userId: GUEST_ID, text: "01.02.1990", updateId: 4 });
  await sendContact(bot, GUEST_ID, 5);

  const guest = await store.findUserByTelegramId(BigInt(GUEST_ID));
  expect(guest?.role).toBe("guest");
  expect(guest?.firstName).toBe("Иван");
  expect(guest?.lastName).toBe("Петров");
  expect(guest?.phone).toBe("79991234567");
  expect(guest?.balance).toBeGreaterThan(0);
});

test("admin cancel during broadcast does not save promo", async () => {
  const store = new MemoryStore();
  const sent: SentMessage[] = [];
  const bot = createTestBot(store, sent);

  await sendText(bot, { userId: ADMIN_ID, text: "/start", updateId: 1 });
  await sendText(bot, { userId: ADMIN_ID, text: "Рассылка", updateId: 2 });

  expect(keyboardTexts(lastSendMessage(sent))).toContain("Отмена");

  await sendText(bot, { userId: ADMIN_ID, text: "Отмена", updateId: 3 });

  expect(await store.listFeedPromos()).toEqual([]);
  const cancelled = sent.find((row) => row.payload.text === "Отменено");
  expect(cancelled).toBeDefined();
  expect(keyboardTexts(cancelled)).toContain("Рассылка");
});

test("admin broadcast success restores the main keyboard", async () => {
  const store = new MemoryStore();
  const sent: SentMessage[] = [];
  const bot = createTestBot(store, sent);

  await sendText(bot, { userId: ADMIN_ID, text: "/start", updateId: 1 });
  await sendText(bot, { userId: ADMIN_ID, text: "Рассылка", updateId: 2 });
  await sendText(bot, { userId: ADMIN_ID, text: "1", updateId: 3 });
  await sendText(bot, { userId: ADMIN_ID, text: "Скидка на кальян", updateId: 4 });
  await sendText(bot, { userId: ADMIN_ID, text: "пропустить", updateId: 5 });
  await sendText(bot, { userId: ADMIN_ID, text: "да", updateId: 6 });
  await sendText(bot, { userId: ADMIN_ID, text: "нет", updateId: 7 });
  await sendText(bot, { userId: ADMIN_ID, text: "нет", updateId: 8 });

  const promos = await store.listFeedPromos();
  expect(promos).toHaveLength(1);
  expect(promos[0]?.body).toBe("Скидка на кальян");
  const saved = sent.find((row) => row.payload.text === "Акция сохранена");
  expect(saved).toBeDefined();
  expect(keyboardTexts(saved)).toContain("Рассылка");
});

test("guest profile shows data with edit button", async () => {
  const store = new MemoryStore();
  await store.createUser({
    telegramId: BigInt(GUEST_ID),
    role: "guest",
    firstName: "Иван",
    lastName: "Петров",
    birthday: new Date("1990-02-01"),
    phone: "79991234567",
    qrToken: "qr-guest-1",
  });
  const sent: SentMessage[] = [];
  const bot = createTestBot(store, sent);

  await sendText(bot, { userId: GUEST_ID, text: "/start", updateId: 1 });
  await sendText(bot, { userId: GUEST_ID, text: "Профиль", updateId: 2 });

  expect(sent.some((row) => row.payload.text === "Как вас зовут? (имя)")).toBe(false);
  const profile = sent.find(
    (row) => typeof row.payload.text === "string" && row.payload.text.includes("Ваш профиль"),
  );
  expect(profile).toBeDefined();
  expect(String(profile?.payload.text)).toContain("ФИО: Иван Петров");
  expect(String(profile?.payload.text)).toContain("Дата рождения: 01.02.1990");
  expect(String(profile?.payload.text)).toContain("Телефон: +7 999 123-45-67");
  expect(inlineKeyboardTexts(profile)).toContain("Редактировать");
});

test("guest cancel during profile does not change data", async () => {
  const store = new MemoryStore();
  await store.createUser({
    telegramId: BigInt(GUEST_ID),
    role: "guest",
    firstName: "Иван",
    lastName: "Петров",
    birthday: new Date("1990-02-01"),
    phone: "79991234567",
    qrToken: "qr-guest-1",
  });
  const sent: SentMessage[] = [];
  const bot = createTestBot(store, sent);

  await sendText(bot, { userId: GUEST_ID, text: "/start", updateId: 1 });
  await sendText(bot, { userId: GUEST_ID, text: "Профиль", updateId: 2 });
  await sendCallback(bot, { userId: GUEST_ID, data: "guest:editProfile", updateId: 3 });
  await sendText(bot, { userId: GUEST_ID, text: "Отмена", updateId: 4 });

  const guest = await store.findUserByTelegramId(BigInt(GUEST_ID));
  expect(guest?.firstName).toBe("Иван");
  expect(guest?.lastName).toBe("Петров");
  const cancelled = sent.find((row) => row.payload.text === "Отменено");
  expect(cancelled).toBeDefined();
  expect(keyboardTexts(cancelled)).toContain("Профиль");
});

test("unregistered guest cannot skip registration via menu", async () => {
  const store = new MemoryStore();
  const sent: SentMessage[] = [];
  const bot = createTestBot(store, sent);

  await sendText(bot, { userId: GUEST_ID, text: "Меню", updateId: 1 });

  expect(await store.findUserByTelegramId(BigInt(GUEST_ID))).toBeNull();
  expect(sent.some((row) => row.payload.text === "Как вас зовут? (имя)")).toBe(true);
  expect(keyboardTexts(lastSendMessage(sent))).not.toContain("Отмена");
});

test("Отмена during registration does not skip the wizard", async () => {
  const store = new MemoryStore();
  const sent: SentMessage[] = [];
  const bot = createTestBot(store, sent);

  await sendText(bot, { userId: GUEST_ID, text: "/start", updateId: 1 });
  await sendText(bot, { userId: GUEST_ID, text: "Отмена", updateId: 2 });

  expect(await store.findUserByTelegramId(BigInt(GUEST_ID))).toBeNull();
  expect(sent.some((row) => row.payload.text === "Фамилия?")).toBe(true);
  expect(sent.some((row) => row.payload.text === "Отменено")).toBe(false);
});
