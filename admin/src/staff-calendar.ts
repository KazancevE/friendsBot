import type { StaffMemberView } from "./api.ts";
import { escapeHtml, formatName } from "./ui-helpers.ts";
import { formatShiftRange } from "./time-helpers.ts";

export type StaffShiftView = {
  id: string;
  userId: string;
  date: string;
  startHour: number;
  endHour: number;
  firstName: string | null;
  lastName: string | null;
};

const memberColors = [
  "staff-chip--a",
  "staff-chip--b",
  "staff-chip--c",
  "staff-chip--d",
  "staff-chip--e",
];

const memberColor = (memberId: string, memberIds: string[]) => {
  const index = memberIds.indexOf(memberId);
  if (index < 0) {
    return memberColors[0];
  }
  return memberColors[index % memberColors.length];
};

const dayLabel = (isoDate: string) => {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
};

export const renderStaffCalendar = (
  host: HTMLElement,
  input: {
    weekStart: string;
    weekOffset: number;
    members: StaffMemberView[];
    shifts: StaffShiftView[];
    onDayClick: (date: string) => void;
    onPrevWeek: () => void;
    onNextWeek: () => void;
    onFillTemplate: () => void;
  },
) => {
  const memberIds = input.members.map((member) => member.id);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${input.weekStart}T12:00:00`);
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });

  const cells = days
    .map((date) => {
      const dayShifts = input.shifts.filter((shift) => shift.date === date);
      const chips =
        dayShifts.length === 0
          ? `<span class="muted">—</span>`
          : dayShifts
              .map((shift) => {
                const name = formatName(shift.firstName, shift.lastName);
                const color = memberColor(shift.userId, memberIds);
                return `<span class="staff-chip ${color}">${escapeHtml(name)}<br /><span class="muted">${escapeHtml(formatShiftRange(shift.startHour, shift.endHour))}</span></span>`;
              })
              .join("");
      return `<button type="button" class="staff-day-cell" data-staff-day="${date}">
        <span class="staff-day-label">${escapeHtml(dayLabel(date))}</span>
        <span class="staff-day-chips">${chips}</span>
      </button>`;
    })
    .join("");

  const weekTitle = input.weekOffset === 0 ? "Эта неделя" : input.weekOffset === 1 ? "Следующая неделя" : `+${input.weekOffset} нед.`;

  host.innerHTML = `
    <div class="staff-calendar-toolbar">
      <button type="button" class="action" data-staff-week-prev>←</button>
      <strong>${escapeHtml(weekTitle)}</strong>
      <button type="button" class="action" data-staff-week-next>→</button>
      <button type="button" class="action" data-staff-fill-template>Из шаблона</button>
    </div>
    <div class="staff-calendar-grid">${cells}</div>
    <p class="muted">Нажмите на день, чтобы назначить мастеров</p>
  `;

  host.querySelector("[data-staff-week-prev]")?.addEventListener("click", input.onPrevWeek);
  host.querySelector("[data-staff-week-next]")?.addEventListener("click", input.onNextWeek);
  host.querySelector("[data-staff-fill-template]")?.addEventListener("click", input.onFillTemplate);

  for (const button of host.querySelectorAll("[data-staff-day]")) {
    button.addEventListener("click", () => {
      const date = button.getAttribute("data-staff-day");
      if (date !== null) {
        input.onDayClick(date);
      }
    });
  }
};

export const renderStaffDayEditor = (
  host: HTMLElement,
  input: {
    date: string;
    members: StaffMemberView[];
    shifts: StaffShiftView[];
    onSave: (shifts: Array<{ userId: string; startHour: number; endHour: number }>) => void;
    onClose: () => void;
  },
) => {
  const selected = new Map(
    input.shifts.map((shift) => [
      shift.userId,
      { startHour: shift.startHour, endHour: shift.endHour },
    ]),
  );

  const render = () => {
    host.innerHTML = `
      <h3>Смены: ${escapeHtml(dayLabel(input.date))}</h3>
      <div class="staff-day-members">
        ${input.members
          .map((member) => {
            const active = selected.has(member.id);
            const slot = selected.get(member.id) ?? { startHour: 18, endHour: 26 };
            return `<div class="staff-member-row ${active ? "active" : ""}">
              <button type="button" class="action" data-toggle-member="${member.id}">${escapeHtml(formatName(member.firstName, member.lastName))}</button>
              ${
                active
                  ? `<label>С <input type="time" data-start="${member.id}" value="${String(slot.startHour % 24).padStart(2, "0")}:00" step="3600" /></label>
                     <label>До <input type="time" data-end="${member.id}" value="${String((slot.endHour > 24 ? slot.endHour - 24 : slot.endHour) % 24).padStart(2, "0")}:00" step="3600" /></label>`
                  : ""
              }
            </div>`;
          })
          .join("")}
      </div>
      <div style="margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap">
        <button type="button" class="action" data-save-day>Сохранить</button>
        <button type="button" class="action" data-close-day>Закрыть</button>
      </div>
      <p class="muted" data-day-status style="margin-top:0.5rem"></p>
    `;

    for (const button of host.querySelectorAll("[data-toggle-member]")) {
      button.addEventListener("click", () => {
        const userId = button.getAttribute("data-toggle-member");
        if (userId === null) {
          return;
        }
        if (selected.has(userId)) {
          selected.delete(userId);
        } else {
          selected.set(userId, { startHour: 18, endHour: 26 });
        }
        render();
      });
    }

    host.querySelector("[data-close-day]")?.addEventListener("click", input.onClose);
    host.querySelector("[data-save-day]")?.addEventListener("click", () => {
      const shifts: Array<{ userId: string; startHour: number; endHour: number }> = [];
      for (const [userId, slot] of selected) {
        const startInput = host.querySelector(`[data-start="${userId}"]`);
        const endInput = host.querySelector(`[data-end="${userId}"]`);
        let startHour = slot.startHour;
        let endHour = slot.endHour;
        if (startInput instanceof HTMLInputElement && endInput instanceof HTMLInputElement) {
          startHour = Number(startInput.value.split(":")[0]);
          const endH = Number(endInput.value.split(":")[0]);
          endHour = endH <= startHour ? endH + 24 : endH;
        }
        shifts.push({ userId, startHour, endHour });
      }
      input.onSave(shifts);
    });
  };

  render();
};
