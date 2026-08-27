import { DomainError } from "./errors.ts";

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let n = digits;
  if (n.length === 11 && n.startsWith("8")) n = `7${n.slice(1)}`;
  if (n.length === 10) n = `7${n}`;
  if (n.length !== 11 || !n.startsWith("7")) {
    throw new DomainError("bad_phone", "Некорректный телефон");
  }
  return n;
}

export function formatDisplayPhone(phone: string | null): string {
  if (phone === null) {
    return "—";
  }
  if (phone.length === 11 && phone.startsWith("7")) {
    return `+7 ${phone.slice(1, 4)} ${phone.slice(4, 7)}-${phone.slice(7, 9)}-${phone.slice(9, 11)}`;
  }
  return phone;
}
