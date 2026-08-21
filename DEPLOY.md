# Deploying Crossade Deck

Two things ship, and they do not know about each other:

- `server/` — the game server on Colyseus (Express + WebSocket), listens on **:2567**. The HTTP
  endpoints (`/accounts*`, `/rooms*`, `/health`, `/matchmake*`) and the game socket share the port.
- `apps/hub/` — the HUB: one static page games are started from, built by Vite into
  `apps/hub/dist`. A game is a lazy chunk in that same page, not another site.

The hub bakes NO address of anything: it talks to nobody. That is what makes its image one image
for every environment — there is nothing in it to point somewhere else.

The kit's catalogue (`game-kit`) is the third face and takes a different road entirely: it is not
an image at all, it goes to **GitHub Pages** — see the section at the end.

Requirements: **Node 22+**, git. Nothing else — no database, no Redis. Account data lives in the
JSON file `server/data/accounts.json`.

## Layout

Two public hosts on one machine — the simplest setup for a tunnel, because the Colyseus socket
lives at the root (`/{processId}/{roomId}`) and cannot be told apart from static assets by path:

```
browser ──https──> Cloudflare ──tunnel──> cloudflared ─┬─ 127.0.0.1:8080  static apps/hub/dist
             wss                                       └─ 127.0.0.1:2567  Colyseus (API + socket)
```

- `crossade.EXAMPLE.com` → the hub's static files
- `api.crossade.EXAMPLE.com` → the game server

CORS is open on the server (`Access-Control-Allow-Origin: *`), so different hosts for the page and
the API is a working configuration with no code changes.

## 1. Build the project

```bash
git clone <repo-url> ~/crossade-deck
cd ~/crossade-deck/server && npm ci && npm run build
```

The hub is built from the REPO ROOT and not from its own folder: the repository is npm workspaces
with ONE lock, and the hub imports the kit and the games by package name. Installing inside
`apps/hub` would build a second dependency tree beside the first.

```bash
cd ~/crossade-deck && npm ci && npm run build --workspace @apps/hub
```

No `.env` of any kind: there is no address to bake. The build order no longer matters either —
neither half knows about the other.

## 2. Start two local processes

**Game server:**

```bash
cd ~/crossade-deck/server && PORT=2567 NODE_ENV=production node dist/index.js
```

**The hub's static files** — and WITHOUT an SPA fallback (`serve -s`), deliberately: the hub has
one address, the root, and everything else it asks for is a real file with a hash in its name. A
fallback would only dress a typo up as a blank page instead of an honest 404.

```bash
npx serve ~/crossade-deck/apps/hub/dist -l 8080
```

Any static server will do — nginx, Caddy, whatever is already on the machine. Port 8080 only
matters for the tunnel config from here on.

Check before wiring up the tunnel:

```bash
curl http://127.0.0.1:2567/health   # {"status":"ok"}
curl -I http://127.0.0.1:8080/      # 200
```

## 3. Cloudflare Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create crossade-deck
cloudflared tunnel route dns crossade-deck crossade.EXAMPLE.com
cloudflared tunnel route dns crossade-deck api.crossade.EXAMPLE.com
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: crossade-deck
credentials-file: /root/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: api.crossade.EXAMPLE.com
    service: http://127.0.0.1:2567
  - hostname: crossade.EXAMPLE.com
    service: http://127.0.0.1:8080
  - service: http_status:404
```

WebSocket works through the tunnel out of the box, no extra flags needed. The
Cloudflare proxy (orange cloud) must be enabled on both records — `tunnel route dns`
sets that up automatically.

```bash
cloudflared tunnel run crossade-deck
```

## 4. Auto-start on boot

Three services: `cloudflared`, the game server, the static files. `cloudflared` has
the built-in `cloudflared service install`. For the other two — plain systemd unit
files, e.g. `/etc/systemd/system/crossade-deck.service`:

```ini
[Unit]
Description=Crossade Deck game server (Colyseus)
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/crossade-deck/server
ExecStart=/usr/bin/node dist/index.js
Environment=NODE_ENV=production
Environment=PORT=2567
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

