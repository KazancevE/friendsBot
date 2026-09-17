import type { StaffActionKind } from "../domain/types.ts";

export const toStaffActionKind = (value: string): StaffActionKind => {
  if (
    value === "check" ||
    value === "redeem" ||
    value === "manual_adjust" ||
    value === "visit_open" ||
    value === "visit_extend" ||
    value === "visit_close" ||
    value === "coupon_redeem" ||
    value === "guest_search" ||
    value === "booking_table_assign" ||
    value === "booking_table_move" ||
    value === "booking_table_swap" ||
    value === "guest_message"
  ) {
    return value;
  }
  throw new Error(`unknown staff action: ${value}`);
};
