# Deploying Crossade Deck via Cloudflare Tunnel

Instructions for setting the project up on your own server. Nothing needs to be
exposed to the outside: the server keeps an outbound connection to Cloudflare, ports
80/443 on the machine can be left untouched, and TLS + the domain live on
Cloudflare's side.

## What the project is

A monorepo of two Node parts:

- `server/` — the game server on Colyseus (Express + WebSocket), listens on **:2567**.
  HTTP endpoints (`/accounts*`, `/rooms*`, `/health`, `/matchmake*`) and the game
  socket live on the same port.
- `client/` — React + Vite, built into static files (`client/dist`), no SSR. The
  server address is **baked into the bundle at build time**, so the client must be
  built once the final domains are known.

Requirements: **Node 20+** (tested on 22 LTS), git. Nothing else — no database, no
Redis. Account data lives in the JSON file `server/data/accounts.json`.

## Layout

Two public hosts on one server — the simplest setup for a tunnel, because the
Colyseus socket lives at the root (`/{processId}/{roomId}`) and can't be told apart
from static assets by path alone:

```
browser ──https──> Cloudflare ──tunnel──> cloudflared ─┬─ 127.0.0.1:8080  static client/dist
             wss                                       └─ 127.0.0.1:2567  Colyseus (API + socket)
```

- `crossade.EXAMPLE.com` → client static files
- `api.crossade.EXAMPLE.com` → game server

CORS is already open on the server (`Access-Control-Allow-Origin: *`), so different
hosts for the client and the API is a working configuration — no code changes needed.

Hostnames can be anything; below they show up in three places: the client's
`.env.production`, the tunnel's `config.yml`, and Cloudflare's DNS records.

## 1. Build the project

```bash
git clone <repo-url> ~/crossade-deck
cd ~/crossade-deck/server && npm ci && npm run build
```

Build the client only after the domains are decided. Use `wss://` and `https://`
without exception: an HTTPS page won't open an insecure socket.

```bash
cd ~/crossade-deck/client
cat > .env.production <<'EOF'
VITE_SERVER_URL=wss://api.crossade.EXAMPLE.com
VITE_HTTP_URL=https://api.crossade.EXAMPLE.com
EOF
npm ci && npm run build
```

Confirm the domain actually made it into the bundle:

```bash
grep -c "api.crossade.EXAMPLE.com" dist/assets/index-*.js
```

> ⚠️ If a `client/.env.local` happens to be sitting nearby, it overrides
> `.env.production` even in a production build. It's not committed to git and
> shouldn't exist on the server.

## 2. Start two local processes

**Game server:**

```bash
cd ~/crossade-deck/server && PORT=2567 NODE_ENV=production node dist/index.js
```

**Client static files** (needs an SPA fallback — invite links look like `/r/CODE`,
and without a fallback a reload gives a 404):

```bash
npx serve -s ~/crossade-deck/client/dist -l 8080
```

Any static server with an `index.html` fallback works — nginx, Caddy, whatever
you're used to. Port 8080 only matters for the tunnel config from here on.

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
`ExecStart=/usr/bin/npx serve -s /home/YOUR_USER/crossade-deck/client/dist -l 8080`
(or hand it off to nginx/Caddy if either is already on the machine).

```bash
systemctl daemon-reload && systemctl enable --now crossade-deck
```

Logs: `journalctl -u crossade-deck -f`, `journalctl -u cloudflared -f`.

## 5. Verify

```bash
curl https://api.crossade.EXAMPLE.com/health
```

Expect `{"status":"ok"}`. Then open `https://crossade.EXAMPLE.com` in a browser: a
profile gets created, and in DevTools → Network there should be a
`101 Switching Protocols` upgrade to `wss://api.crossade.EXAMPLE.com/...`.

If the page loads but the game won't connect — it's almost always a wrong address
baked into the bundle (step 1), or the socket hitting a host without the Cloudflare
proxy.

## 6. Updating

```bash
cd ~/crossade-deck && git pull
cd server && npm ci && npm run build
cd ../client && npm ci && npm run build
sudo systemctl restart crossade-deck
```

No need to restart the static server — `serve` reads files straight off disk. The
client will most likely need a hard reload.

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

- Firebase is in the dependencies but unused and unconfigured — no keys needed,
  sign-in works through custom accounts with a recovery code.
