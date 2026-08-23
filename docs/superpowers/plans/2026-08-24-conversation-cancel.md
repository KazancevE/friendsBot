# Conversation Cancel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка «Отмена» в сценариях длиннее двух шагов (кроме регистрации) и запрет пропускать регистрацию.

**Architecture:** Общие хелперы вопроса кидают `ConversationCancelled`; сценарий ловит и отвечает «Отменено» с главным меню. Незарегистрированного middleware всегда отправляет в `registerGuest`.

**Tech Stack:** TypeScript, grammY, @grammyjs/conversations, vitest, MemoryStore

---

## File structure

| File | Responsibility |
|---|---|
| `src/bot/keyboards.ts` | `cancelKeyboard`, `contactOrCancelKeyboard` |
| `src/bot/conversation-cancel.ts` | отмена, вопросы с кнопкой, возврат меню |
| `src/bot/require-registered.ts` | незарегистрированный → только регистрация |
| `src/bot/register.ts` | экспорт `parseBirthday`; без отмены |
| `src/bot/admin.ts` | рассылка, меню, призы недели |
| `src/bot/guest.ts` | профиль |
| `src/bot/create-bot.ts` | `requireRegisteredUser` после conversations |
| `tests/bot/create-bot.test.ts` | отмена, меню после успеха, нельзя скипнуть регистрацию |
| `tests/bot/keyboards.test.ts` | кнопки отмены |

### Task 1: Тесты отмены и обязательной регистрации

**Files:**
- Modify: `tests/bot/create-bot.test.ts`
- Modify: `tests/bot/keyboards.test.ts`

- [x] **Step 1: Write the failing tests**

В `create-bot.test.ts` записывать исходящие `sendMessage` через `client.fetch`. Добавить кейсы: отмена рассылки, отмена профиля, успешная рассылка возвращает меню, «Меню» без регистрации не создаёт пользователя, «Отмена» в регистрации не выходит из мастера.

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/bot/create-bot.test.ts tests/bot/keyboards.test.ts`

- [x] **Step 3: Implement helpers and wire conversations**

`cancelKeyboard` / `contactOrCancelKeyboard`; `conversation-cancel.ts`; `requireRegisteredUser`; подключить в рассылке, меню, призах, профиле; экспорт `parseBirthday`; middleware в `create-bot.ts`.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`

- [ ] **Step 5: Commit only if the user asks**
