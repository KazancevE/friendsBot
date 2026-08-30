import type { ContactEntry } from "./types.ts";

const isContactEntry = (value: unknown): value is ContactEntry => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as ContactEntry;
  return typeof row.label === "string" && typeof row.value === "string";
};

export const parseContactEntries = (body: string): ContactEntry[] => {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return [];
  }
  if (!trimmed.startsWith("[")) {
    return [{ label: "Контакты", value: trimmed }];
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return [{ label: "Контакты", value: trimmed }];
    }
    return parsed.filter(isContactEntry);
  } catch {
    return [{ label: "Контакты", value: trimmed }];
  }
};

export const serializeContactEntries = (entries: ContactEntry[]) => {
  return JSON.stringify(entries);
};

export const formatContactEntriesText = (entries: ContactEntry[]) => {
  if (entries.length === 0) {
    return "Контакты пока не добавлены";
  }
  return entries
    .map((entry) => {
      const lines = [`${entry.label}: ${entry.value}`];
      if (entry.description !== undefined && entry.description.trim().length > 0) {
        lines.push(entry.description.trim());
      }
      return lines.join("\n");
    })
    .join("\n\n");
};
