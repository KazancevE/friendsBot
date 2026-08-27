# Staff games, menu images, leaderboard rules

## Task 1: Backend — games domain & API

### `src/domain/games.ts`
- Export `submitScoreOrPractice(store, input)`:
  - guest + active visit → persist score (current behavior)
  - guest without visit → `no_visit`
  - master/admin → validate game + points cap, return `{ points, counted: false }` without DB write
- Extend `getLeaderboard`:
  - Add `viewerRole: Role`
  - For `top` entries: if viewer is staff, resolve `displayName` from user (firstName + last initial)
  - Guests see only place + points (no names)
- Add `getGameRules(store)` → `{ winnersCount, prizeTable, body }` from Settings + ContentPage slug `game_rules`

### `src/domain/types.ts`
- Extend `ContentPageRecord.slug`: `"contacts" | "directions" | "game_rules"`
- Extend leaderboard response type if needed inline in games.ts

### `src/domain/weekly.ts`
- When iterating ranked winners, skip users where `role !== "guest"` and take next eligible

### `src/http/games.ts`
- `POST /api/games/score` → use `submitScoreOrPractice`, return `{ points, counted }`
- `GET /api/games/rules` → public for registered users
- `GET /api/games/leaderboard` → pass `viewerRole: user.role`

### `src/store/*`, `prisma/schema.prisma`, `prisma/seed.ts`
- Add ContentPage seed for `game_rules` with default Russian rules text

### Tests
- `tests/domain/games.test.ts`: staff practice score succeeds without GameScore row; staff leaderboard has displayName
- `tests/domain/weekly.test.ts`: staff in rankings (if manually inserted) skipped for prizes

---

## Task 2: Backend — menu image-only items

### `src/domain/types.ts`
- `MenuItemRecord`: add `imageFileId: string | null`

### `prisma/schema.prisma` + migration
- `MenuItem.imageFileId String?`

### `src/domain/content.ts`
- `addMenuItem` accepts `imageFileId`, allows empty title/description when image present

### `src/bot/admin.ts` — `addMenuItemConversation`
- After title: ask «Только картинка без текста?» (Да/Нет)
- If image-only: ask photo (reuse `waitCancellablePhotoOrSkip` pattern from promos), skip description/price
- If text: current flow, optional photo at end

### `src/bot/guest.ts`
- `formatMenu` handles image-only items
- On «Меню»: send image items as photos (like promos), text items as before

### Tests
- `tests/domain/content.test.ts`: image-only menu item CRUD

---

## Task 3: Mini App — staff tabs, hub, rules

### `miniapp/src/main.ts`
- Staff: render shell with tabs «Касса» | «Игры» instead of cashier-only

### `miniapp/src/api.ts`
- `LeaderboardEntry.displayName?: string`
- `SubmitScoreResult`: `{ points, counted: boolean }`
- `GameRules` type + `fetchGameRules()`

### `miniapp/src/hub.ts`
- Staff bypass `visitActive` check
- Staff banner: «Режим персонала — очки не участвуют в розыгрыше»
- Section «Правила» from `fetchGameRules`
- Leaderboard shows names for staff entries
- Tab navigation if embedded in staff shell

### `miniapp/src/match3.ts`
- On score submit: if `counted === false`, show «Тренировочная партия — очки не засчитаны»

### `miniapp/src/style.css`
- Styles for staff tabs, rules block, staff badge

---

## Verification
- `npm test`
- `npm run build`
