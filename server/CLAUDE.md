# Crossade Deck — server

Colyseus (Node.js, `@colyseus/schema` v2), custom accounts instead of Firebase. 2–32 players per
session, 36- or 52-card deck.

```bash
cd server && npm test && npx tsc --noEmit   # 308 tests
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

## Accounts

People live in SQLite on the mounted volume (`server/data/crossade.db`, `src/db/`) — `node:sqlite`,
which Node 22 already carries, so there is no native build in alpine and no new dependency. The
schema is `account ↔ identity[]`: an account is the person, a way in is an `identity(provider,
subject)`, and a GUEST IS AN ACCOUNT WITH ZERO IDENTITIES rather than no account at all. `telegramId`
is no longer a field — it is the `telegram` identity, and the next door adds no field either.

`src/accounts.ts` is the only door onto that: the routes and `KitRoom` call the same functions they
called when people lived in `accounts.json`. The old file is imported once, by migration 2, and the
import is idempotent (`src/db/migration.test.ts` runs it on a real file three times).

**Two full accounts are never merged** (`accounts.two-full-accounts-never-merge`): a pure guest
predending a door that belongs to somebody else is SWITCHED to that account and keeps their guest
account where it is; two accounts with identities get 409 and nothing changes. Merging is
irreversible and "where did my items go" would be unanswerable.

A guest's name is issued by the SERVER — a two-word nickname from `src/guestNames.ts`, never a
number, and never a word that hits a person for how they were born (guarded by
`guestNames.test.ts`). The roster calls an account holder by their account's name; `options.name`
only serves someone with no account at all.

Tests keep the database in memory through `CROSSADE_DB_FILE=":memory:"` in `server/vitest.config.ts`.

## Auth

Custom accounts (short recovery code, no password). Firebase is scaffolded for later
(`server/src/auth.ts`) but not configured or used until keys are supplied.

Telegram Mini App login (`POST /auth/telegram`) verifies `initData`'s HMAC signature
(`telegramAuth.ts`) against `process.env.TELEGRAM_BOT_TOKEN` and finds-or-creates an account
keyed by the `telegram` identity (`accounts.ts`). Responds 503 without crashing when the token isn't
configured. `POST /accounts/:id/identities/telegram` attaches the same, verified the same way, to an
account that already exists.

The profile is the account's own fields: `GET /accounts/:id/profile` (name, colour, avatar, created
date, which providers — never their subjects) and `PATCH /accounts/:id` (name, colour, avatar), both
trusted the way they always were, by `recoveryHash`.

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

