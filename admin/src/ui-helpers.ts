import QRCode from "qrcode";

export const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const formatName = (first: string | null, last: string | null) => {
  return `${first ?? ""} ${last ?? ""}`.trim() || "—";
};

export const formatDateTime = (value: string | null | undefined) => {
  if (value === null || value === undefined) {
    return "—";
  }
  return new Date(value).toLocaleString("ru-RU");
};

export const SETTING_HINTS: Record<string, string> = {
  percent: "Сколько процентов от суммы чека начисляется гостю в бонусах.",
  registrationBonus: "Бонусы, которые гость получает сразу после регистрации.",
  birthdayBonus: "Бонус, начисляемый в неделю дня рождения (раз в год).",
  visitHours: "Длительность визита в часах — гость может играть, пока визит активен.",
  referralBonusReferrer: "Бонусы пригласившему, когда друг активирует рефералку первым визитом.",
  referralBonusReferee: "Бонусы новому гостю при активации рефералки.",
  maxSessionsPerHour: "Античит: максимум игровых сессий с одного аккаунта в час.",
  bookingHoursStart: "С какого времени можно бронировать (например 18:00).",
  bookingHoursEnd: "До какого времени (например 02:00 — следующие сутки).",
  bookingSlotMinutes: "Шаг слотов бронирования в минутах.",
  bookingDurationMinutes: "Сколько минут длится одна бронь.",
  bookingClosedWeekdays: "Дни недели без брони: 1=Пн … 7=Вс, через запятую.",
  venueTimezone: "Часовой пояс заведения для брони и графика смен.",
  referralEnabled: "Включить или выключить реферальную программу для гостей.",
  staffRole: "guest — обычный гость, master — кассир/мастер, admin — полный доступ к админке.",
  staffSchedule: "Недельный шаблон смен. Им заполняют пустые дни кнопкой «Заполнить неделю».",
  staffAssignDay: "Открыть смены выбранного дня и назначить мастера без ручного Telegram ID.",
  tableLabel: "Как стол видят гости в бронировании.",
  tableSeats: "Минимум и максимум гостей за этим столом.",
  tableDescription: "Коротко про стол: у окна, у бара, VIP.",
  tableHighlights: "Через запятую: то, что выделяет стол в карточке брони.",
  floorWidth: "Ширина плана зала в условных единицах канваса.",
  floorHeight: "Высота плана зала в условных единицах канваса.",
  themeAccent: "Цвет кнопок, баланса и акцентов в mini app.",
  themeBg: "Фон хаба, если нет фоновой картинки.",
  skinCover: "Обложка карточки игры берётся из фона поля.",
  broadcastSegment: "Кому уйдёт сообщение: все гости, давно не были, баланс больше порога.",
  exportType: "Какой журнал выгрузить в CSV через текущую сессию администратора.",
  quizStart: "Живая викторина на 30 минут для гостей в зале.",
};

export const infoIcon = (hint: string) => {
  return `<button type="button" class="info-icon" data-hint="${escapeHtml(hint)}" aria-label="Подсказка">!</button>`;
};

export const settingLabel = (name: string, title: string, input: string) => {
  const hint = SETTING_HINTS[name];
  return `<label>${title}${hint ? infoIcon(hint) : ""}${input}</label>`;
};

export const sectionIntro = (text: string) => {
  return `<p class="muted section-intro">${escapeHtml(text)}</p>`;
};

export const SECTION_HINTS: Record<string, string> = {
  guests: "Карточка гостя открывается по имени: сообщение, роль и история бонусов.",
  staff: "Клик по сотруднику меняет роль и смены. Поиск нужен только чтобы добавить нового мастера.",
  bookings: "План зала остаётся на экране. Столы создаются и правятся в попапе.",
  broadcasts: "Рассылка уходит выбранному сегменту гостей. Можно сохранить только в ленту «Акции».",
  settings: "Системные коэффициенты бонусов, визитов, брони и античита.",
  menu: "Позиции кальянной карты, которые видят гости в mini app.",
  content: "Тексты страниц: правила, контакты, акции.",
  brand: "Цвета и картинки темы. Справа — живой предпросмотр хаба.",
  "game-skins": "Внешний вид фишек и фонов игр. Настройки каждой игры — в попапе.",
  games: "Викторина и журнал подозрительных партий.",
  export: "Выгрузка CSV через текущую Telegram-сессию администратора.",
  dashboard: "Сводка зала: визиты, бонусы, бронь и живая очередь.",
};

export const bindInfoIcons = (host: HTMLElement) => {
  for (const button of host.querySelectorAll(".info-icon")) {
    button.addEventListener("click", () => {
      const hint = button.getAttribute("data-hint");
      if (hint === null) {
        return;
      }
      const existing = host.querySelector("[data-hint-popover]");
      if (existing instanceof HTMLElement) {
        existing.remove();
      }
      const pop = document.createElement("div");
      pop.className = "hint-popover";
      pop.setAttribute("data-hint-popover", "");
      pop.textContent = hint;
      const parent = button.parentElement;
      if (parent instanceof HTMLElement) {
        parent.append(pop);
        setTimeout(() => {
          pop.remove();
        }, 5000);
      }
    });
  }
};

export const renderVenueQr = async (canvas: HTMLCanvasElement, payload: string) => {
  await QRCode.toCanvas(canvas, payload, { width: 220, margin: 2 });
};