- The server has no required environment variables besides `PORT` (defaults to 2567).
- The recovery code is copied via `navigator.clipboard` — works only in a secure
  context, i.e. over HTTPS. That's automatic through the tunnel, but the copy button
  will break over a "bare" IP.

## Fly.io (current production)

Three apps, region `fra`:

| app | what it is | config |
| --- | --- | --- |
| `crossade-deck-server` | the v1 game server (Colyseus) | `server/fly.toml` |
| `crossade-deck-client` | nginx: client v1 at `/`, client2 at `/v2/` | `client/fly.toml` |
| `crossade-deck-storybook` | the canvas UI-kit catalogue | `deploy/storybook.fly.toml` |

The storybook is additionally published to **GitHub Pages** —
https://erbcreedok.github.io/crossade-deck/. That's not a duplicate but a split of roles: the
image on Fly is an artifact like any other (same pipeline, same rollback by tag, deployable to
your own server), while Pages is the shop window: free, no cold start, with a link you can hand
to anyone. What goes to Pages is the static EXTRACTED FROM THE ALREADY BUILT IMAGE
(`docker create` + `docker cp` in the `pages` job), not built a second time: a second build is a
second artifact, and one day it diverges from the first. This works only because
`.storybook/main.ts` sets `base: "./"` — Pages serves the site from the `/crossade-deck/`
subpath, and an absolute base would 404 every asset.

### The artifact is one decision, the deploy is another

Fly no longer builds anything. GitHub Actions builds the images and puts them in GHCR;
`fly deploy` only says which one to take. Everything else follows from that:

- a **rollback** is deploying an older tag, not a revert plus a rebuild;
- what reaches production is THE SAME image that was tested, not one "built from the same
  commit";
- that same image can go somewhere else — your own server, a staging box — unrebuilt.

```
push to main → green tests → ghcr.io/erbcreedok/crossade-deck/{server,web,storybook}
                                       ↓ (a separate decision)
                             Actions → Выкатка   |   scripts/deploy.sh
```

Every image carries three tags: `sha-<commit>` (immutable, the primary handle),
`build-<number>` (the very number in the version signature) and `main` — a moving pointer
at the latest build.

### Deploying

```bash
scripts/deploy.sh                            # everything, latest build off main
scripts/deploy.sh web                        # one component
IMAGE_TAG=sha-abc1234 scripts/deploy.sh web  # a specific build; this is also the rollback
DEPLOY_ENV=dev scripts/deploy.sh web         # another environment (looks for client/fly.dev.toml)
BUILD_FROM_SOURCE=1 scripts/deploy.sh server # fallback: build on Fly, bypassing GHCR
```

The same via a button: Actions → **Выкатка** → Run workflow (tag, components, environment).
The workflow calls exactly this script, so the deploy and the check that follows it live in
one place rather than in two that drift apart — the same reason the script exists at all.

Before deploying, the script checks whether the image is readable anonymously and picks the
route from the answer: straight out of GHCR, or via a mirror into Fly's registry (above).
Mirroring needs docker; if it's missing and the package is private, the script says so up
front instead of collapsing halfway through the deploy.

### The server address is runtime, not baked in

`client/fly.toml` used to bake `VITE_SERVER_URL` into the bundle at build time, which tied
the image to one environment: putting it on a staging box meant rebuilding it, i.e.
deploying a DIFFERENT artifact. The address now arrives through environment variables:

`[env]` in `client/fly.toml` → `deploy/runtime-config.sh` writes `/config.js` at container
start → `client/src/runtimeConfig.ts` reads `window.__CROSSADE_CONFIG__`.

Order: runtime → baked via `VITE_*` → `localhost`. The middle step is kept deliberately —
`docker-compose.yml` builds the old way and works untouched. `/config.js` is served with
`Cache-Control: no-store`: a cached copy would mean the browser keeps hitting the old
address after the server moves, with a perfectly "correct" image deployed.

A side effect: the server-before-client order is no longer required — there's nothing left
to bake.

### Adding a component

`deploy/components.json` is the single list of what gets built and where it goes; both
`scripts/deploy.sh` and `.github/workflows/build.yml` read it. A new component is an entry
there, with no edits to the script or the workflow. The v2 stack arrives the same way once
`server-v2/` exists.

