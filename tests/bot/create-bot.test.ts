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

const sendContact = async (
  bot: ReturnType<typeof createBot>,
  userId: number,
  updateId: number,
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
        user_id: userId,
      },
    },
  });
};

const createTestBot = (store: MemoryStore) => {
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
        fetch: () =>
          Promise.resolve({
            json: () => Promise.resolve({ ok: true, result: dummyMessage }),
          }),
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
