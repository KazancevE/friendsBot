export type BackupStatus = { ok: boolean; at: string | null; error?: string };

export const collectProblems = (input: {
  healthOk: boolean;
  backup: BackupStatus | null;
  now: number;
  maxBackupAgeMs: number;
  backupGraceMs: number;
  startedAt: number;
}) => {
  const problems: string[] = [];
  if (!input.healthOk) {
    problems.push("сайт или база не отвечают");
  }
  const backupAge = input.backup?.at ? input.now - Date.parse(input.backup.at) : null;
  const grace = input.now - input.startedAt < input.backupGraceMs;
  if (!input.backup) {
    if (!grace) {
      problems.push("нет статуса резервной копии");
    }
  } else if (!input.backup.ok) {
    problems.push(`резервная копия не удалась${input.backup.error ? `: ${input.backup.error}` : ""}`);
  } else if (backupAge !== null && backupAge > input.maxBackupAgeMs) {
    problems.push("резервная копия старше суток");
  }
  return problems;
};

export const shouldSendAlert = (input: { problems: string[]; lastKey: string | null; lastSentAt: number | null; now: number; cooldownMs: number }) => {
  if (input.problems.length === 0) {
    return false;
  }
  const key = input.problems.join("|");
  if (input.lastKey !== key) {
    return true;
  }
  if (input.lastSentAt === null) {
    return true;
  }
  return input.now - input.lastSentAt >= input.cooldownMs;
};
