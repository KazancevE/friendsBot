import { Hono } from "hono";
import { redeemCoupon } from "../domain/coupons.ts";
import { DomainError } from "../domain/errors.ts";
import { applyCheck, manualAdjust, redeemBonuses } from "../domain/ledger.ts";
import { normalizePhone } from "../domain/phone.ts";
import type { Role, UserRecord } from "../domain/types.ts";
import { openOrExtendVisit } from "../domain/visits.ts";
import type { Store } from "../store/types.ts";
import { resolveActor } from "./auth.ts";

type CreateCashierRoutesParameters = {
  readonly store: Store;
  readonly botToken: string;
};

type GuestQuery = { kind: "phone"; phone: string } | { kind: "qr"; qrToken: string };

const isStaffRole = (role: Role) => {
  return role === "master" || role === "admin";
};

const isJsonObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const readJsonBody = async (c: { req: { json: () => Promise<unknown> } }) => {
  try {
    const parsed: unknown = await c.req.json();
    if (!isJsonObject(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
};

const readInitData = (headerValue: string | undefined, body: Record<string, unknown>) => {
  if (headerValue !== undefined && headerValue.length > 0) {
    return headerValue;
  }
  if (typeof body.initData === "string" && body.initData.length > 0) {
    return body.initData;
  }
  throw new DomainError("bad_init_data", "Нет initData");
};

const requireRegistered = async (store: Store, initData: string, botToken: string) => {
  const { user } = await resolveActor(store, initData, botToken);
  if (user === undefined) {
    throw new DomainError("not_found", "Пользователь не найден");
  }
  return user;
};

const parseGuestQuery = (body: Record<string, unknown>): GuestQuery => {
  if (typeof body.phone === "string" && body.phone.length > 0) {
    return { kind: "phone", phone: body.phone };
  }
  if (typeof body.qrToken === "string" && body.qrToken.length > 0) {
    return { kind: "qr", qrToken: body.qrToken };
  }
  throw new DomainError("bad_request", "Нужен phone или qrToken");
};

const findGuest = async (store: Store, query: GuestQuery) => {
  switch (query.kind) {
    case "phone": {
      const guest = await store.findUserByPhone(normalizePhone(query.phone));
      if (guest === null) {
        throw new DomainError("not_found", "проверьте номер");
      }
      return guest;
    }
    case "qr": {
      const guest = await store.findUserByQrToken(query.qrToken);
      if (guest === null) {
        throw new DomainError("not_found", "Гость не найден");
      }
      return guest;
    }
    default: {
      const _exhaustive: never = query;
      throw new DomainError("bad_request", `Unhandled query: ${_exhaustive}`);
    }
  }
};

const guestCard = async (store: Store, guest: UserRecord) => {
  const visit = await store.getActiveVisit(guest.id, new Date());
  const coupons = await store.listActiveCoupons(guest.id);
  return {
    id: guest.id,
    firstName: guest.firstName,
    lastName: guest.lastName,
    phone: guest.phone,
    balance: guest.balance,
    qrToken: guest.qrToken,
    visitActive: visit !== null,
    coupons: coupons.map((coupon) => ({ id: coupon.id, title: coupon.title })),
  };
};

const requireNumber = (value: unknown, code: string, message: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DomainError(code, message);
  }
  return value;
};

export const createCashierRoutes = ({ store, botToken }: CreateCashierRoutesParameters) => {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof DomainError) {
      return c.json({ code: err.code, message: err.message }, 400);
    }
    const message = err instanceof Error ? err.message : "Ошибка";
    return c.json({ code: "internal", message }, 500);
  });

  const actorFromRequest = async (c: { req: { header: (name: string) => string | undefined; json: () => Promise<unknown> } }) => {
    const body = await readJsonBody(c);
    const initData = readInitData(c.req.header("X-Telegram-Init-Data"), body);
    const user = await requireRegistered(store, initData, botToken);
    return { body, user };
  };

  const staffFromRequest = async (c: { req: { header: (name: string) => string | undefined; json: () => Promise<unknown> } }) => {
    const loaded = await actorFromRequest(c);
    if (!isStaffRole(loaded.user.role)) {
      return { ok: false as const, loaded };
    }
    return { ok: true as const, loaded };
  };

  app.post("/api/me", async (c) => {
    const { user } = await actorFromRequest(c);
    const visit = await store.getActiveVisit(user.id, new Date());
    return c.json({
      role: user.role,
      balance: user.balance,
      visitActive: visit !== null,
    });
  });

  app.post("/api/cashier/lookup", async (c) => {
    const staff = await staffFromRequest(c);
    if (!staff.ok) {
      return c.json({ code: "forbidden", message: "Недостаточно прав" }, 403);
    }
    const guest = await findGuest(store, parseGuestQuery(staff.loaded.body));
    return c.json(await guestCard(store, guest));
  });

  app.post("/api/cashier/check", async (c) => {
    const staff = await staffFromRequest(c);
    if (!staff.ok) {
      return c.json({ code: "forbidden", message: "Недостаточно прав" }, 403);
    }
    const guest = await findGuest(store, parseGuestQuery(staff.loaded.body));
    const checkRubles = requireNumber(
      staff.loaded.body.checkRubles,
      "bad_amount",
      "Сумма чека должна быть > 0",
    );
    const result = await applyCheck(store, {
      guestId: guest.id,
      actorId: staff.loaded.user.id,
      checkRubles,
      now: new Date(),
    });
    return c.json({ balance: result.user.balance, bonus: result.bonus });
  });

  app.post("/api/cashier/redeem", async (c) => {
    const staff = await staffFromRequest(c);
    if (!staff.ok) {
      return c.json({ code: "forbidden", message: "Недостаточно прав" }, 403);
    }
    const guest = await findGuest(store, parseGuestQuery(staff.loaded.body));
    const amount = requireNumber(staff.loaded.body.amount, "bad_amount", "Сумма должна быть > 0");
    const user = await redeemBonuses(store, {
      guestId: guest.id,
      actorId: staff.loaded.user.id,
      amount,
    });
    return c.json({ balance: user.balance });
  });

  app.post("/api/cashier/manual", async (c) => {
    const staff = await staffFromRequest(c);
    if (!staff.ok) {
      return c.json({ code: "forbidden", message: "Недостаточно прав" }, 403);
    }
    const guest = await findGuest(store, parseGuestQuery(staff.loaded.body));
    const delta = requireNumber(staff.loaded.body.delta, "bad_amount", "Дельта не ноль");
    const comment = staff.loaded.body.comment;
    if (typeof comment !== "string") {
      throw new DomainError("bad_comment", "Нужен комментарий");
    }
    const user = await manualAdjust(store, {
      guestId: guest.id,
      actorId: staff.loaded.user.id,
      delta,
      comment,
    });
    return c.json({ balance: user.balance });
  });

  app.post("/api/cashier/visit", async (c) => {
    const staff = await staffFromRequest(c);
    if (!staff.ok) {
      return c.json({ code: "forbidden", message: "Недостаточно прав" }, 403);
    }
    const guest = await findGuest(store, parseGuestQuery(staff.loaded.body));
    const settings = await store.getSettings();
    const visit = await openOrExtendVisit(store, {
      userId: guest.id,
      openedBy: staff.loaded.user.id,
      hours: settings.visitHours,
      now: new Date(),
    });
    return c.json({ endsAt: visit.endsAt.toISOString(), visitActive: true });
  });

  app.post("/api/cashier/coupon/redeem", async (c) => {
    const staff = await staffFromRequest(c);
    if (!staff.ok) {
      return c.json({ code: "forbidden", message: "Недостаточно прав" }, 403);
    }
    const couponId = staff.loaded.body.couponId;
    if (typeof couponId !== "string" || couponId.length === 0) {
      throw new DomainError("bad_request", "Нужен couponId");
    }
    const coupon = await redeemCoupon(store, {
      couponId,
      actorId: staff.loaded.user.id,
      now: new Date(),
    });
    return c.json({ id: coupon.id, status: coupon.status });
  });

  return app;
};
