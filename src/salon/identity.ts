export type SalonChannelName = "telegram" | "max";

export type PhoneLinkDecision =
  | { action: "set_phone" }
  | { action: "merge_into"; canonicalUserId: string };

/** Один человек на оба канала: телефон уже есть — прикрепляем текущий канал к этой карте. */
export const decidePhoneLink = (currentUserId: string, phoneOwnerId: string | null): PhoneLinkDecision => {
  if (phoneOwnerId === null || phoneOwnerId === currentUserId) {
    return { action: "set_phone" };
  }
  return { action: "merge_into", canonicalUserId: phoneOwnerId };
};

export type ChannelMove = {
  maxUserId: bigint | null;
  /** Положительный Telegram id, который надо перенести на каноническую карту. */
  telegramId: bigint | null;
};

export const channelIdsToMove = (input: {
  channel: SalonChannelName;
  currentTelegramId: bigint;
  currentMaxUserId: bigint | null;
  canonicalMaxUserId: bigint | null;
  canonicalTelegramId: bigint;
}): ChannelMove => {
  const move: ChannelMove = { maxUserId: null, telegramId: null };
  if (input.currentMaxUserId !== null && input.canonicalMaxUserId === null) {
    move.maxUserId = input.currentMaxUserId;
  }
  if (
    input.channel === "telegram" &&
    input.currentTelegramId > 0n &&
    input.canonicalTelegramId <= 0n
  ) {
    move.telegramId = input.currentTelegramId;
  }
  return move;
};
