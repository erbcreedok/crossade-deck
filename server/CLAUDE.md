# Crossade Deck — server

Colyseus (Node.js) plus express, custom accounts, everything persistent in one SQLite file. Two rooms
live here: `table_room` — the Telegram card table (`src/table/`, its own HTML client in
`table-client/`), and `kit_room` — the relay for games built on `game-kit`.

```bash
cd server && npx tsc --noEmit && npx tsc --noEmit -p table-client && npm test
```

## Tests

`server/vitest.config.ts` runs `src/` and `table-client/` and nothing else — without the restriction
vitest also picked up compiled `dist/*.test.js` after `npm run build`, and two copies of a room test
fought over the same test port.

Room tests share `roomHarness.ts`. **Each file boots on its OWN port** (`TEST_PORTS`): vitest runs
files in parallel, and `boot(server, port)` from `@colyseus/testing` silently ignores the port when
handed a ready `Server`.

`table-client/*.test.ts` hold the client's pure logic (optimistic guesses, hand geometry, angles).
`optimistic.test.ts` runs one intent two ways — through the client's guess and through the real
`Table` — and compares the result card by card: the client repeats the table's rules, so it must agree.

Live behaviour (gestures, flights, voice) is guarded by the Playwright scripts in `scripts/table*.mjs`.
They need a server started with `TABLE_SECRET=dev TELEGRAM_BOT_TOKEN=test TABLE_GUESTS=1`; most take
`[base] [secret]`, four (`tableDrop`, `tableGestures`, `tableMouse`, `tableTips`) take `[base]
[screenshot path]`, and they flicker under parallel load — run them one at a time.

## The table (`src/table/`)

- **`table.ts` is the authority**: a pure reducer over intents, no express, no Colyseus, no database.
  The same class runs in the browser for the stand (`?stand`). `TableRoom.ts` is transport around it.
- **The wire is `contract.ts`**, shared with the client and the bot. Everything those two import from
  `src/table/` must stay pure, transitively (`purity.test.ts`); `PROTOCOL` is bumped when the shape of
  an intent, patch or snapshot changes, and a client with another number is refused and reloads once.
- **Nothing from the wire is trusted**: every intent is read whole or not at all (`intent.ts`), every
  message lane has a per-person rate (`flood.ts`).
- **The room knows no game** (`room.knows-no-game`). A game with a match brings a `Referee`
  (`referee.ts`, registered in `desks.ts`); rules of a table kind are `DeskRules`, a row in `DESKS`.
- **Rooms survive the process**: the room record and a snapshot of the table live in `table_rooms`
  (`lobby.ts` writes through a `LobbyKeep` port, `Table.dump/restore`). What is HELD — locks, picks,
  fingers in the air — is not kept; people come back to their own chair and hand by their key.
- **The client heals itself** (`table-client/netStore.ts`): the server pulses its version, the client
  asks for the whole table when it falls behind, and rejoins by the same door when the socket drops.
- **The client is built ahead of time for a host** (`npm run build:table-client`, `TABLE_CLIENT_DIR`)
  and bundled on the fly in development (`clientBundle.ts`); the bundle is built once per process, so
  a client edit needs a restart of the live table too.
- The turn ring is described in `src/table/RING.md`.

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
presenting a door that belongs to somebody else is SWITCHED to that account and keeps their guest
account where it is; two accounts with identities get 409 and nothing changes. Merging is
irreversible and "where did my items go" would be unanswerable.

A guest's name is issued by the SERVER — a two-word nickname from `src/guestNames.ts`, never a
number, and never a word that hits a person for how they were born (guarded by
`guestNames.test.ts`). The roster calls an account holder by their account's name; `options.name`
only serves someone with no account at all.

Tests keep the database in memory through `CROSSADE_DB_FILE=":memory:"` in `server/vitest.config.ts`.

## Auth

Custom accounts (short recovery code, no password).

Telegram Mini App login (`POST /auth/telegram`) verifies `initData`'s HMAC signature
(`telegramAuth.ts`) against `process.env.TELEGRAM_BOT_TOKEN` and finds-or-creates an account
keyed by the `telegram` identity (`accounts.ts`). Responds 503 without crashing when the token isn't
configured. `POST /accounts/:id/identities/telegram` attaches the same, verified the same way, to an
account that already exists.

**Linking Telegram from an ordinary browser is the REVERSE flow** (`telegramLink.ts`, and the bot's
`link.ts`): the page asks for a code (`POST /auth/telegram/link-code`), shows
`t.me/<bot>?start=<code>`, the person presses Start, and the bot tells the server whose `chat_id`
brought the code (`POST /auth/telegram/claim`, shared `TELEGRAM_LINK_SECRET`); the page polls
`GET /auth/telegram/link-code/:code` and logs itself in. It is this way round because a bot cannot
write first and cannot find a person by phone number or @username — it only ever learns the
`chat_id` of whoever started it. The code is one-time, five minutes, one per account per thirty
seconds. THE BOT'S NAME IS ASKED OF TELEGRAM (`telegramMe.ts`, `getMe` on the token the server
already holds, once per process) rather than written into a variable: a name typed by hand differs
from the real one exactly once, and that once sends a person into somebody ELSE's bot — the link
opens, and a stranger's bot knows nothing about the code. `TELEGRAM_BOT_USERNAME` stays as an
override for a machine with no network. Without a name or the shared secret the route answers 503
and the hub offers nothing.

The profile is the account's own fields: `GET /accounts/:id/profile` (name, colour, avatar, created
date, which providers — never their subjects) and `PATCH /accounts/:id` (name, colour, avatar), both
trusted the way they always were, by `recoveryHash`.

## Rooms

- `TableRoom` (`table_room`): the card table above. One signed room id — one session (`filterBy`).
- `KitRoom` (`kit_room`): game tree relay (`Root` tree as opaque JSON, revision checks `baseRev`, seat
  management by `accountId` with reconnection grace window). `POST /rooms` spawns one directly
  via `matchMaker.createRoom` (no WS join needed) for a given `game`; the invite code and `game`
  it was created with are both returned by `GET /rooms/by-code/:code`.

`server/src/index.ts` only boots `createApp()` from `server/src/app.ts` — the express app and the
Colyseus server are built there so tests can exercise routes without listening on the real port.

