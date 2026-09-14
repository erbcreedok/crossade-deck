#!/usr/bin/env bash
# THE CATALOG, HANDED OUT THROUGH A TUNNEL — and the one address that is currently true.
#
# A quick Cloudflare tunnel (`cloudflared tunnel --url`) has no domain and no memory: its address
# is minted on every start and dies with the process. So this script does not "start a tunnel", it
# answers the question "where is the catalog right now": a live tunnel whose address still answers
# is reported as is; a dead or missing one is replaced, and the catalog itself is started first if
# nothing listens on :9567. Idempotent — run it as often as you like.
#
#   scripts/kit-tunnel.sh                    # prints the https://…trycloudflare.com address, nothing else on stdout
#   scripts/kit-tunnel.sh --fresh            # kills the tunnel and mints a new address regardless
#   scripts/kit-tunnel.sh live-chess--chess  # prints the address OF THAT STORY, full screen (what a phone wants)
#   scripts/kit-tunnel.sh --fresh live-chess--chess
set -euo pipefail
FRESH=""; STORY=""
for arg in "$@"; do
  case "$arg" in
    --fresh) FRESH=1 ;;
    *) STORY="$arg" ;;
  esac
done
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="/tmp/crossade-kit-tunnel.log"
SB_LOG="/tmp/crossade-storybook.log"
PORT=9567
mkdir -p "$ROOT/.agent/tmp"
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:/opt/homebrew/bin:$PATH"

say() { echo "$*" >&2; }
# A story id turns the bare address into the place to LOOK: the canvas alone, full screen, which is
# what a phone wants; without one, the catalog's front door.
out() { if [[ -n "$STORY" ]]; then echo "$1/iframe.html?id=$STORY&viewMode=story"; else echo "$1"; fi; }

# 1. The catalog itself.
if ! curl -sf -o /dev/null "http://localhost:$PORT/index.json"; then
  say "catalog is not up on :$PORT — starting it"
  (cd "$ROOT/game-kit" && nohup npm run dev > "$SB_LOG" 2>&1 &)
  for _ in $(seq 1 45); do
    sleep 2
    curl -sf -o /dev/null "http://localhost:$PORT/index.json" && break
  done
  curl -sf -o /dev/null "http://localhost:$PORT/index.json" || { say "catalog did not come up — see $SB_LOG"; exit 1; }
fi

# 2. A tunnel that is alive AND whose address still answers is the answer.
url_from_log() { grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" 2>/dev/null | tail -1 || true; }
alive() { pgrep -f "cloudflared tunnel --url http://127.0.0.1:$PORT" >/dev/null; }
if [[ -z "$FRESH" ]] && alive; then
  URL="$(url_from_log)"
  if [[ -n "$URL" ]] && curl -sf -o /dev/null --max-time 15 "$URL/index.json"; then
    out "$URL"; exit 0
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
  curl -sf -o /dev/null --max-time 10 "$URL/index.json" && { out "$URL"; exit 0; }
  sleep 2
done
say "address minted but not answering yet: $URL — try again in a minute"
out "$URL"
