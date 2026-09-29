import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import * as XLSX from "xlsx";
import { normalizePhone } from "../domain/phone.ts";
import { isHaircutNudgeDue } from "./nudge.ts";

/** Отрицательные id далеко от настоящих Telegram/MAX, стабильные для одного телефона. */
export const IMPORT_TELEGRAM_FLOOR = -8_000_000_000_000_000n;

export const importTelegramId = (phone: string): bigint => IMPORT_TELEGRAM_FLOOR - BigInt(phone);

export type ImportField =
  | "name"
  | "lastName"
  | "phone"
  | "birthday"
  | "lastVisit"
  | "visitsCount"
  | "totalSpent"
  | "preferredMaster"
  | "branch"
  | "notes"
  | "bookingAt"
  | "bookingTime"
  | "bookingService"
  | "bookingMaster"
  | "bookingBranch";

export const IMPORT_FIELDS: ImportField[] = [
  "name",
  "lastName",
  "phone",
  "birthday",
  "lastVisit",
  "visitsCount",
  "totalSpent",
  "preferredMaster",
  "branch",
  "notes",
  "bookingAt",
  "bookingTime",
  "bookingService",
  "bookingMaster",
  "bookingBranch",
];

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  name: "Имя",
  lastName: "Фамилия",
  phone: "Телефон",
  birthday: "День рождения",
  lastVisit: "Последний визит",
  visitsCount: "Число визитов",
  totalSpent: "Сумма",
  preferredMaster: "Любимый мастер",
  branch: "Филиал",
  notes: "Заметка",
  bookingAt: "Дата записи",
  bookingTime: "Время записи",
  bookingService: "Услуга записи",
  bookingMaster: "Мастер записи",
  bookingBranch: "Филиал записи",
};

export type ColumnMapping = Record<ImportField, number | null>;

const emptyMapping = (): ColumnMapping => ({
  name: null,
  lastName: null,
  phone: null,
  birthday: null,
  lastVisit: null,
  visitsCount: null,
  totalSpent: null,
  preferredMaster: null,
  branch: null,
  notes: null,
  bookingAt: null,
  bookingTime: null,
  bookingService: null,
  bookingMaster: null,
  bookingBranch: null,
});

const HEADER_RULES: Array<{ field: ImportField; pattern: RegExp; score: number }> = [
  { field: "bookingMaster", pattern: /мастер\s*записи|сотрудник/, score: 12 },
  { field: "bookingBranch", pattern: /филиал\s*записи/, score: 12 },
  { field: "bookingService", pattern: /услуг/, score: 10 },
  { field: "bookingTime", pattern: /время\s*записи|^время$/, score: 10 },
  { field: "bookingAt", pattern: /ближайш|дата\s*записи|следующ.*запис/, score: 10 },
  { field: "lastVisit", pattern: /последн/, score: 11 },
  { field: "birthday", pattern: /рожден|^др$/, score: 11 },
  { field: "visitsCount", pattern: /количеств.*визит|визитов|^визиты$/, score: 9 },
  { field: "totalSpent", pattern: /оплачен|потрач|^сумм/, score: 8 },
  { field: "preferredMaster", pattern: /любим|^мастер$|специалист/, score: 7 },
  { field: "phone", pattern: /телефон|мобил|^phone$|^тел$/, score: 12 },
  { field: "lastName", pattern: /фамили/, score: 11 },
  { field: "name", pattern: /^имя$|фио|^клиент$|^name$/, score: 9 },
  { field: "notes", pattern: /коммент|заметк|примечан/, score: 8 },
  { field: "branch", pattern: /филиал|салон|^адрес$/, score: 6 },
];

const fold = (value: string) => value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

export const guessMapping = (headers: string[]): ColumnMapping => {
  const mapping = emptyMapping();
  const used = new Set<number>();
  const ranked = headers.flatMap((header, index) => {
    const text = fold(header);
    if (!text) {
      return [];
    }
    return HEADER_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => ({
      field: rule.field,
      index,
      score: rule.score + text.length / 100,
    }));
  });
  ranked.sort((left, right) => right.score - left.score);
  for (const hit of ranked) {
    if (mapping[hit.field] !== null || used.has(hit.index)) {
      continue;
    }
    mapping[hit.field] = hit.index;
    used.add(hit.index);
  }
  return mapping;
};

export const mergeMapping = (headers: string[], override?: Partial<ColumnMapping> | null): ColumnMapping => {
  const mapping = guessMapping(headers);
  if (!override) {
    return mapping;
  }
  for (const field of IMPORT_FIELDS) {
    if (override[field] === undefined) {
      continue;
    }
    const index = override[field];
    mapping[field] = index === null || index === undefined ? null : index;
  }
  return mapping;
};

const detectDelimiter = (headerLine: string) => {
  const counts = [
    { delimiter: ";", count: (headerLine.match(/;/g) ?? []).length },
    { delimiter: ",", count: (headerLine.match(/,/g) ?? []).length },
    { delimiter: "\t", count: (headerLine.match(/\t/g) ?? []).length },
  ];
  counts.sort((left, right) => right.count - left.count);
  return counts[0]!.count > 0 ? counts[0]!.delimiter : ";";
};

