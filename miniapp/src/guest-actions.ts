import type { GuestCard } from "./api.ts";
import {
  applyCheck,
  extendVisit,
  guestQueryBody,
  manualAdjust,
  openVisit,
  redeemBonuses,
  redeemCoupon,
} from "./api.ts";

export const guestName = (card: Pick<GuestCard, "firstName" | "lastName">) => {
  const name = `${card.firstName ?? ""} ${card.lastName ?? ""}`.trim();
  if (name === "") {
    return "—";
  }
  return name;
};

export const guestCardSummaryHtml = (card: GuestCard) => {
  const coupons =
    card.coupons.length > 0 ? card.coupons.map((coupon) => coupon.title).join(", ") : "нет";
  const lotLines =
    card.lotSummaries?.map((lot) => {
      const label = lot.category === "gift" ? "подарочных" : "чековых";
      return `<p>${lot.remaining} ${label} (до ${new Date(lot.expiresAt).toLocaleDateString("ru-RU")})</p>`;
    }) ?? [];
  return [
    `<p><strong>${guestName(card)}</strong></p>`,
    `<p>Телефон: ${card.phone ?? "—"}</p>`,
    `<p>Баланс: ${card.balance}</p>`,
    ...lotLines,
    `<p>Визит: ${card.visitActive ? "да" : "нет"}</p>`,
    card.totalVisits !== undefined ? `<p>Визитов: ${card.totalVisits}</p>` : "",
    card.birthdayWeek ? `<p>🎂 Неделя ДР</p>` : "",
    card.staffNote ? `<p>Заметка: ${card.staffNote}</p>` : "",
    `<p>Купоны: ${coupons}</p>`,
  ]
    .filter((line) => line.length > 0)
    .join("");
};

export const queryFromCard = guestQueryBody;

export const guestActionsMarkup = () => {
  return `
    <section class="panel guest-actions-card" data-guest-card></section>
    <section class="panel guest-actions-forms" data-guest-actions>
      <form data-check>
        <label>
          Сумма чека, ₽
          <input name="checkRubles" type="number" min="1" step="1" required />
        </label>
        <button type="submit">Начислить</button>
      </form>
      <form data-redeem>
        <label>
          Списать бонусов
          <input name="amount" type="number" min="1" step="1" required />
        </label>
        <button type="submit">Списать</button>
      </form>
      <form data-manual>
        <label>
          Изменить баланс
          <input name="delta" type="number" step="1" required />
        </label>
        <label>
          Комментарий
          <input name="comment" autocomplete="off" required />
        </label>
        <button type="submit">Ручная правка</button>
      </form>
      <form data-coupon hidden>
        <label>
          Купон
          <select name="couponId" data-coupon-select required></select>
        </label>
        <button type="submit">Погасить купон</button>
      </form>
      <button type="button" data-visit>Открыть визит</button>
      <button type="button" data-extend hidden>Продлить визит</button>
    </section>
    <p data-guest-status class="status"></p>
  `;
};

const renderGuestCard = (root: HTMLElement, card: GuestCard) => {
  const cardEl = root.querySelector("[data-guest-card]");
  if (!(cardEl instanceof HTMLElement)) {
    return;
  }
  cardEl.innerHTML = guestCardSummaryHtml(card);

  const couponSelect = root.querySelector("[data-coupon-select]");
  const couponForm = root.querySelector("[data-coupon]");
  if (couponSelect instanceof HTMLSelectElement) {
    couponSelect.replaceChildren();
    for (const coupon of card.coupons) {
      const option = document.createElement("option");
      option.value = coupon.id;
      option.textContent = coupon.title;
      couponSelect.append(option);
    }
  }
  if (couponForm instanceof HTMLElement) {
    couponForm.hidden = card.coupons.length === 0;
  }
  const extendButton = root.querySelector("[data-extend]");
  if (extendButton instanceof HTMLButtonElement) {
    extendButton.hidden = !card.visitActive;
  }
};

type BindGuestActionsParameters = {
  readonly root: HTMLElement;
  readonly getGuest: () => GuestCard | undefined;
  readonly setGuest: (guest: GuestCard) => void;
  readonly onChanged?: () => void;
};

