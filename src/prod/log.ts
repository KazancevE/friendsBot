type Level = "info" | "warn" | "error";

export const log = (level: Level, msg: string, fields: Record<string, unknown> = {}) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
};
