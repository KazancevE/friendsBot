import { randomBytes } from "node:crypto";
import type { ExportType } from "./export.ts";

export type ExportTokenPayload = {
  type: ExportType;
  from: Date;
  to: Date;
  expiresAt: Date;
};

const tokens = new Map<string, ExportTokenPayload>();

const TOKEN_TTL_MS = 15 * 60 * 1000;

export const createExportToken = (input: {
  type: ExportType;
  from: Date;
  to: Date;
  now: Date;
}): string => {
  const token = randomBytes(24).toString("hex");
  tokens.set(token, {
    type: input.type,
    from: input.from,
    to: input.to,
    expiresAt: new Date(input.now.getTime() + TOKEN_TTL_MS),
  });
  return token;
};

export const consumeExportToken = (token: string, now: Date): ExportTokenPayload | null => {
  const payload = tokens.get(token);
  if (payload === undefined) {
    return null;
  }
  if (payload.expiresAt <= now) {
    tokens.delete(token);
    return null;
  }
  tokens.delete(token);
  return payload;
};

export const clearExportTokensForTests = () => {
  tokens.clear();
};
