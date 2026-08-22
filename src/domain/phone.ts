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
