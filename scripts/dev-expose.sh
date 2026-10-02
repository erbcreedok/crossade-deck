#!/usr/bin/env bash
# ДЕВ С МАКА В TAILNET — открывает дизайн-стенды и дев-вид стола устройствам вашего tailnet (телефону, Voyager), откуда бы
# ни был Мак: имя `macbook-pro-giyers` в tailnet не меняется от смены Wi-Fi. Только tailnet — `serve`, не `funnel`: из интернета
# недоступно.
#
#   scripts/dev-expose.sh          # открыть
#   scripts/dev-expose.sh off      # закрыть
#   scripts/dev-expose.sh status
#
# Сами стенды запускаются как раньше (`*-stand` в .claude/launch.json). Порты — те же, что у стендов: http://<имя>:<порт>.
# 443 и 8443 на этом узле заняты Funnel запасного узла (прод), поэтому для HTTPS берётся 10000.
set -euo pipefail
TS="${TAILSCALE:-/Applications/Tailscale.app/Contents/MacOS/Tailscale}"
[[ -x "$TS" ]] || TS="$(command -v tailscale)"
# Порты стендов (design/*), 3D-стол из table3d и хаб.
PORTS=(9573 9576 9577 9578 9579 9581 9584 9585 9586 9569 9590)
# Стенд, которому нужен HTTPS на телефоне (камера, гироскоп): design/ar.
AR_PORT=9582

host() { "$TS" status --json 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))"; }

case "${1:-on}" in
  on)
    for p in "${PORTS[@]}"; do "$TS" serve --bg --tcp="$p" "tcp://localhost:$p" >/dev/null 2>&1 || echo "порт $p: не вышло" >&2; done
    "$TS" serve --bg --https=10000 "http://127.0.0.1:$AR_PORT" >/dev/null 2>&1 || echo "AR https: не вышло" >&2
    H="$(host)"
    echo "Открыто в tailnet (устройства tailnet, откуда угодно):"
    for p in "${PORTS[@]}"; do echo "  http://$H:$p"; done
    echo "  https://$H:10000   ← AR (камера и гироскоп требуют HTTPS)"
    ;;
  off)
    for p in "${PORTS[@]}"; do "$TS" serve --tcp="$p" off >/dev/null 2>&1 || true; done
    "$TS" serve --https=10000 off >/dev/null 2>&1 || true
    echo "закрыто"
    ;;
  status) "$TS" serve status ;;
  *) echo "usage: $0 [on|off|status]" >&2; exit 2 ;;
esac
