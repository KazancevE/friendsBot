import type { GuestCard } from "./api.ts";
import {
  applyCheck,
  lookupGuest,
  manualAdjust,
  openVisit,
  redeemBonuses,
  redeemCoupon,
} from "./api.ts";
import { canScanCamera, canScanQr, prefersTelegramScanner, scanQr } from "./qr-scan.ts";

type GuestQuery = { readonly phone: string } | { readonly qrToken: string };

const parseQuery = (raw: string): GuestQuery => {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10) {
    return { phone: trimmed };
  }
  return { qrToken: trimmed };
};

const guestName = (card: GuestCard) => {
  const name = `${card.firstName ?? ""} ${card.lastName ?? ""}`.trim();
  if (name === "") {
    return "—";
  }
  return name;
};

const queryFromCard = (card: GuestCard): GuestQuery => {
  if (card.phone !== null && card.phone.length > 0) {
    return { phone: card.phone };
  }
  return { qrToken: card.qrToken };
};

const setStatus = (root: HTMLElement, message: string, isError = false) => {
  const status = root.querySelector("[data-status]");
  if (!(status instanceof HTMLElement)) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("error", isError);
};

const renderCard = (root: HTMLElement, card: GuestCard) => {
  const cardEl = root.querySelector("[data-card]");
  if (!(cardEl instanceof HTMLElement)) {
    return;
  }
  const coupons = card.coupons.length > 0 ? card.coupons.map((coupon) => coupon.title).join(", ") : "нет";
  cardEl.hidden = false;
  cardEl.innerHTML = [
    `<p><strong>${guestName(card)}</strong></p>`,
    `<p>Телефон: ${card.phone ?? "—"}</p>`,
    `<p>Баланс: ${card.balance}</p>`,
    `<p>Визит: ${card.visitActive ? "да" : "нет"}</p>`,
    `<p>Купоны: ${coupons}</p>`,
  ].join("");
  const actions = root.querySelector("[data-actions]");
  if (actions instanceof HTMLElement) {
    actions.hidden = false;
  }
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
};

