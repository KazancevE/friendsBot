import type { StaffMemberView } from "./api.ts";
import { escapeHtml, formatName } from "./ui-helpers.ts";
import { formatShiftRange } from "./time-helpers.ts";

const WEEKDAY_LABELS = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const isSlotActiveAtHour = (slot: StaffMemberView["schedule"][number], weekday: number, hour: number) => {
  if (slot.endHour <= 24) {
    return slot.weekday === weekday && hour >= slot.startHour && hour < slot.endHour;
  }
  if (slot.weekday === weekday && hour >= slot.startHour) {
    return true;
  }
  const nextWeekday = slot.weekday === 7 ? 1 : slot.weekday + 1;
  return nextWeekday === weekday && hour < slot.endHour - 24;
};

const slotActive = (member: StaffMemberView, weekday: number, hour: number) => {
  return member.schedule.some((slot) => isSlotActiveAtHour(slot, weekday, hour));
};

const slotLabel = (member: StaffMemberView, weekday: number) => {
  const daySlots = member.schedule.filter(
    (slot) => slot.weekday === weekday || (slot.endHour > 24 && (slot.weekday === 7 ? 1 : slot.weekday + 1) === weekday),
  );
  if (daySlots.length === 0) {
    return "—";
  }
  return daySlots
    .map((slot) => {
      if (slot.weekday === weekday) {
        return formatShiftRange(slot.startHour, Math.min(slot.endHour, 24));
      }
      if (slot.endHour > 24) {
        return formatShiftRange(0, slot.endHour - 24);
      }
      return "";
    })
    .filter((part) => part.length > 0)
    .join(", ");
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
          const activeHours = Array.from({ length: 24 }, (_, hour) => hour).filter((hour) =>
            slotActive(member, weekday, hour),
          );
          const label = slotLabel(member, weekday);
          return `<td><button type="button" class="schedule-cell ${activeHours.length > 0 ? "active" : ""}" data-schedule-member="${member.id}" data-weekday="${weekday}">${escapeHtml(label)}</button></td>`;
        })
        .join("");
      return `<tr><td>${escapeHtml(formatName(member.firstName, member.lastName))}</td>${cells}</tr>`;
    })
    .join("");

  host.innerHTML = `
    <div class="table-wrap schedule-grid">
      <table><thead>${header}</thead><tbody>${rows}</tbody></table>
    </div>
  `;

  for (const button of host.querySelectorAll("[data-schedule-member]")) {
    button.addEventListener("click", () => {
      const memberId = button.getAttribute("data-schedule-member");
      const member = members.find((row) => row.id === memberId);
      if (member !== undefined) {
        onEdit(member);
      }
    });
  }
};
