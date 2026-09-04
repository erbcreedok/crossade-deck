# Crossade Deck — server

Colyseus (Node.js, `@colyseus/schema` v2), custom accounts instead of Firebase. 2–32 players per
session, 36- or 52-card deck.

```bash
cd server && npm test && npx tsc --noEmit   # 243 tests
```

The game model (dealing, free mode, visibility rules, vote weights) is shared with the client and
written down once, in `client/CLAUDE.md` — read it there rather than restating it here.

## Tests

`server/vitest.config.ts` restricts the run to `src/` — without it, vitest also picked up compiled
`dist/*.test.js` after `npm run build`, and two copies of the `CardRoom` test fought over the same
test port.

Room tests are split by theme (`CardRoom.deck.test.ts`, `.hands.`, `.visibility.`, `.free.`,
`.votes.`, `.lifecycle.`, plus `TestRoom.test.ts`) and share `roomHarness.ts`. **Each file boots on
its OWN port** (`TEST_PORTS`): vitest runs files in parallel, and `boot(server, port)` from
`@colyseus/testing` silently ignores the port when handed a ready `Server`.

## Schema

**`ArraySchema.setAt` past the array's length APPENDS an element** rather than writing "into a hole"
(an array of length 3 becomes length 4 after `setAt(5, x)`). This is the concrete source of a "deck
bloated to 60 cards" bug that came up twice. **Writing the whole deck is always done as `clear()` +
a `push()` loop, never `setAt` across the full length.**

Every write to the schema goes through `stateWrite.ts` — that's where the `clear()+push()` rule is
enforced once.

## Structure

Message handlers are split by theme (`server/src/messages/*`) and get what they need from the room
through the `RoomHost` interface. Play-zone rules live in `server/src/playRules.ts` (`play_card`,
`take_play`, `clear_play`).

The client computes heavy deck operations itself and sends the result; the server **validates**
(`isPermutationOf`) and does not recompute. `deck_fx` is decoration — validate the shape and relay,
never interpret.

## Auth

Custom accounts (short recovery code, no password). Firebase is scaffolded for later
(`server/src/auth.ts`) but not configured or used until keys are supplied.

Telegram Mini App login (`POST /auth/telegram`) verifies `initData`'s HMAC signature
(`telegramAuth.ts`) against `process.env.TELEGRAM_BOT_TOKEN` and finds-or-creates an account
keyed by `telegramId` (`accounts.ts`). Responds 503 without crashing when the token isn't
configured.

## Rooms

- `CardRoom`: full card game engine (Durak/Klondike mechanics, schema, votes, bots).
- `SandboxRoom`: live sandbox relay (snapshots, cursors, presence).
- `KitRoom`: game tree relay (`Root` tree as opaque JSON, revision checks `baseRev`, seat
  management by `accountId` with reconnection grace window). `POST /rooms` spawns one directly
  via `matchMaker.createRoom` (no WS join needed) for a given `game`; the invite code and `game`
  it was created with are both returned by `GET /rooms/by-code/:code` (`roomGames.ts` tracks
  `roomId → game` since the room itself isn't reachable from the HTTP layer).

`server/src/index.ts` only boots `createApp()` from `server/src/app.ts` — the express app and the
Colyseus server are built there so tests can exercise routes without listening on the real port.