A similar unit for the static files with
`ExecStart=/usr/bin/npx serve /home/YOUR_USER/crossade-deck/apps/hub/dist -l 8080`
(or hand it off to nginx/Caddy if either is already on the machine).

```bash
systemctl daemon-reload && systemctl enable --now crossade-deck
```

Logs: `journalctl -u crossade-deck -f`, `journalctl -u cloudflared -f`.

## 5. Verify

```bash
curl https://api.crossade.EXAMPLE.com/health
```

Expect `{"status":"ok"}`. Then open `https://crossade.EXAMPLE.com` in a browser: the hub draws
its shelf, and a tap on a tile loads that game's chunk (DevTools → Network, a `.js` under
`assets/`) into the same page.

## 6. Updating

```bash
cd ~/crossade-deck && git pull
cd server && npm ci && npm run build
cd .. && npm ci && npm run build --workspace @apps/hub
sudo systemctl restart crossade-deck
```

No need to restart the static server — `serve` reads files straight off disk. The page will most
likely need a hard reload.

> ⚠️ Rooms, invite codes, and player hands live **in memory only** — restarting the
> server kicks everyone out of their game. Don't update mid-session. Accounts
> (`server/data/accounts.json`) are on disk and survive a restart.

## 7. Backing up accounts

`server/data/` is in `.gitignore`, `git pull` won't touch it. Once a day via
`crontab -e`:

```
0 4 * * * mkdir -p ~/backups && cp ~/crossade-deck/server/data/accounts.json ~/backups/accounts-$(date +\%F).json
```

## Known quirks

- The server has no required environment variables besides `PORT` (defaults to 2567).
- Rooms, invite codes and hands live IN MEMORY: restarting the server ends every game in progress.
  Accounts are on disk and survive it.

## Fly.io (current production)

Two apps, region `fra`:

| app | what it is | config |
| --- | --- | --- |
| `crossade-deck-server` | the game server (Colyseus) | `server/fly.toml` |
| `crossade-deck-hub` | nginx: the hub's static files | `deploy/hub.fly.toml` |

