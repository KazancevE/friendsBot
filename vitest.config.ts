import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Существующие тесты завязаны на календарь Europe/Moscow.
    // Продакшен и демо без этой переменной живут в Asia/Barnaul.
    env: {
      VENUE_TIMEZONE: "Europe/Moscow",
    },
  },
});
