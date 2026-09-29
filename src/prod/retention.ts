export type BackupFile = { name: string; kind: "daily" | "weekly"; at: string };

const byNewest = (left: BackupFile, right: BackupFile) => right.at.localeCompare(left.at);

export const pruneBackups = (files: BackupFile[], keepDaily = 7, keepWeekly = 4) => {
  const daily = files.filter((file) => file.kind === "daily").sort(byNewest);
  const weekly = files.filter((file) => file.kind === "weekly").sort(byNewest);
  return {
    keep: [...daily.slice(0, keepDaily), ...weekly.slice(0, keepWeekly)],
    drop: [...daily.slice(keepDaily), ...weekly.slice(keepWeekly)],
  };
};

export const isWeeklySlot = (date: Date, timeZone = "UTC") =>
  new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date) === "Sun";

export const backupStamp = (date: Date, timeZone = "UTC") =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
