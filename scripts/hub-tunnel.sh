#!/usr/bin/env bash
# THE HUB, HANDED OUT THROUGH A TUNNEL — the local Mac's own game hub, reachable from a phone that
# is not on this WiFi, the same way `kit-tunnel.sh` hands out the kit's catalog.
#
# A quick Cloudflare tunnel (`cloudflared tunnel --url`) has no domain and no memory: its address is
# minted on every start and dies with the process. So this script does not "start a tunnel", it
# answers the question "where is the hub right now": a live tunnel whose address still answers is
# reported as is; a dead or missing one is replaced, and the hub itself is started first if nothing
# listens on :9569. Idempotent — run it as often as you like, including from the bot before every
# link it sends.
#
#   scripts/hub-tunnel.sh            # prints the https://…trycloudflare.com address, nothing else on stdout
#   scripts/hub-tunnel.sh --fresh    # kills the tunnel and mints a new address regardless
set -euo pipefail
FRESH=""
for arg in "$@"; do
  case "$arg" in
    --fresh) FRESH=1 ;;
  esac
done
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="/tmp/crossade-hub-tunnel.log"
DEV_LOG="/tmp/crossade-hub-dev.log"
PORT=9569
mkdir -p "$ROOT/.agent/tmp"
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:/opt/homebrew/bin:$PATH"

say() { echo "$*" >&2; }

# 1. The hub itself.
if ! curl -sf -o /dev/null "http://localhost:$PORT/"; then
  say "hub is not up on :$PORT — starting it"
  (cd "$ROOT/apps/hub" && nohup npm run dev > "$DEV_LOG" 2>&1 &)
  for _ in $(seq 1 45); do
    sleep 2
    curl -sf -o /dev/null "http://localhost:$PORT/" && break
  done
  curl -sf -o /dev/null "http://localhost:$PORT/" || { say "hub did not come up — see $DEV_LOG"; exit 1; }
fi

# 2. A tunnel that is alive AND whose address still answers is the answer.
url_from_log() { grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" 2>/dev/null | tail -1 || true; }
alive() { pgrep -f "cloudflared tunnel --url http://127.0.0.1:$PORT" >/dev/null; }
if [[ -z "$FRESH" ]] && alive; then
  URL="$(url_from_log)"
  if [[ -n "$URL" ]] && curl -sf -o /dev/null --max-time 15 "$URL/"; then
    echo "$URL"; exit 0
  fi
  say "tunnel process is up but its address no longer answers — replacing"
fi

# 3. Otherwise: a new one.
pkill -f "cloudflared tunnel --url http://127.0.0.1:$PORT" 2>/dev/null || true
sleep 1
: > "$LOG"
(nohup cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate > "$LOG" 2>&1 &)
URL=""
for _ in $(seq 1 30); do
  sleep 1
  URL="$(url_from_log)"
  [[ -n "$URL" ]] && break
done
[[ -n "$URL" ]] || { say "cloudflared gave no address — see $LOG"; exit 1; }
for _ in $(seq 1 15); do
  curl -sf -o /dev/null --max-time 10 "$URL/" && { echo "$URL"; exit 0; }
  sleep 2
done
say "address minted but not answering yet: $URL — try again in a minute"
echo "$URL"
