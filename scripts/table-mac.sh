#!/usr/bin/env bash
# СТОЛ НА ЭТОМ МАКЕ — сервер стола и туннель к нему, одной командой.
#
# Столы и HTML-клиент живут здесь, а не на Fly: правка долетает до телефона следующим открытием
# Mini App, без деплоя. Снаружи мак виден через быстрый туннель Cloudflare; его адрес новый на каждом
# запуске, поэтому сервер сам сообщает его реле на Fly маяком (`TABLE_RELAY_URL`), и постоянная
# ссылка `<fly>/t/` всегда ведёт сюда. Выключил мак — маяк замолчал, и бот отвечает «недоступно».
#
#   scripts/table-mac.sh           # переменные — из server/.env.table
#
# server/.env.table:
#   TELEGRAM_BOT_TOKEN=…           подпись Mini App
#   TABLE_SECRET=…                 тот же, что у бота и у реле на Fly
#   TABLE_RELAY_URL=https://crossade-deck-server.fly.dev
#   PORT=2590                      не 2567: там может жить сервер дев-кита
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/server/.env.table"
[[ -f "$ENV_FILE" ]] || { echo "нет $ENV_FILE — см. шапку скрипта" >&2; exit 1; }
set -a; source "$ENV_FILE"; set +a
PORT="${PORT:-2590}"
LOG_DIR="/tmp"
mkdir -p "$LOG_DIR"
TUNNEL_LOG="$LOG_DIR/crossade-table-tunnel.log"

cleanup() { [[ -n "${TUNNEL_PID:-}" ]] && kill "$TUNNEL_PID" 2>/dev/null || true; }
trap cleanup EXIT

: > "$TUNNEL_LOG"
cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
URL=""
for _ in $(seq 1 30); do
  sleep 1
  URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" | tail -1 || true)"
  [[ -n "$URL" ]] && break
done
[[ -n "$URL" ]] || { echo "туннель не дал адреса — см. $TUNNEL_LOG" >&2; exit 1; }
echo "стол виден снаружи: $URL/table/  (стенд: $URL/table/?stand)" >&2

cd "$ROOT/server"
# Не `exec`: туннель должен умереть вместе с сервером, а `trap` после `exec` уже не сработает.
TABLE_PUBLIC_URL="$URL" PORT="$PORT" npx tsx watch src/index.ts
