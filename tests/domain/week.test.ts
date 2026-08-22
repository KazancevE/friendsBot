import { expect, test } from "vitest";
import { DateTime } from "luxon";
import { weekStartMoscow } from "../../src/domain/week.ts";

test("Saturday Aug 22 2026 belongs to week starting Monday Aug 17 2026 00:00 MSK", () => {
  const t = DateTime.fromISO("2026-08-22T15:00:00", { zone: "Europe/Moscow" });
  const start = weekStartMoscow(t);
  expect(start.toISO()).toBe("2026-08-17T00:00:00.000+03:00");
});