export const parseDelimited = (text: string): string[][] => {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const first = source.split("\n").find((line) => line.trim().length > 0) ?? "";
  const delimiter = detectDelimiter(first);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }
  return rows;
};

export const parseSpreadsheet = (input: { filename: string; bytes: Buffer }): string[][] => {
  const name = input.filename.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const book = XLSX.read(input.bytes, { type: "buffer", cellDates: false });
    const sheet = book.Sheets[book.SheetNames[0] ?? ""];
    if (!sheet) {
      return [];
    }
    const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    return matrix
      .map((row) => row.map((cell) => String(cell ?? "").trim()))
      .filter((row) => row.some((cell) => cell.length > 0));
  }
  return parseDelimited(input.bytes.toString("utf8"));
};

const cell = (row: string[], index: number | null) => {
  if (index === null || index < 0 || index >= row.length) {
    return "";
  }
  return row[index]?.trim() ?? "";
};

export const parseFlexibleDate = (raw: string, zone: string): Date | null => {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  const dotted = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(value);
  if (dotted) {
    const date = DateTime.fromObject(
      {
        year: Number(dotted[3]),
        month: Number(dotted[2]),
        day: Number(dotted[1]),
        hour: dotted[4] ? Number(dotted[4]) : 12,
        minute: dotted[5] ? Number(dotted[5]) : 0,
      },
      { zone },
    );
    return date.isValid ? date.toJSDate() : null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(value);
  if (iso) {
    const date = DateTime.fromObject(
      {
        year: Number(iso[1]),
        month: Number(iso[2]),
        day: Number(iso[3]),
        hour: iso[4] ? Number(iso[4]) : 12,
        minute: iso[5] ? Number(iso[5]) : 0,
      },
      { zone },
    );
    return date.isValid ? date.toJSDate() : null;
  }
  if (/^\d{5}(\.\d+)?$/.test(value)) {
    const serial = Number(value);
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
    return Number.isNaN(utc.getTime()) ? null : utc;
  }
  return null;
};

export const birthdayUtcDate = (raw: string): Date | null => {
  const value = raw.trim();
  const dotted = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value);
  if (dotted) {
    return new Date(Date.UTC(Number(dotted[3]), Number(dotted[2]) - 1, Number(dotted[1])));
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }
  return null;
};

const parseCount = (raw: string) => {
  const match = /(\d+)/.exec(raw.replace(/\s/g, ""));
  return match ? Number(match[1]) : null;
};

const parseMoney = (raw: string) => {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  const match = /(\d+(?:\.\d+)?)/.exec(cleaned);
  if (!match) {
    return null;
  }
  return Math.round(Number(match[1]));
};

export type ImportBooking = {
  at: Date;
  service: string;
  master: string;
  branch: string;
};

export type PlannedImportRow = {
  line: number;
  action: "create" | "update" | "error";
  phone: string | null;
  name: string | null;
  lastName: string | null;
  birthday: Date | null;
  lastVisit: Date | null;
  visitsCount: number | null;
  totalSpent: number | null;
  preferredMaster: string | null;
  branchLabel: string | null;
  notes: string | null;
  booking: ImportBooking | null;
  errors: string[];
  warnings: string[];
  mergedFrom: number[];
};

export type ExistingImportClient = {
  phone: string;
  birthday: Date | null;
};

const combineBooking = (dateRaw: string, timeRaw: string, zone: string, now: Date) => {
  if (!dateRaw) {
    return null;
  }
  const withTime = timeRaw && !/\d{1,2}:\d{2}/.test(dateRaw) ? `${dateRaw} ${timeRaw}` : dateRaw;
  const at = parseFlexibleDate(withTime, zone);
  if (!at) {
    return { error: "Не разобрали дату записи" as const };
  }
  if (at.getTime() <= now.getTime()) {
    return { warning: "Запись в прошлом — в календарь не попадёт" as const };
  }
  return { at };
};

