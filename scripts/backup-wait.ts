import { DateTime } from "luxon";

const hour = Number(process.env.BACKUP_HOUR ?? 3);
const zone = process.env.VENUE_TIMEZONE ?? "Asia/Barnaul";
const now = DateTime.now().setZone(zone);
let next = now.set({ hour, minute: 15, second: 0, millisecond: 0 });
if (next <= now) {
  next = next.plus({ days: 1 });
}
const delay = Math.max(60_000, next.toMillis() - Date.now());
await new Promise((resolve) => setTimeout(resolve, delay));