export const renderCashier = (root: HTMLElement) => {
  const useCamera = canScanQr() && canScanCamera() && !prefersTelegramScanner();
  root.innerHTML = `
    <header>
      <h1>Касса</h1>
      <p class="muted">Сканируйте QR гостя или введите телефон / код</p>
    </header>
    <section class="panel">
      ${useCamera ? `<video data-preview playsinline muted hidden></video>` : ""}
      ${canScanQr() ? `<button type="button" data-scan>Сканировать</button>` : ""}
      <form data-lookup>
        <label>
          Телефон или код QR
          <input name="query" autocomplete="off" inputmode="text" required />
        </label>
        <button type="submit">Найти</button>
      </form>
    </section>
    <section class="panel" data-card hidden></section>
    <section class="panel" data-actions hidden>
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
      <form data-coupon>
        <label>
          Купон
          <select name="couponId" data-coupon-select required></select>
        </label>
        <button type="submit">Погасить купон</button>
      </form>
      <button type="button" data-visit>Открыть визит</button>
    </section>
    <p data-status class="status"></p>
  `;

  let current: GuestCard | undefined;
  let scanStop: (() => void) | undefined;

  const lookup = async (query: GuestQuery) => {
    setStatus(root, "Ищем…");
    const result = await lookupGuest(query);
    if (result.kind === "error") {
      setStatus(root, result.message, true);
      return;
    }
    current = result.data;
    renderCard(root, result.data);
    setStatus(root, "Гость найден");
  };

  const lookupForm = root.querySelector("[data-lookup]");
  if (lookupForm instanceof HTMLFormElement) {
    lookupForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(lookupForm);
      const raw = String(data.get("query") ?? "");
      void lookup(parseQuery(raw));
    });
  }

  const scanButton = root.querySelector("[data-scan]");
  const resetScanButton = () => {
    if (scanButton instanceof HTMLButtonElement) {
      scanButton.textContent = "Сканировать";
    }
  };

  if (scanButton instanceof HTMLButtonElement) {
    scanButton.addEventListener("click", () => {
      if (scanStop !== undefined) {
        scanStop();
        scanStop = undefined;
        resetScanButton();
        return;
      }
      void startScan();
    });
  }

  const startScan = async () => {
    const video = root.querySelector("[data-preview]");
    const stop = await scanQr({
      hint: "Наведите на QR гостя",
      video: video instanceof HTMLVideoElement ? video : undefined,
      onCode: async (value) => {
        scanStop = undefined;
        resetScanButton();
        await lookup(parseQuery(value));
      },
      onError: (message) => {
        scanStop = undefined;
        resetScanButton();
        setStatus(root, `${message}, введите код вручную`, true);
      },
    });
    if (stop !== undefined) {
      scanStop = stop;
      if (scanButton instanceof HTMLButtonElement) {
        scanButton.textContent = "Стоп";
      }
    }
  };

  const checkForm = root.querySelector("[data-check]");
  if (checkForm instanceof HTMLFormElement) {
    checkForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const guest = current;
      if (guest === undefined) {
        setStatus(root, "Сначала найдите гостя", true);
        return;
      }
      const data = new FormData(checkForm);
      const checkRubles = Number(data.get("checkRubles"));
      void (async () => {
        const result = await applyCheck({ ...queryFromCard(guest), checkRubles });
        if (result.kind === "error") {
          setStatus(root, result.message, true);
          return;
        }
        current = { ...guest, balance: result.data.balance, visitActive: true };
        renderCard(root, current);
        setStatus(root, `Начислено ${result.data.bonus}. Баланс: ${result.data.balance}`);
      })();
    });
  }

  const redeemForm = root.querySelector("[data-redeem]");
  if (redeemForm instanceof HTMLFormElement) {
    redeemForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const guest = current;
      if (guest === undefined) {
        setStatus(root, "Сначала найдите гостя", true);
        return;
      }
      const data = new FormData(redeemForm);
      const amount = Number(data.get("amount"));
      void (async () => {
        const result = await redeemBonuses({ ...queryFromCard(guest), amount });
        if (result.kind === "error") {
          setStatus(root, result.message, true);
          return;
        }
        current = { ...guest, balance: result.data.balance };
        renderCard(root, current);
        setStatus(root, `Списано. Баланс: ${result.data.balance}`);
      })();
    });
  }

  const manualForm = root.querySelector("[data-manual]");
  if (manualForm instanceof HTMLFormElement) {
    manualForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const guest = current;
      if (guest === undefined) {
        setStatus(root, "Сначала найдите гостя", true);
        return;
      }
      const data = new FormData(manualForm);
      const delta = Number(data.get("delta"));
      const comment = String(data.get("comment") ?? "");
      void (async () => {
        const result = await manualAdjust({ ...queryFromCard(guest), delta, comment });
        if (result.kind === "error") {
          setStatus(root, result.message, true);
          return;
        }
        current = { ...guest, balance: result.data.balance };
        renderCard(root, current);
        setStatus(root, `Баланс: ${result.data.balance}`);
      })();
    });
  }

  const couponForm = root.querySelector("[data-coupon]");
  if (couponForm instanceof HTMLFormElement) {
    couponForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const guest = current;
      if (guest === undefined) {
        setStatus(root, "Сначала найдите гостя", true);
        return;
      }
      const data = new FormData(couponForm);
      const couponId = String(data.get("couponId") ?? "");
      if (couponId.length === 0) {
        setStatus(root, "Выберите купон", true);
        return;
      }
      void (async () => {
        const result = await redeemCoupon({ couponId });
        if (result.kind === "error") {
          setStatus(root, result.message, true);
          return;
        }
        current = {
          ...guest,
          coupons: guest.coupons.filter((coupon) => coupon.id !== couponId),
        };
        renderCard(root, current);
        setStatus(root, "Купон погашен");
      })();
    });
  }

  const visitButton = root.querySelector("[data-visit]");
  if (visitButton instanceof HTMLButtonElement) {
    visitButton.addEventListener("click", () => {
      const guest = current;
      if (guest === undefined) {
        setStatus(root, "Сначала найдите гостя", true);
        return;
      }
      void (async () => {
        const result = await openVisit(queryFromCard(guest));
        if (result.kind === "error") {
          setStatus(root, result.message, true);
          return;
        }
        current = { ...guest, visitActive: true };
        renderCard(root, current);
        setStatus(root, "Визит открыт");
      })();
    });
  }
};
