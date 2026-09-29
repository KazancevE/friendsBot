const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const isHaircutNudgeDue = (input: {
  lastVisitAt: Date | null;
  lastNudgeAt: Date | null;
  now: Date;
  weeks: number;
}) => {
  if (input.lastVisitAt === null || input.weeks < 1) {
    return false;
  }
  const dueAt = input.lastVisitAt.getTime() + input.weeks * WEEK_MS;
  if (input.now.getTime() < dueAt) {
    return false;
  }
  if (input.lastNudgeAt !== null && input.lastNudgeAt.getTime() >= input.lastVisitAt.getTime()) {
    return false;
  }
  return true;
};
