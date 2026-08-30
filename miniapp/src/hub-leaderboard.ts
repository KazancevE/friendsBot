import type { LeaderboardEntry } from "./api.ts";

export type LeaderboardRenderOptions = {
  readonly staffViewer: boolean;
  readonly myUserId?: string;
  readonly winnersCount: number;
};

const escapeHtml = (text: string) => {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};

export const prizePlaceClass = (place: number, winnersCount: number) => {
  if (place > winnersCount) {
    return "";
  }
  if (place === 1) {
    return "leaderboard-row--prize-1";
  }
  if (place === 2) {
    return "leaderboard-row--prize-2";
  }
  if (place === 3) {
    return "leaderboard-row--prize-3";
  }
  return "leaderboard-row--prize";
};

export const prizePlaceBadge = (place: number, winnersCount: number) => {
  if (place > winnersCount) {
    return "";
  }
  if (place === 1) {
    return "🥇 ";
  }
  if (place === 2) {
    return "🥈 ";
  }
  if (place === 3) {
    return "🥉 ";
  }
  return "🏆 ";
};

export const isMyLeaderboardRow = (
  row: LeaderboardEntry,
  myUserId: string | undefined,
) => {
  return myUserId !== undefined && row.userId === myUserId;
};

export const leaderboardRowClasses = (
  row: LeaderboardEntry,
  options: LeaderboardRenderOptions,
) => {
  const classes = ["leaderboard-row"];
  const prizeClass = prizePlaceClass(row.place, options.winnersCount);
  if (prizeClass.length > 0) {
    classes.push(prizeClass);
  }
  if (!options.staffViewer && isMyLeaderboardRow(row, options.myUserId)) {
    classes.push("leaderboard-row--me");
  }
  return classes.join(" ");
};

export const renderLeaderboardItemHtml = (
  row: LeaderboardEntry,
  options: LeaderboardRenderOptions,
) => {
  const badge = prizePlaceBadge(row.place, options.winnersCount);
  const classAttr = leaderboardRowClasses(row, options);
  const meTag =
    !options.staffViewer && isMyLeaderboardRow(row, options.myUserId)
      ? ' <span class="leaderboard-me-tag">Вы</span>'
      : "";
  if (options.staffViewer) {
    const name = row.displayName ?? "—";
    return `<li class="${classAttr}">${badge}${row.place}. ${escapeHtml(name)} — ${row.points} очков${meTag}</li>`;
  }
  return `<li class="${classAttr}">${badge}${row.place}. ${row.points} очков${meTag}</li>`;
};

export const renderMyStandingHtml = (
  place: number | null,
  points: number,
  inTopList: boolean,
) => {
  if (inTopList || place === null) {
    return "";
  }
  return `<p class="leaderboard-my-standing">Ваше место: <strong class="hub-status-accent">#${place}</strong> · ${points} очков</p>`;
};

export const myRowInTop = (
  top: ReadonlyArray<LeaderboardEntry>,
  myUserId: string | undefined,
) => {
  if (myUserId === undefined) {
    return false;
  }
  return top.some((row) => row.userId === myUserId);
};
