import { expect, test } from "vitest";
import { runLoggedJob } from "../../src/jobs/run-logged-job.ts";

test("runLoggedJob swallows errors and reports them", async () => {
  const seen: string[] = [];
  await runLoggedJob({
    name: "demo",
    work: async () => {
      throw new Error("boom");
    },
    onError: async (error) => {
      seen.push(error.message);
    },
  });
  expect(seen).toEqual(["boom"]);
});

test("runLoggedJob completes successful work", async () => {
  let ran = false;
  await runLoggedJob({
    name: "ok",
    work: async () => {
      ran = true;
    },
  });
  expect(ran).toBe(true);
});
