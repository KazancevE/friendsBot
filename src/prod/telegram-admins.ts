export const DEFAULT_TELEGRAM_ADMIN_ID = "500459806";

const chunks = (raw: string) => raw.split(/[,;\s]+/).map((part) => part.trim()).filter(Boolean);

export const parseTelegramAdminIds = (raw: string | undefined | null): bigint[] => {
  if (!raw?.trim()) {
    return [];
  }
  const ids: bigint[] = [];
  for (const part of chunks(raw)) {
    if (!/^\d+$/.test(part)) {
      continue;
    }
    const id = BigInt(part);
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
};

export const telegramAdminIdsFromEnv = (raw: string | undefined | null): bigint[] => {
  const parsed = parseTelegramAdminIds(raw);
  if (parsed.length > 0) {
    return parsed;
  }
  return parseTelegramAdminIds(DEFAULT_TELEGRAM_ADMIN_ID);
};

export const isTelegramAdmin = (telegramId: bigint, admins: readonly bigint[]) => admins.includes(telegramId);

export const devAlertChatId = (raw: string | undefined | null) => {
  const trimmed = raw?.trim() ?? "";
  return /^\d+$/.test(trimmed) ? trimmed : DEFAULT_TELEGRAM_ADMIN_ID;
};

export const adminCommandReply = (isAdmin: boolean, publicUrl: string) => {
  if (!isAdmin) {
    return "Эта команда только для администратора из TELEGRAM_ADMIN_ID.";
  }
  const origin = publicUrl.replace(/\/$/, "");
  return `Вы администратор. Сюда приходят новые и отменённые записи.\nВеб-админка: ${origin}/admin/`;
};
