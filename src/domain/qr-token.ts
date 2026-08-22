import { nanoid } from "nanoid";

export function newQrToken(): string {
  return nanoid(10);
}
