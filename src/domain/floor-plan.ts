import { DomainError } from "./errors.ts";
import type { FloorPlanRecord, FloorPlanView, VenueTableRecord } from "./types.ts";
import type { Store } from "../store/types.ts";

const assertLabel = (label: string) => {
  const trimmed = label.trim();
  if (trimmed.length === 0 || trimmed.length > 40) {
    throw new DomainError("bad_request", "Название стола от 1 до 40 символов");
  }
  return trimmed;
};

const assertHighlights = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, 12);
};

export async function getActiveFloorPlanView(store: Store): Promise<FloorPlanView | null> {
  return store.getActiveFloorPlan();
}

export async function listFloorPlans(store: Store): Promise<FloorPlanRecord[]> {
  return store.listFloorPlans();
}

export async function saveFloorPlan(
  store: Store,
  input: {
    id?: string;
    name: string;
    width?: number;
    height?: number;
    backgroundImageUrl?: string | null;
    active?: boolean;
  },
): Promise<FloorPlanRecord> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 80) {
    throw new DomainError("bad_request", "Название зала от 1 до 80 символов");
  }
  const width = input.width ?? 100;
  const height = input.height ?? 100;
  if (!Number.isInteger(width) || width < 10 || width > 1000) {
    throw new DomainError("bad_request", "Ширина зала от 10 до 1000");
  }
  if (!Number.isInteger(height) || height < 10 || height > 1000) {
    throw new DomainError("bad_request", "Высота зала от 10 до 1000");
  }
  return store.upsertFloorPlan({
    id: input.id,
    name,
    width,
    height,
    backgroundImageUrl: input.backgroundImageUrl ?? null,
    active: input.active ?? true,
  });
}

export async function saveVenueTable(
  store: Store,
  input: {
    id?: string;
    floorPlanId: string;
    label: string;
    description?: string;
    highlights?: unknown;
    photoUrl?: string | null;
    seatsMin?: number;
    seatsMax?: number;
    posX?: number;
    posY?: number;
    width?: number;
    height?: number;
    rotation?: number;
    sort?: number;
    active?: boolean;
  },
): Promise<VenueTableRecord> {
  const floorPlan = await store.findFloorPlanById(input.floorPlanId);
  if (floorPlan === null) {
    throw new DomainError("not_found", "План зала не найден");
  }
  const label = assertLabel(input.label);
  const seatsMin = input.seatsMin ?? 1;
  const seatsMax = input.seatsMax ?? 4;
  if (!Number.isInteger(seatsMin) || seatsMin < 1 || seatsMin > 20) {
    throw new DomainError("bad_request", "Мин. мест за столом от 1 до 20");
  }
  if (!Number.isInteger(seatsMax) || seatsMax < seatsMin || seatsMax > 20) {
    throw new DomainError("bad_request", "Макс. мест не меньше мин. и не больше 20");
  }
  return store.upsertVenueTable({
    id: input.id,
    floorPlanId: input.floorPlanId,
    label,
    description: (input.description ?? "").trim(),
    highlights: assertHighlights(input.highlights),
    photoUrl: input.photoUrl ?? null,
    seatsMin,
    seatsMax,
    posX: input.posX ?? 0,
    posY: input.posY ?? 0,
    width: input.width ?? 10,
    height: input.height ?? 10,
    rotation: input.rotation ?? 0,
    sort: input.sort ?? 0,
    active: input.active ?? true,
  });
}

export async function removeVenueTable(store: Store, tableId: string) {
  await store.deleteVenueTable(tableId);
}

export async function removeFloorPlan(store: Store, floorPlanId: string) {
  await store.deleteFloorPlan(floorPlanId);
}
