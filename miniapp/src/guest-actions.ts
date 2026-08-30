import type { GuestCard } from "./api.ts";
import {
  applyCheck,
  closeVisit,
  extendVisit,
  guestQueryBody,
  manualAdjust,
  openVisit,
  redeemBonuses,
  redeemCoupon,
} from "./api.ts";
import { hapticImpact } from "./telegram.ts";

export const guestName = (card: Pick<GuestCard, "firstName" | "lastName">) => {
  const name = `${card.firstName ?? ""} ${card.lastName ?? ""}`.trim();
  if (name === "") {
    return "—";
  }
  return name;
};

export const guestCardSummaryHtml = (card: GuestCard) => {
  const visitLabel = card.visitActive
    ? card.visitEndsAt !== undefined && card.visitEndsAt !== null
      ? `🟢 до ${new Date(card.visitEndsAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
      : "🟢 активен"
    : "нет";
  const coupons =
    card.coupons.length > 0 ? card.coupons.map((coupon) => coupon.title).join(", ") : "нет";
  const lotLines =
    card.lotSummaries?.map((lot) => {
      const label = lot.category === "gift" ? "подарочных" : "чековых";
      return `<p class="guest-card-meta">${lot.remaining} ${label} (до ${new Date(lot.expiresAt).toLocaleDateString("ru-RU")})</p>`;
    }) ?? [];
  return [
    `<p class="guest-card-name">${guestName(card)}</p>`,
    `<p class="guest-card-meta">📞 ${card.phone ?? "—"}</p>`,
    `<p class="guest-card-balance">💰 ${card.balance} бонусов</p>`,
    ...lotLines,
    `<p class="guest-card-meta">Визит: ${visitLabel}</p>`,
    card.totalVisits !== undefined ? `<p class="guest-card-meta">Визитов: ${card.totalVisits}</p>` : "",
    card.birthdayWeek ? `<p class="guest-card-meta">🎂 Неделя ДР</p>` : "",
    card.staffNote ? `<p class="guest-card-meta">📝 ${card.staffNote}</p>` : "",
    `<p class="guest-card-meta">Купоны: ${coupons}</p>`,
  ]
    .filter((line) => line.length > 0)
    .join("");
};

export const queryFromCard = guestQueryBody;

export const guestActionsMarkup = () => {
  return `
    <section class="panel guest-actions-card" data-guest-card></section>
    <section class="panel guest-actions-shell" data-guest-actions>
      <div class="guest-action-tabs" role="tablist" aria-label="Операции">
        <button type="button" class="guest-action-tab guest-action-tab--active" data-action-tab="check" role="tab">Чек</button>
        <button type="button" class="guest-action-tab" data-action-tab="redeem" role="tab">Списать</button>
        <button type="button" class="guest-action-tab" data-action-tab="manual" role="tab">Ручная</button>
        <button type="button" class="guest-action-tab" data-action-tab="visit" role="tab">Визит</button>
      </div>
      <div class="guest-action-panels">
        <form data-check class="guest-action-panel guest-action-panel--active" data-action-panel="check">
          <label>
            Сумма чека, ₽
            <input name="checkRubles" type="number" min="1" step="1" required />
          </label>
          <button type="submit">Начислить по чеку</button>
        </form>
        <form data-redeem class="guest-action-panel" data-action-panel="redeem" hidden>
          <label>
            Списать бонусов
            <input name="amount" type="number" min="1" step="1" required />
          </label>
          <button type="submit">Списать</button>
        </form>
        <form data-manual class="guest-action-panel" data-action-panel="manual" hidden>
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
        <div class="guest-action-panel" data-action-panel="visit" hidden>
          <form data-coupon hidden>
            <label>
              Купон
              <select name="couponId" data-coupon-select required></select>
            </label>
            <button type="submit">Погасить купон</button>
          </form>
          <button type="button" data-visit>Открыть визит</button>
          <button type="button" data-extend hidden>Продлить визит</button>
          <button type="button" data-close-visit hidden>Закончить визит</button>
        </div>
      </div>
    </section>
    <p data-guest-status class="status"></p>
    <div class="toast-host" data-toast-host hidden></div>
  `;
};

const showToast = (root: HTMLElement, message: string, isError = false) => {
  const host = root.querySelector("[data-toast-host]");
  if (!(host instanceof HTMLElement)) {
    return;
  }
  host.hidden = false;
  host.className = `toast-host${isError ? " toast-host--error" : ""}`;
  host.textContent = message;
  window.setTimeout(() => {
    host.hidden = true;
  }, 2600);
};

const bindActionTabs = (root: HTMLElement) => {
  const tabs = root.querySelectorAll("[data-action-tab]");
  const panels = root.querySelectorAll("[data-action-panel]");
  tabs.forEach((tab) => {
    if (!(tab instanceof HTMLButtonElement)) {
      return;
    }
    tab.addEventListener("click", () => {
      const id = tab.dataset.actionTab;
      tabs.forEach((element) => {
        if (element instanceof HTMLButtonElement) {
          element.classList.toggle("guest-action-tab--active", element === tab);
        }
      });
      panels.forEach((panel) => {
        if (panel instanceof HTMLElement) {
          const active = panel.dataset.actionPanel === id;
          panel.hidden = !active;
          panel.classList.toggle("guest-action-panel--active", active);
        }
      });
    });
  });
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
  const closeButton = root.querySelector("[data-close-visit]");
  if (closeButton instanceof HTMLButtonElement) {
    closeButton.hidden = !card.visitActive;
  }
  const visitButton = root.querySelector("[data-visit]");
  if (visitButton instanceof HTMLButtonElement) {
    visitButton.hidden = card.visitActive === true;
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
  bindActionTabs(root);

  const setStatus = (message: string, isError = false) => {
    const status = root.querySelector("[data-guest-status]");
    if (!(status instanceof HTMLElement)) {
      return;
    }
    status.textContent = message;
    status.classList.toggle("error", isError);
    showToast(root, message, isError);
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
        hapticImpact("medium");
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
        hapticImpact("light");
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
        hapticImpact("light");
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
        hapticImpact("light");
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
        hapticImpact("light");
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
        hapticImpact("light");
        updateGuest(result.data.card, "Визит продлён");
      })();
    });
  }

  const closeVisitButton = root.querySelector("[data-close-visit]");
  if (closeVisitButton instanceof HTMLButtonElement) {
    closeVisitButton.addEventListener("click", () => {
      const guest = requireGuest();
      if (guest === undefined) {
        return;
      }
      void (async () => {
        const result = await closeVisit(queryFromCard(guest));
        if (result.kind === "error") {
          setStatus(result.message, true);
          return;
        }
        hapticImpact("light");
        updateGuest(result.data.card, "Визит завершён");
      })();
    });
  }

  return {
    showGuest: (card: GuestCard) => {
      renderGuestCard(root, card);
      const status = root.querySelector("[data-guest-status]");
      if (status instanceof HTMLElement) {
        status.textContent = "";
      }
    },
    setStatus,
  };
};
