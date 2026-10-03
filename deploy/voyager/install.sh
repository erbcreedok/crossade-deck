#!/usr/bin/env bash
# Ставит дев-юниты Voyager и пробрасывает дев в tailnet (только tailnet — `serve`, не `funnel`).
# Запускается НА Voyager один раз: `bash ~/repo/deploy/voyager/install.sh`.
set -euo pipefail
export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"
cd "$(dirname "$0")"
mkdir -p ~/.config/systemd/user
if [[ ! -d "$HOME/repo-dev" ]]; then gh repo clone erbcreedok/crossade-deck "$HOME/repo-dev"; fi
(cd ~/repo-dev && for p in server table3d; do (cd $p && npm ci --no-audit --no-fund >/dev/null); done; mkdir -p server/data bot/data
 # Лок бота в репозитории не хранится, а npm 10.9 падает на peer-зависимостях vitest.
 cd bot && npm install --legacy-peer-deps --no-audit --no-fund >/dev/null)
cp crossade-dev-table.service crossade-dev-stands.service crossade-dev-bot.service crossade-pull-dev.service crossade-pull-dev.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now crossade-dev-table crossade-dev-stands crossade-pull-dev.timer
# Дев-бот стартует, только когда есть его файл окружения (токен кладёт владелец).
[[ -f "$HOME/repo-dev/bot/.env" ]] && systemctl --user enable --now crossade-dev-bot || echo "дев-бот: нет ~/repo-dev/bot/.env — токен и адреса не заданы, бот не запущен" 
TS="$HOME/.local/tailscale/tailscale --socket=$HOME/.local/tailscale/tailscaled.sock"
$TS serve --bg --https=8443 http://127.0.0.1:2591
$TS serve --bg --https=10000 http://127.0.0.1:9585
$TS serve status