And a third face that is NOT an app: the kit's catalogue on **GitHub Pages** —
https://erbcreedok.github.io/crossade-deck/. It has no image and needs none: `game-kit` builds to
static and nothing else is made from those sources, so the rule the images live by ("what goes to
Pages is extracted from the already built image, never built a second time") has nothing to guard
here. What it buys instead is that publishing the catalogue no longer drags a production deploy
behind it — see `.github/workflows/pages.yml`.

### The artifact is one decision, the deploy is another

Fly no longer builds anything. GitHub Actions builds the images and puts them in GHCR;
`fly deploy` only says which one to take. Everything else follows from that:

- a **rollback** is deploying an older tag, not a revert plus a rebuild;
- what reaches production is THE SAME image that was tested, not one "built from the same
  commit";
- that same image can go somewhere else — your own server, a staging box — unrebuilt.

```
push to main → green tests → ghcr.io/erbcreedok/crossade-deck/{server,hub}
                                       ↓ (a separate decision)
                             Actions → Выкатка   |   scripts/deploy.sh
```

Every image carries three tags: `sha-<commit>` (immutable, the primary handle),
`build-<number>` (the very number in the version signature) and `main` — a moving pointer
at the latest build.

### Deploying

```bash
scripts/deploy.sh                            # everything, latest build off main
scripts/deploy.sh hub                        # one component
IMAGE_TAG=sha-abc1234 scripts/deploy.sh hub  # a specific build; this is also the rollback
DEPLOY_ENV=dev scripts/deploy.sh hub         # another environment (looks for deploy/hub.fly.dev.toml)
BUILD_FROM_SOURCE=1 scripts/deploy.sh server # fallback: build on Fly, bypassing GHCR
```

The same via a button: Actions → **Выкатка** → Run workflow (tag, components, environment).
The workflow calls exactly this script, so the deploy and the check that follows it live in
one place rather than in two that drift apart — the same reason the script exists at all.

Before deploying, the script checks whether the image is readable anonymously and picks the
route from the answer: straight out of GHCR, or via a mirror into Fly's registry (above).
Mirroring needs docker; if it's missing and the package is private, the script says so up
front instead of collapsing halfway through the deploy.

### Adding a component

`deploy/components.json` is the single list of what gets built and where it goes; both
`scripts/deploy.sh` and `.github/workflows/build.yml` read it. A new component is an entry
there, with no edits to the script or the workflow. The v2 stack arrives the same way once
`server-v2/` exists.

A staging environment follows the same naming rule: config `deploy/hub.fly.dev.toml`, app
`crossade-deck-hub-dev`, invoked as `DEPLOY_ENV=dev scripts/deploy.sh hub`.

### One-time setup

1. A `FLY_API_TOKEN` repository secret (`fly tokens create deploy`).
2. `fly apps create crossade-deck-hub`.
3. After the first build, make the packages public: GitHub → Packages → each of
   `crossade-deck/{server,hub}` → Package settings → Change visibility → Public. GHCR creates
   packages private even in a public repository, and Fly pulls anonymously.
4. For the catalogue: Settings → Pages → Source: **GitHub Actions**. Nothing else — the workflow
   publishes into the `github-pages` environment itself.

Machines sleep between visits (`min_machines_running = 0`), so the first request after a pause
takes a few seconds to wake them. For the server that is expected — rooms live in memory only, and
a restart already ends every game anyway.

### CI

Three workflows, split along the seam between "an artifact exists" and "production changed":

- **`ci.yml`** — tests on every push: the server, and the whole workspace tree (kit, presets,
  apps — types, tests, both app builds and the catalogue build). On `main`, once they're green, it
  calls `build.yml` through `uses:`. It has to be a call and not a separate workflow: the `needs:` gate only
  exists inside ONE run, and two independent workflows would start in parallel — an
  unverified image would reach the registry.

  The list of workspaces is DERIVED from `package.json` (`scripts/workspaces.mjs`), not retyped
  into the workflow, and `scripts/check-ci.mjs` guards the seam — run it by hand with
  `npm run check:ci`. Both exist because the hand-written list was outgrown once already: jobs
  named `client` and `client2` long after those directories left git, and the kit, the presets and
  the apps were not in CI at all. Nobody noticed, because every commit carried `[skip ci]` and the
  workflow simply never ran.
- **`build.yml`** — builds every component from `deploy/components.json` as a matrix and
  pushes to GHCR. Also runnable by hand for any branch.
- **`deploy.yml`** — the button. Takes a tag and components, runs `scripts/deploy.sh`.

`main` does NOT deploy. The chain stops at the image: green tests → `build.yml` → GHCR, and
production moves only when `deploy.yml` is pressed. Building and deploying are decisions of
different weight — an image in the registry is visible to nobody but the registry, a deploy is
visible to the player — and that same split is where the rollback comes from: deploy a tag that
already exists instead of reverting and rebuilding.

However it is invoked, `deploy.yml` takes the IMMUTABLE `sha-<commit>` tag rather than the moving
`main` one: that pointer could already have moved on to the next build by deploy time, and
something other than what was tested would ship.

The image reaches Fly by one of two routes, and `scripts/deploy.sh` picks it: a public
package Fly pulls straight from GHCR; a private one the script mirrors BYTE FOR BYTE into
`registry.fly.io` and deploys from there. That keeps deploys independent of a one-off
"make the package public" click — GitHub has no API for package visibility, only a button in
the web UI. GHCR stays the artifact store either way, the place the image can be taken from
to anywhere else.

Four things the workflows have to get right, and all four are easy to miss:

- `fetch-depth: 0` on checkout. The build number is the commit count; the default shallow
  clone would make it a permanent "1".
- `cancel-in-progress: false` on the deploy. A flyctl cancelled halfway leaves the app in a
  partial state, so runs queue instead of superseding each other.
- `provenance: false` on the build. With attestation manifests what lands in the registry is
  an OCI index, while `fly deploy --image` and the anonymous pull check expect a plain one.
- `fail-fast: false` on the matrix. A broken hub shouldn't cancel an almost-finished server: the
  images are independent, and half the artifacts beat none.

The deploy needs a `FLY_API_TOKEN` secret in the repository (Settings → Secrets and
variables → Actions). Create one with `fly tokens create deploy`. Pushing to GHCR needs no
secret — the workflow's own `GITHUB_TOKEN` is enough.
