type RankableScore = {
  readonly points: number;
  readonly updatedAt: Date;
};

export const rankScores = <T extends RankableScore>(scores: ReadonlyArray<T>) => {
  return [...scores].sort((left, right) => {
    if (right.points !== left.points) {
      return right.points - left.points;
    }
    return left.updatedAt.getTime() - right.updatedAt.getTime();
  });
};