export const bindGuestActions = ({
  root,
  getGuest,
  setGuest,
  onChanged,
}: BindGuestActionsParameters) => {
  const setStatus = (message: string, isError = false) => {
    const status = root.querySelector("[data-guest-status]");
    if (!(status instanceof HTMLElement)) {
      return;
    }
    status.textContent = message;
    status.classList.toggle("error", isError);
  };

  const updateGuest = (guest: GuestCard, message: string) => {
    setGuest(guest);
    renderGuestCard(root, guest);
    setStatus(message);
    onChanged?.();
  };

  const requireGuest = () => {
    const guest = getGuest();
    if (guest === undefined) {
      setStatus("Гость не выбран", true);
      return undefined;
    }
    return guest;
  };

  const checkForm = root.querySelector("[data-check]");
  if (checkForm instanceof HTMLFormElement) {
    checkForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const guest = requireGuest();
      if (guest === undefined) {
        return;
      }
      const data = new FormData(checkForm);
      const checkRubles = Number(data.get("checkRubles"));
      void (async () => {
        const result = await applyCheck({ ...queryFromCard(guest), checkRubles });
        if (result.kind === "error") {
          setStatus(result.message, true);
          return;
        }
        updateGuest(
          { ...guest, balance: result.data.balance, visitActive: true },
          `Начислено ${result.data.bonus}. Баланс: ${result.data.balance}`,
        );
      })();
    });
  }

  const redeemForm = root.querySelector("[data-redeem]");
  if (redeemForm instanceof HTMLFormElement) {
    redeemForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const guest = requireGuest();
      if (guest === undefined) {
        return;
      }
      const data = new FormData(redeemForm);
      const amount = Number(data.get("amount"));
      void (async () => {
        const result = await redeemBonuses({ ...queryFromCard(guest), amount });
        if (result.kind === "error") {
          setStatus(result.message, true);
          return;
        }
        updateGuest({ ...guest, balance: result.data.balance }, `Списано. Баланс: ${result.data.balance}`);
      })();
    });
  }

  const manualForm = root.querySelector("[data-manual]");
  if (manualForm instanceof HTMLFormElement) {
    manualForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const guest = requireGuest();
      if (guest === undefined) {
        return;
      }
      const data = new FormData(manualForm);
      const delta = Number(data.get("delta"));
      const comment = String(data.get("comment") ?? "");
      void (async () => {
        const result = await manualAdjust({ ...queryFromCard(guest), delta, comment });
        if (result.kind === "error") {
          setStatus(result.message, true);
          return;
        }
        updateGuest({ ...guest, balance: result.data.balance }, `Баланс: ${result.data.balance}`);
      })();
    });
  }

  const couponForm = root.querySelector("[data-coupon]");
  if (couponForm instanceof HTMLFormElement) {
    couponForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const guest = requireGuest();
      if (guest === undefined) {
        return;
      }
      const data = new FormData(couponForm);
      const couponId = String(data.get("couponId") ?? "");
      if (couponId.length === 0) {
        setStatus("Выберите купон", true);
        return;
      }
      void (async () => {
        const result = await redeemCoupon({ couponId });
        if (result.kind === "error") {
          setStatus(result.message, true);
          return;
        }
        updateGuest(
          {
            ...guest,
            coupons: guest.coupons.filter((coupon) => coupon.id !== couponId),
          },
          "Купон погашен",
        );
      })();
    });
  }

  const visitButton = root.querySelector("[data-visit]");
  if (visitButton instanceof HTMLButtonElement) {
    visitButton.addEventListener("click", () => {
      const guest = requireGuest();
      if (guest === undefined) {
        return;
      }
      void (async () => {
        const result = await openVisit(queryFromCard(guest));
        if (result.kind === "error") {
          setStatus(result.message, true);
          return;
        }
        updateGuest({ ...guest, visitActive: true }, "Визит открыт");
      })();
    });
  }

  const extendButton = root.querySelector("[data-extend]");
  if (extendButton instanceof HTMLButtonElement) {
    extendButton.addEventListener("click", () => {
      const guest = requireGuest();
      if (guest === undefined) {
        return;
      }
      void (async () => {
        const result = await extendVisit(queryFromCard(guest));
        if (result.kind === "error") {
          setStatus(result.message, true);
          return;
        }
        updateGuest(result.data.card, "Визит продлён");
      })();
    });
  }

  return {
    showGuest: (card: GuestCard) => {
      renderGuestCard(root, card);
      setStatus("");
    },
    setStatus,
  };
};