A staging environment follows the same naming rule: config `client/fly.dev.toml`, app
`crossade-deck-client-dev`, invoked as `DEPLOY_ENV=dev scripts/deploy.sh web`.

### One-time setup

1. A `FLY_API_TOKEN` repository secret (`fly tokens create deploy`).
2. `fly apps create crossade-deck-storybook`.
3. After the first build, make the packages public: GitHub → Packages → each of
   `crossade-deck/{server,web,storybook}` → Package settings → Change visibility → Public.
   GHCR creates packages private even in a public repository, and Fly pulls anonymously.

The version shows up in three places: at the bottom of the lobby screen, in the settings
menu (full form, with commit and build time), and in the server's `/health`. If the client
and the server disagree, that's the first thing to check when something works for one
player and not another.

Machines sleep between visits (`min_machines_running = 0`), so the first request after a
pause takes a few seconds to wake the server. That's expected — rooms live in memory only,
and a restart already kicks everyone out anyway.

### Where this is heading: the v2 stack

Everything above is the v1 stack, and it is on its way out. The live stack moves into a
SEPARATE app, `crossade-deck-v2` (one container: nginx + node server-v2, client2 at `/`,
`/api/` proxied into node); v1 is not edited by a single line and is deleted wholesale
later. The full analysis, ready-to-paste configs and the reason behind every trap are in
`SERVER-V2-INFRA-HANDOFF.md`; the work breakdown is epic #43.

Until then this section describes the current deploy: freezing v1 (#51) hasn't happened
yet, and `scripts/deploy.sh` still deploys v1 by default. The pipeline is ready for the
move: the v2 stack is added as an entry in `deploy/components.json`
(`deploy/v2/Dockerfile`, `deploy/v2/fly.toml`), and freezing v1 comes down to removing the
`server` and `web` entries from it — no edits to the script or the workflows. The handoff's
§A7 wording about a new target in `deploy.sh` is stale by the same token: there are no
targets any more, there is a list of components.

### Two clients on one domain (`/` and `/v2/`)

`crossade-deck-client` serves BOTH clients from one nginx image: the old client (`client/`)
at `/`, and the new one (`client2/`) temporarily at `/v2/`. The image is built from the
**repo root** by `deploy/web.Dockerfile` (it needs both folders) with `deploy/nginx.conf`
(a `/v2/` location with its own SPA fallback, before the general `/`). `scripts/deploy.sh`
builds the client from the root with `--config client/fly.toml --dockerfile
deploy/web.Dockerfile`, so the app name and the server address (`VITE_*`) still come from
`client/fly.toml`. `client2` builds with Vite `base: '/v2/'` (production mode only), so its
assets and routing are prefixed; a broken v2 is gated by its own CI job.

Switching between versions is a deliberately faint corner link in the UI: `v2` in the old
client (bottom-left, next to the version), `v1` in the new one. In production both are same-
origin (`/v2/` and `/`); locally they point at the other dev port (5173 ↔ 5174).

### CI

Three workflows, split along the seam between "an artifact exists" and "production changed":

- **`ci.yml`** — tests on every push. On `main`, once they're green, it calls `build.yml`
  through `uses:`. It has to be a call and not a separate workflow: the `needs:` gate only
  exists inside ONE run, and two independent workflows would start in parallel — an
  unverified image would reach the registry.
- **`build.yml`** — builds every component from `deploy/components.json` as a matrix and
  pushes to GHCR. Also runnable by hand for any branch.
- **`deploy.yml`** — the button. Takes a tag and components, runs `scripts/deploy.sh`.

`main` does deploy automatically, but through that same `deploy.yml` and by the IMMUTABLE
`sha-<commit>` tag rather than the moving `main` one: otherwise the pointer could already
have moved on to the next build by deploy time, and something other than what was tested
would ship. The same workflow is invoked by hand with any other tag — which is where the
rollback comes from.

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
- `fail-fast: false` on the matrix. A broken storybook shouldn't cancel an almost-finished
  server: the images are independent, and half the artifacts beat none.

The deploy needs a `FLY_API_TOKEN` secret in the repository (Settings → Secrets and
variables → Actions). Create one with `fly tokens create deploy`. Pushing to GHCR needs no
secret — the workflow's own `GITHUB_TOKEN` is enough.
