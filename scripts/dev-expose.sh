#!/usr/bin/env bash
# ДЕВ С МАКА В TAILNET — по HTTPS, с настоящим сертификатом, только устройствам вашего tailnet (телефону, Voyager). Мак доступен по
# имени `macbook-pro-giyers…ts.net` откуда бы он ни был: смена Wi-Fi имя не меняет. `serve`, не `funnel`: из интернета не видно.
#
#   scripts/dev-expose.sh          # открыть
#   scripts/dev-expose.sh off      # закрыть
#   scripts/dev-expose.sh status
#
# HTTPS на узле можно открыть только на портах 443, 8443 и 10000, а 443 занят запасным столом (Funnel). Поэтому две двери:
#
#   :10000  → все дизайн-стенды разом, по путям: /hud3d/, /hud/, /ar/ …   (один сервер `design/serve.py 9585 design`,
#             в .claude/launch.json — `skinmaker-stand`; запустить его надо до этого скрипта)
#   :8443   → 3D-стол из table3d (vite, порт 9590, `table3d` в .claude/launch.json)
#
# AR и всё, что просит камеру или гироскоп, открывать по HTTPS-адресу :10000/ar/ — обычный http телефон не даст.
set -euo pipefail
TS="${TAILSCALE:-/Applications/Tailscale.app/Contents/MacOS/Tailscale}"
[[ -x "$TS" ]] || TS="$(command -v tailscale)"
STANDS_PORT=9585
TABLE3D_PORT=9590

host() { "$TS" status --json 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))"; }
listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }

case "${1:-on}" in
  on)
    listening "$STANDS_PORT" || echo "! :$STANDS_PORT не слушает — запусти стенд skinmaker-stand, иначе :10000 будет пустым" >&2
    listening "$TABLE3D_PORT" || echo "! :$TABLE3D_PORT не слушает — запусти table3d, иначе :8443 будет пустым" >&2
    "$TS" serve --bg --https=10000 "http://127.0.0.1:$STANDS_PORT" >/dev/null
    "$TS" serve --bg --https=8443 "http://127.0.0.1:$TABLE3D_PORT" >/dev/null
    H="$(host)"
    echo "Открыто в tailnet (только ваши устройства, откуда угодно):"
    echo "  https://$H:10000/            ← все стенды: /hud3d/ /hud/ /tophud/ /table/ /rooms/ /hubhome/ /grab/ /ar/ /persona/ /skinmaker/"
    echo "  https://$H:8443/             ← 3D-стол (table3d)"
    ;;
  off)
    "$TS" serve --https=10000 off >/dev/null 2>&1 || true
    "$TS" serve --https=8443 off >/dev/null 2>&1 || true
    echo "закрыто"
    ;;
  status) "$TS" serve status ;;
  *) echo "usage: $0 [on|off|status]" >&2; exit 2 ;;
esac
