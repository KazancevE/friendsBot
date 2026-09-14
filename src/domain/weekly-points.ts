export const WEEKLY_POINTS_CAP = 2500;

export const WEEKLY_POINT_COEFFICIENTS: Readonly<Record<string, number>> = {
  flappy: 50,
  match3: 0.25,
  blockblast: 0.5,
  game2048: 1,
  quiz: 1,
};

const DEFAULT_COEFFICIENT = 1;

type ToWeeklyPointsParameters = {
  readonly slug: string;
  readonly rawScore: number;
};

export const toWeeklyPoints = ({ slug, rawScore }: ToWeeklyPointsParameters) => {
  if (rawScore <= 0) {
    return 0;
  }
  const coefficient = WEEKLY_POINT_COEFFICIENTS[slug] ?? DEFAULT_COEFFICIENT;
  const scaled = Math.round(rawScore * coefficient);
  if (scaled >= WEEKLY_POINTS_CAP) {
    return WEEKLY_POINTS_CAP;
  }
  return Math.max(1, scaled);
};