export const buildImportPlan = (input: {
  table: string[][];
  mapping?: Partial<ColumnMapping> | null;
  existing?: ExistingImportClient[];
  now?: Date;
  zone?: string;
}): { headers: string[]; mapping: ColumnMapping; rows: PlannedImportRow[] } => {
  const headers = input.table[0] ?? [];
  const mapping = mergeMapping(headers, input.mapping);
  const zone = input.zone ?? "Asia/Barnaul";
  const now = input.now ?? new Date();
  const existing = new Map((input.existing ?? []).map((client) => [client.phone, client]));
  const parsed: PlannedImportRow[] = [];
  input.table.slice(1).forEach((source, offset) => {
    const line = offset + 2;
    const errors: string[] = [];
    const warnings: string[] = [];
    const name = cell(source, mapping.name);
    const lastName = cell(source, mapping.lastName);
    const phoneRaw = cell(source, mapping.phone);
    let phone: string | null = null;
    if (!phoneRaw) {
      errors.push("Нет телефона");
    } else {
      try {
        phone = normalizePhone(phoneRaw);
      } catch {
        errors.push("Телефон не похож на российский номер");
      }
    }
    const birthdayRaw = cell(source, mapping.birthday);
    const birthday = birthdayRaw ? birthdayUtcDate(birthdayRaw) : null;
    if (birthdayRaw && !birthday) {
      warnings.push("День рождения не разобрали");
    }
    const lastRaw = cell(source, mapping.lastVisit);
    const lastVisit = lastRaw ? parseFlexibleDate(lastRaw, zone) : null;
    if (lastRaw && !lastVisit) {
      warnings.push("Дату последнего визита не разобрали");
    }
    const bookingDate = cell(source, mapping.bookingAt);
    const bookingTime = cell(source, mapping.bookingTime);
    const bookingParsed = combineBooking(bookingDate, bookingTime, zone, now);
    let booking: ImportBooking | null = null;
    if (bookingParsed && "error" in bookingParsed) {
      warnings.push(bookingParsed.error);
    } else if (bookingParsed && "warning" in bookingParsed) {
      warnings.push(bookingParsed.warning);
    } else if (bookingParsed && "at" in bookingParsed) {
      const service = cell(source, mapping.bookingService);
      const master = cell(source, mapping.bookingMaster);
      const branch = cell(source, mapping.bookingBranch) || cell(source, mapping.branch);
      if (!service || !master || !branch) {
        warnings.push("В будущей записи не хватает услуги, мастера или филиала");
      } else {
        booking = { at: bookingParsed.at, service, master, branch };
      }
    }
    if (!name && !lastName && phone) {
      warnings.push("Нет имени");
    }
    parsed.push({
      line,
      action: errors.length > 0 ? "error" : "create",
      phone,
      name: name || null,
      lastName: lastName || null,
      birthday,
      lastVisit,
      visitsCount: parseCount(cell(source, mapping.visitsCount)),
      totalSpent: parseMoney(cell(source, mapping.totalSpent)),
      preferredMaster: cell(source, mapping.preferredMaster) || null,
      branchLabel: cell(source, mapping.branch) || null,
      notes: cell(source, mapping.notes) || null,
      booking,
      errors,
      warnings,
      mergedFrom: [],
    });
  });

  const byPhone = new Map<string, PlannedImportRow>();
  const rows: PlannedImportRow[] = [];
  for (const row of parsed) {
    if (!row.phone || row.errors.length > 0) {
      rows.push(row);
      continue;
    }
    const prior = byPhone.get(row.phone);
    if (!prior) {
      const known = existing.get(row.phone);
      row.action = known ? "update" : "create";
      if (known?.birthday && row.birthday && known.birthday.getTime() !== row.birthday.getTime()) {
        row.warnings.push("День рождения уже есть в базе, оставляем прежний");
        row.birthday = known.birthday;
      }
      byPhone.set(row.phone, row);
      rows.push(row);
      continue;
    }
    prior.mergedFrom.push(row.line);
    prior.warnings.push(`Строка ${row.line} — тот же телефон, данные слиты`);
    prior.name ||= row.name;
    prior.lastName ||= row.lastName;
    prior.birthday ||= row.birthday;
    prior.lastVisit = laterDate(prior.lastVisit, row.lastVisit);
    prior.visitsCount = row.visitsCount ?? prior.visitsCount;
    prior.totalSpent = row.totalSpent ?? prior.totalSpent;
    prior.preferredMaster ||= row.preferredMaster;
    prior.branchLabel ||= row.branchLabel;
    if (row.notes && prior.notes && !prior.notes.includes(row.notes)) {
      prior.notes = `${prior.notes}; ${row.notes}`;
    } else {
      prior.notes ||= row.notes;
    }
    prior.booking ||= row.booking;
    row.action = "error";
    row.errors.push(`Дубль телефона, слит со строкой ${prior.line}`);
    rows.push(row);
  }
  return { headers, mapping, rows };
};

const laterDate = (left: Date | null, right: Date | null) => {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return right.getTime() > left.getTime() ? right : left;
};

export const isFirstMessengerLink = (input: {
  importedAt: Date | null;
  welcomeGrantedAt: Date | null;
  telegramId: bigint;
  maxUserId: bigint | null;
}) =>
  input.importedAt !== null &&
  input.welcomeGrantedAt === null &&
  input.telegramId <= 0n &&
  input.maxUserId === null;

export const shouldGrantImportWelcome = (input: {
  importedAt: Date | null;
  welcomeGrantedAt: Date | null;
  telegramId: bigint;
  maxUserId: bigint | null;
  welcomeBonus: number;
}) => isFirstMessengerLink(input) && input.welcomeBonus > 0;

export const importedVisitFeedsNudge = (lastVisit: Date, now: Date, weeks: number) =>
  isHaircutNudgeDue({ lastVisitAt: lastVisit, lastNudgeAt: null, now, weeks });

export const readSampleImportCsv = () => readFileSync("fixtures/dikidi-clients-sample.csv");
