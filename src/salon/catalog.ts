import { venue } from "../venue/salon.ts";

export type BarberLevelName = "junior" | "barber" | "senior" | "chef";

export type CatalogPriceRow = {
  branchSlug: "vasilyeva" | "uchilishny";
  branchName: string;
  level: BarberLevelName | "any";
  serviceName: string;
  category: "hair" | "beard" | "complex" | "extra" | "care";
  priceRub: number;
  priceFrom: boolean;
  durationMinutes: number;
};

const SERVICE_RULES: Array<[RegExp, string, CatalogPriceRow["category"]]> = [
  [/стрижка\s*\+.*брит/, "Стрижка + борода с бритьём", "complex"],
  [/стрижка\s*\+/, "Стрижка + борода", "complex"],
  [/папа/, "Папа + сын", "complex"],
  [/детск/, "Детская стрижка", "hair"],
  [/машинк|фейд/, "Стрижка машинкой (фейд)", "hair"],
  [/королевское брить?е головы/, "Королевское бритьё головы", "beard"],
  [/королевское брить?е лица/, "Королевское бритьё лица", "beard"],
  [/с брит/, "Оформление бороды и усов с бритьём", "beard"],
  [/оформление бороды/, "Оформление бороды и усов", "beard"],
  [/восковая/, "Восковая депиляция", "extra"],
  [/комплексная депиляция/, "Комплексная депиляция", "extra"],
  [/депиляция/, "Депиляция нос/уши", "extra"],
  [/окантовка/, "Окантовка / мытьё / укладка", "extra"],
  [/бров/, "Оформление бровей", "extra"],
  [/тонирование бороды/, "Тонирование бороды", "extra"],
  [/тонирование головы/, "Тонирование головы", "extra"],
  [/интенсивный уход/, "Интенсивный уход за лицом VOLCANO", "care"],
  [/уход за лицом/, "Уход за лицом VOLCANO", "care"],
  [/^стрижка$/, "Стрижка", "hair"],
];

export const parseDurationMinutes = (raw: string) => {
  const hours = /(\d+)\s*ч/.exec(raw);
  const minutes = /(\d+)\s*м/.exec(raw);
  return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
};

export const parsePriceLevel = (category: string): BarberLevelName | "any" => {
  const value = category.toLowerCase().replace(/ё/g, "е");
  if (value.includes("новый")) {
    return "junior";
  }
  if (value.includes("шеф")) {
    return "chef";
  }
  if (value.includes("старш")) {
    return "senior";
  }
  if (value.includes("барбер")) {
    return "barber";
  }
  return "any";
};

export const canonicalService = (raw: string): { name: string; category: CatalogPriceRow["category"] } => {
  const normalized = raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\(.*?\)/g, " ")
    .replace(/борды/g, "бороды")
    .replace(/фэйд/g, "фейд")
    .replace(/депилция/g, "депиляция")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, name, category] of SERVICE_RULES) {
    if (pattern.test(normalized)) {
      return { name, category };
    }
  }
  return { name: raw.trim(), category: "extra" };
};

// Разбор старого CSV прайса. Демо BRO сидится из src/venue/salon.ts, не из этого формата.
export const branchFromLabel = (label: string): { slug: CatalogPriceRow["branchSlug"]; name: string } | null => {
  if (label.includes("Василь")) {
    return { slug: "vasilyeva", name: "Васильева 55" };
  }
  if (label.includes("Училищ")) {
    return { slug: "uchilishny", name: "Училищный 7" };
  }
  return null;
};

export const parsePriceCsv = (csv: string): CatalogPriceRow[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const rows: CatalogPriceRow[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    if (parts.length < 6) {
      continue;
    }
    const branch = branchFromLabel(parts[0] ?? "");
    if (branch === null) {
      continue;
    }
    const service = canonicalService(parts[2] ?? "");
    const durationMinutes = parseDurationMinutes(parts[5] ?? "");
    const priceRub = Number(parts[3]);
    if (!Number.isFinite(priceRub) || durationMinutes <= 0) {
      continue;
    }
    rows.push({
      branchSlug: branch.slug,
      branchName: branch.name,
      level: parsePriceLevel(parts[1] ?? ""),
      serviceName: service.name,
      category: service.category,
      priceRub,
      priceFrom: (parts[4] ?? "").trim().toLowerCase() === "да",
      durationMinutes,
    });
  }
  return rows;
};

export const serviceSlug = (name: string) => {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
};

export const LEVEL_LABEL: Record<BarberLevelName, string> = {
  junior: venue.levelLabels.junior,
  barber: venue.levelLabels.barber,
  senior: venue.levelLabels.senior,
  chef: venue.levelLabels.chef,
};

export const masterChoiceLabel = (name: string, levelLabel: string) =>
  name.trim() === levelLabel.trim() ? name : `${name} · ${levelLabel}`;

export const ALL_LEVELS: BarberLevelName[] = ["junior", "barber", "senior", "chef"];
