import { DEFAULT_SETTINGS } from "../domain/settings.ts";
import type {
  ContentPageRecord,
  CouponRecord,
  GameRecord,
  GameScoreRecord,
  GameWeekRecord,
  LedgerRecord,
  LedgerType,
  MenuItemRecord,
  PromoRecord,
  Settings,
  UserRecord,
  VisitRecord,
} from "../domain/types.ts";
import { moscowCalendarYear } from "../domain/week.ts";
import type { NewUser, Store } from "./types.ts";

export class MemoryStore implements Store {
  settings: Settings = structuredClone(DEFAULT_SETTINGS);
  users = new Map<string, UserRecord>();
  ledger: LedgerRecord[] = [];
  visits = new Map<string, VisitRecord>();
  menu = new Map<string, MenuItemRecord>();
  pages = new Map<string, ContentPageRecord>();
  promos = new Map<string, PromoRecord>();
  games = new Map<string, GameRecord>();
  weeks = new Map<string, GameWeekRecord>();
  scores = new Map<string, GameScoreRecord>();
  coupons = new Map<string, CouponRecord>();
  awards = new Set<string>();

  constructor() {
    const id = crypto.randomUUID();
    this.games.set(id, {
      id,
      slug: "match3",
      title: "Три в ряд",
      active: true,
      maxScorePerSession: 50000,
    });
  }

  async withTransaction<T>(fn: (store: Store) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async getSettings() {
    return structuredClone(this.settings);
  }
  async updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    return this.getSettings();
  }

  async createUser(input: NewUser): Promise<UserRecord> {
    const user: UserRecord = {
      id: crypto.randomUUID(),
      telegramId: input.telegramId,
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
      birthday: input.birthday,
      phone: input.phone,
      balance: 0,
      qrToken: input.qrToken,
      broadcastOptOut: false,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async findUserById(id: string) {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }
  async findUserByTelegramId(telegramId: bigint) {
    return [...this.users.values()].find((u) => u.telegramId === telegramId) ?? null;
  }
  async findUserByPhone(phone: string) {
    return [...this.users.values()].find((u) => u.phone === phone) ?? null;
  }
  async findUserByQrToken(token: string) {
    return [...this.users.values()].find((u) => u.qrToken === token) ?? null;
  }
  async updateUser(id: string, patch: Partial<UserRecord>) {
    const cur = this.users.get(id);
    if (!cur) throw new Error("user missing");
    const next = { ...cur, ...patch, id: cur.id };
    this.users.set(id, next);
    return { ...next };
  }
  async listGuestTelegramIdsForBroadcast() {
    return [...this.users.values()]
      .filter((u) => u.role === "guest" && !u.broadcastOptOut)
      .map((u) => u.telegramId);
  }

  async addLedger(input: {
    userId: string;
    type: LedgerType;
    amount: number;
    actorId: string | null;
    comment: string | null;
    checkAmount: number | null;
  }) {
    const row: LedgerRecord = { id: crypto.randomUUID(), createdAt: new Date(), ...input };
    this.ledger.push(row);
    return row;
  }
  async listLedger(userId: string) {
    return this.ledger.filter((l) => l.userId === userId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async hasBirthdayLedgerInYear(userId: string, year: number) {
    return this.ledger.some(
      (l) => l.userId === userId && l.type === "birthday" && moscowCalendarYear(l.createdAt) === year,
    );
  }
  async listUsersWithBirthday() {
    return [...this.users.values()].filter((u) => u.birthday);
  }

  async getActiveVisit(userId: string, now: Date) {
    return (
      [...this.visits.values()].find((v) => v.userId === userId && now < v.endsAt) ?? null
    );
  }
  async createVisit(input: { userId: string; openedBy: string; startedAt: Date; endsAt: Date }) {
    const row: VisitRecord = { id: crypto.randomUUID(), ...input };
    this.visits.set(row.id, row);
    return row;
  }
  async updateVisitEndsAt(id: string, endsAt: Date) {
    const v = this.visits.get(id)!;
    const next = { ...v, endsAt };
    this.visits.set(id, next);
    return next;
  }

  async listMenu() {
    return [...this.menu.values()].filter((m) => m.active).sort((a, b) => a.sort - b.sort);
  }
  async upsertMenuItem(item: Omit<MenuItemRecord, "id"> & { id?: string }) {
    const id = item.id ?? crypto.randomUUID();
    const row = { ...item, id };
    this.menu.set(id, row);
    return row;
  }
  async deleteMenuItem(id: string) {
    this.menu.delete(id);
  }
  async getPage(slug: "contacts" | "directions") {
    return this.pages.get(slug) ?? null;
  }
  async upsertPage(page: ContentPageRecord) {
    this.pages.set(page.slug, page);
    return page;
  }

  async createPromo(input: { body: string; photos: string[]; showInFeed: boolean }) {
    const row: PromoRecord = { id: crypto.randomUUID(), createdAt: new Date(), ...input };
    this.promos.set(row.id, row);
    return row;
  }
  async listFeedPromos() {
    return [...this.promos.values()].filter((p) => p.showInFeed);
  }

  async listActiveGames() {
    return [...this.games.values()].filter((g) => g.active);
  }
  async findGameBySlug(slug: string) {
    return [...this.games.values()].find((g) => g.slug === slug) ?? null;
  }
  async listOpenWeeks() {
    return [...this.weeks.values()].filter((week) => week.closedAt === null);
  }
  async getOrCreateOpenWeek(gameId: string, weekStart: Date) {
    const found = [...this.weeks.values()].find(
      (w) => w.gameId === gameId && w.weekStart.getTime() === weekStart.getTime() && !w.closedAt,
    );
    if (found) return found;
    const row: GameWeekRecord = {
      id: crypto.randomUUID(),
      gameId,
      weekStart,
      closedAt: null,
    };
    this.weeks.set(row.id, row);
    return row;
  }
  async addScore(weekId: string, userId: string, delta: number, at: Date) {
    const key = `${weekId}:${userId}`;
    const cur = this.scores.get(key);
    const row: GameScoreRecord = {
      weekId,
      userId,
      points: (cur?.points ?? 0) + delta,
      updatedAt: at,
    };
    this.scores.set(key, row);
    return row;
  }
  async listWeekScores(weekId: string) {
    return [...this.scores.values()].filter((s) => s.weekId === weekId);
  }
  async closeWeek(weekId: string, at: Date) {
    const w = this.weeks.get(weekId)!;
    this.weeks.set(weekId, { ...w, closedAt: at });
  }
  async hasWeeklyAward(weekId: string, userId: string) {
    return this.awards.has(`${weekId}:${userId}`);
  }
  async addWeeklyAward(weekId: string, userId: string, _place: number) {
    this.awards.add(`${weekId}:${userId}`);
  }

  async createCoupon(input: { userId: string; title: string; weekId: string | null }) {
    const row: CouponRecord = {
      id: crypto.randomUUID(),
      status: "active",
      redeemedBy: null,
      redeemedAt: null,
      ...input,
    };
    this.coupons.set(row.id, row);
    return row;
  }
  async listActiveCoupons(userId: string) {
    return [...this.coupons.values()].filter((c) => c.userId === userId && c.status === "active");
  }
  async findCoupon(id: string) {
    return this.coupons.get(id) ?? null;
  }
  async redeemCoupon(id: string, by: string, at: Date) {
    const c = this.coupons.get(id)!;
    const next = { ...c, status: "redeemed" as const, redeemedBy: by, redeemedAt: at };
    this.coupons.set(id, next);
    return next;
  }
}
