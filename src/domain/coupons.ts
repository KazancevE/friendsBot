import { DomainError } from "./errors.ts";
import type { Store } from "../store/types.ts";

export async function redeemCoupon(
  store: Store,
  input: { readonly couponId: string; readonly actorId: string; readonly now: Date },
) {
  return store.withTransaction(async (tx) => {
    const actor = await tx.findUserById(input.actorId);
    if (!actor || (actor.role !== "master" && actor.role !== "admin")) {
      throw new DomainError("forbidden", "Недостаточно прав");
    }
    const coupon = await tx.findCoupon(input.couponId);
    if (!coupon) throw new DomainError("not_found", "Купон не найден");
    if (coupon.status === "redeemed") throw new DomainError("coupon_used", "Купон уже погашен");
    const redeemed = await tx.redeemCoupon(coupon.id, actor.id, input.now);
    await tx.addLedger({
      userId: coupon.userId,
      type: "coupon_redeem",
      amount: 0,
      actorId: actor.id,
      comment: `Купон: ${coupon.title}`,
      checkAmount: null,
    });
    return redeemed;
  });
}
