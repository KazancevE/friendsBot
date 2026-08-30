import { expect, test } from "vitest";
import {
  leaderboardRowClasses,
  myRowInTop,
  prizePlaceClass,
  renderMyStandingHtml,
} from "../../miniapp/src/hub-leaderboard.ts";

test("prizePlaceClass highlights top-N places", () => {
  expect(prizePlaceClass(1, 5)).toBe("leaderboard-row--prize-1");
  expect(prizePlaceClass(3, 5)).toBe("leaderboard-row--prize-3");
  expect(prizePlaceClass(5, 5)).toBe("leaderboard-row--prize");
  expect(prizePlaceClass(6, 5)).toBe("");
});

test("leaderboardRowClasses marks current user row", () => {
  expect(
    leaderboardRowClasses(
      { place: 4, userId: "u1", points: 100 },
      { staffViewer: false, myUserId: "u1", winnersCount: 3 },
    ),
  ).toContain("leaderboard-row--me");
});

test("renderMyStandingHtml shows standing when user is outside top list", () => {
  const html = renderMyStandingHtml(12, 400, false);
  expect(html).toContain("#12");
  expect(html).toContain("400 очков");
});

test("myRowInTop detects user in visible top", () => {
  expect(
    myRowInTop(
      [{ place: 1, userId: "u1", points: 500 }],
      "u1",
    ),
  ).toBe(true);
});
