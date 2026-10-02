#!/usr/bin/env bash
# Ставит дев-юниты Voyager и пробрасывает дев в tailnet (только tailnet — `serve`, не `funnel`).
# Запускается НА Voyager один раз: `bash ~/repo/deploy/voyager/install.sh`.
set -euo pipefail
export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"
cd "$(dirname "$0")"
mkdir -p ~/.config/systemd/user
if [[ ! -d "$HOME/repo-dev" ]]; then gh repo clone erbcreedok/crossade-deck "$HOME/repo-dev"; fi
(cd ~/repo-dev && for p in server table3d; do (cd $p && npm ci --no-audit --no-fund >/dev/null); done; mkdir -p server/data)
cp crossade-dev-table.service crossade-dev-stands.service crossade-pull-dev.service crossade-pull-dev.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now crossade-dev-table crossade-dev-stands crossade-pull-dev.timer
TS="$HOME/.local/tailscale/tailscale --socket=$HOME/.local/tailscale/tailscaled.sock"
$TS serve --bg --https=8443 http://127.0.0.1:2591
$TS serve --bg --https=10000 http://127.0.0.1:9585
$TS serve status
