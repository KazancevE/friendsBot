import { expect, test } from "vitest";
import type { StaffActionKind } from "../../src/domain/types.ts";
import { toStaffActionKind } from "../../src/store/staff-action-kind.ts";

const STAFF_ACTION_KIND_BY_KIND: { readonly [K in StaffActionKind]: K } = {
  check: "check",
  redeem: "redeem",
  manual_adjust: "manual_adjust",
  visit_open: "visit_open",
  visit_extend: "visit_extend",
  visit_close: "visit_close",
  coupon_redeem: "coupon_redeem",
  guest_search: "guest_search",
  booking_table_assign: "booking_table_assign",
  booking_table_move: "booking_table_move",
  booking_table_swap: "booking_table_swap",
  guest_message: "guest_message",
};

test("toStaffActionKind maps every staff action including guest_message", () => {
  for (const kind of Object.values(STAFF_ACTION_KIND_BY_KIND)) {
    expect(toStaffActionKind(kind)).toBe(kind);
  }
});

test("toStaffActionKind rejects unknown actions", () => {
  expect(() => toStaffActionKind("not_a_real_action")).toThrow(/unknown staff action/);
});
