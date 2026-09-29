import { expect, test } from "vitest";
import { venue } from "../../src/venue/salon.ts";

test("BRO config lists four Barnaul branches and one price list", () => {
  expect(venue.city).toBe("Барнаул");
  expect(venue.branches.map((branch) => branch.slug)).toEqual([
    "lenina126",
    "brestskaya18",
    "lazurnaya19",
    "semyonova14",
  ]);
  expect(venue.services).toHaveLength(15);
  expect(venue.loyalty.cashbackPercent).toBe(5);
  expect(venue.loyalty.referralReferrer).toBe(300);
  expect(venue.loyalty.referralReferee).toBe(300);
  expect(venue.loyalty.haircutNudgeWeeks).toBe(4);
  const royal = venue.services.filter((service) => service.name.toLowerCase().includes("королев"));
  expect(royal).toHaveLength(2);
  for (const service of royal) {
    expect(service.branches).not.toContain("lazurnaya19");
  }
  for (const service of venue.services) {
    expect(service.durationMinutes).toBeGreaterThanOrEqual(30);
    expect(service.priceRub).toBeGreaterThan(0);
  }
  for (const service of venue.services.filter((item) => item.category === "Комплексы")) {
    expect(service.durationMinutes).toBeGreaterThan(60);
  }
  for (const branch of venue.branches) {
    const masters = venue.masters.filter((master) => master.branch === branch.slug);
    expect(masters.length).toBeGreaterThanOrEqual(2);
    expect(masters.length).toBeLessThanOrEqual(3);
    expect(masters.every((master) => ["Мастер", "Топ-мастер", "Амбассадор"].includes(master.name))).toBe(true);
  }
  expect(venue.examplePromo).toContain("−20%");
  expect(venue.copy.greeting).toContain("бро");
});
