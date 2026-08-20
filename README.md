# Crossade Deck

A monorepo of four things, and only the first is under active development:

- `game-kit/` — the KIT: a library of presets and contracts for building board games. Everything
  about drawing a desk, carrying a piece with a finger, easing it to rest and shuffling a pack
  lives here. Its catalogue is the documentation, and it is published: 
  https://erbcreedok.github.io/crossade-deck/
- `game-presets/*` — add-ons built ON the kit and shipped as their own packages: `cards`, `dice`.
  The kit carries the atom and the motion; an add-on carries the look and the pieces.
- `apps/*` — standalone games (`klondike`) and the `hub` they are started from. The hub is one
  static page; a game is a lazy chunk inside it, not another site.
- `server/` — the game server on Colyseus (Express + WebSocket, custom accounts). It is the older
  half of the repository and is left alone.

Requirements: **Node 22+**, git. Nothing else — no database, no Redis.

## Running it

The repository is npm workspaces with ONE lock, so everything installs from the root:

```bash
npm ci
```

```bash
npm run kit                                  # the catalogue (Storybook)     :9567
npm run dev --workspace @apps/klondike       # the solitaire, on its own     :9568
npm run dev --workspace @apps/hub            # the hub                       :9569
cd server && npm ci && npm run dev           # the game server               :2567
```

The apps resolve `game-kit` and each other to their SOURCE (the `development` condition), so
nothing in the repo has to be built while developing.

**From a phone on the same Wi-Fi:** the dev servers already listen on every interface (`--host`) —
open `http://<machine-ip>:9569`. Everything is laid out for a phone in portrait first.

## Tests and types

```bash
npm run typecheck --workspaces --if-present
npm test --workspaces --if-present
cd server && npm test && npx tsc --noEmit
```

The kit's suite is the big one, and its plan is a document held against the suite by a test of its
own: `game-kit/docs/test-plan/`. A test with no row there, or a row with no test, fails the build.

## Deploying

Two Fly apps (`crossade-deck-server`, `crossade-deck-hub`) and the catalogue on GitHub Pages.
Images are built by GitHub Actions into GHCR and deployed from there by an immutable tag — build
and deploy are separate decisions, which is also what makes a rollback just another deploy.

Everything about it, including running the whole thing on your own machine behind a Cloudflare
tunnel: **`DEPLOY.md`**.

## Working here

`CLAUDE.md` is the map of the repository and the rules that hold everywhere in it; the kit's own
laws are in `game-kit/CANONS.md`. Both are short on purpose, and both are read before touching
anything.
