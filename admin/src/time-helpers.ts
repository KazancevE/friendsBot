/** Hour offset from midnight (0–48). Values ≥24 mean next calendar day. */

export const encodedToTimeValue = (hour: number): string => {
  const h = hour % 24;
  return `${String(h).padStart(2, "0")}:00`;
};

export const timeValueToStartHour = (time: string): number => {
  const [hStr] = time.split(":");
  return Number(hStr);
};

export const timeValueToEndHour = (time: string, startHour: number): number => {
  const [hStr] = time.split(":");
  const h = Number(hStr);
  if (h <= startHour % 24) {
    return h + 24;
  }
  return h;
};

export const formatEncodedHour = (hour: number): string => {
  const days = Math.floor(hour / 24);
  const h = hour % 24;
  const label = `${String(h).padStart(2, "0")}:00`;
  return days > 0 ? `${label} (+${days}д)` : label;
};

export const formatShiftRange = (startHour: number, endHour: number): string => {
  return `${formatEncodedHour(startHour)}–${formatEncodedHour(endHour)}`;
};

export const validateShiftHours = (startHour: number, endHour: number): string | null => {
  if (startHour < 0 || startHour > 47) {
    return "Начало смены: от 00:00 до 23:00";
  }
  if (endHour < 1 || endHour > 48) {
    return "Конец смены: до 24:00 следующих суток";
  }
  if (endHour <= startHour) {
    return "Конец смены должен быть позже начала";
  }
  return null;
};
