import { DateTime } from "luxon";
import type { Settings } from "./types.ts";
import { MOSCOW } from "./week.ts";

export const DEFAULT_VENUE_TIMEZONE = MOSCOW;

export const venueTimezone = (settings: Pick<Settings, "venueTimezone">) => {
  const zone = settings.venueTimezone.trim();
  if (zone.length === 0) {
    return DEFAULT_VENUE_TIMEZONE;
  }
  const probe = DateTime.now().setZone(zone);
  return probe.isValid ? zone : DEFAULT_VENUE_TIMEZONE;
};

export const venueDateTime = (at: Date, settings: Pick<Settings, "venueTimezone">) => {
  return DateTime.fromJSDate(at, { zone: venueTimezone(settings) });
};

export const parseVenueDay = (value: string, settings: Pick<Settings, "venueTimezone">) => {
  const zone = venueTimezone(settings);
  const parsed = DateTime.fromISO(value, { zone });
  if (parsed.isValid) {
    return parsed.startOf("day");
  }
  const alt = DateTime.fromFormat(value, "dd.MM.yyyy", { zone });
  if (!alt.isValid) {
    return null;
  }
  return alt.startOf("day");
};

export const venueDayRange = (at: Date, settings: Pick<Settings, "venueTimezone">) => {
  const local = venueDateTime(at, settings);
  return {
    from: local.startOf("day").toJSDate(),
    to: local.endOf("day").toJSDate(),
  };
};

export const formatVenueDateTime = (at: Date, settings: Pick<Settings, "venueTimezone">) => {
  return venueDateTime(at, settings).toFormat("dd.MM.yyyy HH:mm");
};

export const venueOffsetLabel = (settings: Pick<Settings, "venueTimezone">) => {
  const local = DateTime.now().setZone(venueTimezone(settings));
  return local.isValid ? local.toFormat("ZZZZ") : "";
};

export const toStoreCalendarDate = (at: Date, settings: Pick<Settings, "venueTimezone">) => {
  const local = venueDateTime(at, settings);
  return new Date(Date.UTC(local.year, local.month, local.day));
};

export const assertValidVenueTimezone = (value: string) => {
  const zone = value.trim();
  if (zone.length === 0) {
    throw new Error("empty");
  }
  if (!DateTime.now().setZone(zone).isValid) {
    throw new Error("invalid");
  }
  return zone;
};
