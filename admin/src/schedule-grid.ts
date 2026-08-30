import type { StaffMemberView } from "./api.ts";
import { escapeHtml, formatName } from "./ui-helpers.ts";

const WEEKDAY_LABELS = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const HOURS = Array.from({ length: 16 }, (_, index) => index + 12);

const slotActive = (member: StaffMemberView, weekday: number, hour: number) => {
  return member.schedule.some((slot) => {
    if (slot.weekday !== weekday) {
      return false;
    }
    return hour >= slot.startHour && hour < slot.endHour;
  });
};

export const renderScheduleGrid = (
  host: HTMLElement,
  members: StaffMemberView[],
  onEdit: (member: StaffMemberView) => void,
) => {
  if (members.length === 0) {
    host.innerHTML = `<p class="muted">Нет сотрудников</p>`;
    return;
  }

  const header = `<tr><th>Сотрудник</th>${[1, 2, 3, 4, 5, 6, 7]
    .map((day) => `<th>${WEEKDAY_LABELS[day]}</th>`)
    .join("")}</tr>`;

  const rows = members
    .map((member) => {
      const cells = [1, 2, 3, 4, 5, 6, 7]
        .map((weekday) => {
          const activeHours = HOURS.filter((hour) => slotActive(member, weekday, hour));
          const label =
            activeHours.length === 0
              ? "—"
              : `${Math.min(...activeHours)}–${Math.max(...activeHours) + 1}`;
          return `<td><button type="button" class="schedule-cell ${activeHours.length > 0 ? "active" : ""}" data-schedule-member="${member.id}" data-weekday="${weekday}">${escapeHtml(label)}</button></td>`;
        })
        .join("");
      return `<tr>
        <td><button type="button" class="linkish" data-schedule-member="${member.id}" data-weekday="1">${escapeHtml(formatName(member.firstName, member.lastName))}</button></td>
        ${cells}
      </tr>`;
    })
    .join("");

  host.innerHTML = `
    <p class="muted">Клик по ячейке — редактировать смены сотрудника</p>
    <div class="table-wrap">
      <table class="schedule-grid"><thead>${header}</thead><tbody>${rows}</tbody></table>
    </div>
  `;

  for (const button of host.querySelectorAll("[data-schedule-member]")) {
    button.addEventListener("click", () => {
      const userId = button.getAttribute("data-schedule-member");
      const member = members.find((row) => row.id === userId);
      if (member !== undefined) {
        onEdit(member);
      }
    });
  }
};
