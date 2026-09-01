import type { GuestSchedule } from "./api.ts";

const escapeHtml = (text: string) => {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};

export const renderGuestSchedulePanel = (schedule: GuestSchedule) => {
  const onDuty =
    schedule.onDutyNow.length > 0
      ? `<p class="hub-schedule-now"><strong>Сейчас в зале:</strong> ${escapeHtml(schedule.onDutyNow.join(", "))}</p>`
      : "";

  const days = schedule.days
    .map((day) => {
      const staff =
        day.staff.length === 0
          ? '<span class="muted">—</span>'
          : day.staff
              .map((row) => `<span class="hub-schedule-staff">${escapeHtml(row.name)} <span class="muted">${escapeHtml(row.hours)}</span></span>`)
              .join("");
      return `<li class="hub-schedule-day"><span class="hub-schedule-day-label">${escapeHtml(day.label)}</span>${staff}</li>`;
    })
    .join("");

  return `
    <section class="hub-schedule panel" aria-label="График работы">
      <h2 class="hub-section-title">График</h2>
      ${onDuty}
      <ul class="hub-schedule-list">${days}</ul>
      <p class="muted hub-schedule-note">Время заведения (${escapeHtml(schedule.timezone)})</p>
    </section>
  `;
};
