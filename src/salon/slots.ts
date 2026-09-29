export type MinuteInterval = {
  startMin: number;
  endMin: number;
};

export const intervalsOverlap = (left: MinuteInterval, right: MinuteInterval) => {
  return left.startMin < right.endMin && right.startMin < left.endMin;
};

export type FreeSlotInput = {
  openMin: number;
  closeMin: number;
  durationMin: number;
  stepMin: number;
  busy: readonly MinuteInterval[];
  /** Скрыть старты раньше этой минуты (сегодня, «сейчас»). */
  earliestStartMin?: number | null;
};

/** Свободные старты: сетка step, услуга целиком внутри окна и без пересечений. */
export const freeSlotStarts = (input: FreeSlotInput): number[] => {
  if (input.durationMin <= 0 || input.stepMin <= 0) {
    return [];
  }
  if (input.closeMin <= input.openMin) {
    return [];
  }
  const latestStart = input.closeMin - input.durationMin;
  const slots: number[] = [];
  for (let start = input.openMin; start <= latestStart; start += input.stepMin) {
    if (input.earliestStartMin != null && start < input.earliestStartMin) {
      continue;
    }
    const slot = { startMin: start, endMin: start + input.durationMin };
    if (input.busy.some((busy) => intervalsOverlap(slot, busy))) {
      continue;
    }
    slots.push(start);
  }
  return slots;
};

export type BarberDay = {
  id: string;
  openMin: number;
  closeMin: number;
  busy: readonly MinuteInterval[];
};

/** Для «любой мастер» — первый свободный в переданном порядке (вызывающий сортирует по загрузке). */
export const slotsForAnyBarber = (
  barbers: readonly BarberDay[],
  durationMin: number,
  stepMin: number,
  earliestStartMin?: number | null,
): Array<{ startMin: number; barberId: string }> => {
  const taken = new Map<number, string>();
  for (const barber of barbers) {
    const starts = freeSlotStarts({
      openMin: barber.openMin,
      closeMin: barber.closeMin,
      durationMin,
      stepMin,
      busy: barber.busy,
      earliestStartMin,
    });
    for (const start of starts) {
      if (!taken.has(start)) {
        taken.set(start, barber.id);
      }
    }
  }
  return [...taken.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([startMin, barberId]) => ({ startMin, barberId }));
};

export const formatMinutes = (minutes: number) => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};
