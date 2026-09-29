import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import https from "node:https";
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { collectProblems, shouldSendAlert, type BackupStatus } from "../src/prod/alerts.ts";
import { log } from "../src/prod/log.ts";
import { devAlertChatId } from "../src/prod/telegram-admins.ts";

const backupDir = process.env.BACKUP_DIR ?? "/var/backups/daddyson";
const startedAt = Date.now();
const cooldownMs = 30 * 60 * 1000;
const stateFile = `${backupDir}/alert-state.json`;

const readBackup = async (): Promise<BackupStatus | null> => {
  try {
    return JSON.parse(await readFile(`${backupDir}/status.json`, "utf8")) as BackupStatus;
  } catch {
    return null;
  }
};

const readState = async () => {
  try {
    return JSON.parse(await readFile(stateFile, "utf8")) as { lastKey: string | null; lastSentAt: number | null };
  } catch {
    return { lastKey: null, lastSentAt: null };
  }
};

const healthOk = async () => {
  try {
    const response = await fetch(process.env.HEALTH_URL ?? "http://app:3000/health/ready");
    return response.ok;
  } catch {
    return false;
  }
};

const sendTelegram = (text: string) =>
  new Promise<void>((resolve, reject) => {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
    const proxy = process.env.TELEGRAM_PROXY?.trim();
    const body = JSON.stringify({ chat_id: devAlertChatId(process.env.DEV_ALERT_CHAT_ID), text });
    const agent = proxy ? (proxy.startsWith("socks") ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy)) : undefined;
    const request = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/sendMessage`,
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
        agent,
      },
      (response) => {
        response.resume();
        response.on("end", () => (response.statusCode && response.statusCode < 300 ? resolve() : reject(new Error(`telegram ${response.statusCode}`))));
      },
    );
    request.on("error", reject);
    request.end(body);
  });

export const watchOnce = async (now = Date.now()) => {
  const problems = collectProblems({
    healthOk: await healthOk(),
    backup: await readBackup(),
    now,
    maxBackupAgeMs: 26 * 60 * 60 * 1000,
    backupGraceMs: 2 * 60 * 60 * 1000,
    startedAt,
  });
  const state = await readState();
  if (!shouldSendAlert({ problems, lastKey: state.lastKey, lastSentAt: state.lastSentAt, now, cooldownMs })) {
    if (problems.length === 0 && state.lastKey) {
      await writeFile(stateFile, JSON.stringify({ lastKey: null, lastSentAt: state.lastSentAt }));
    }
    return problems;
  }
  const text = `Daddyson: ${problems.join("; ")}`;
  await sendTelegram(text);
  await writeFile(stateFile, JSON.stringify({ lastKey: problems.join("|"), lastSentAt: now }));
  log("warn", "alert sent", { problems });
  return problems;
};

const invoked = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const loop = async () => {
    await watchOnce().catch((error: unknown) => {
      log("error", error instanceof Error ? error.message : "watchdog failed");
    });
    setTimeout(loop, 60_000);
  };
  void loop();
}
