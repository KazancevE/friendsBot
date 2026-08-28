import { DateTime } from "luxon";
import { expect, test } from "vitest";
import { formatWeekCountdown } from "../../miniapp/src/hub-week.ts";
import { MOSCOW } from "../../src/domain/week.ts";

test("formatWeekCountdown shows days and hours until next Monday MSK", () => {
  const saturday = DateTime.fromObject(
    { year: 2026, month: 8, day: 29, hour: 12 },
    { zone: MOSCOW },
  ).toJSDate();
  expect(formatWeekCountdown(saturday)).toBe("1 д 12 ч");
});

test("formatWeekCountdown shows hours when less than a day remains", () => {
  const sundayEvening = DateTime.fromObject(
    { year: 2026, month: 8, day: 30, hour: 20 },
    { zone: MOSCOW },
  ).toJSDate();
  expect(formatWeekCountdown(sundayEvening)).toBe("4 ч");
});
