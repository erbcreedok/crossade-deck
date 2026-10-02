#!/usr/bin/env bash
# ВЫКАТКА НА VOYAGER — запускается НА Voyager: `git pull` → зависимости, если менялись → перезапуск.
#
#   scripts/deploy-voyager.sh prod            # ~/repo, ветка main — стол и бот, которым пользуются люди
#   scripts/deploy-voyager.sh dev [ветка]     # ~/repo-dev, ветка из аргумента, иначе из ~/.crossade-dev-branch, иначе main
#   с Мака:  ssh voyager 'cd ~/repo && scripts/deploy-voyager.sh prod'
#
# Прод — только вручную: перезапуск стола обрывает живые партии, и решает это человек, а не таймер. Дев
# обновляется сам (`crossade-pull-dev.timer`, раз в минуту, если на ветке появился новый коммит).
# Тянет только fast-forward: правки, сделанные прямо на Voyager и не отправленные, не затираются и не
# сливаются молча — скрипт остановится и скажет.
set -euo pipefail
export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"

ENV="${1:-prod}"
case "$ENV" in
  prod) DIR="$HOME/repo"; BRANCH="main"; SERVICES=(crossade-table crossade-bot); HEALTH="http://127.0.0.1:2590/health" ;;
  dev)
    DIR="$HOME/repo-dev"
    BRANCH="${2:-$(cat "$HOME/.crossade-dev-branch" 2>/dev/null || echo main)}"
    SERVICES=(crossade-dev-table crossade-dev-stands); HEALTH="http://127.0.0.1:2591/health" ;;
  *) echo "usage: $0 prod|dev [ветка]" >&2; exit 2 ;;
esac
[[ "$ENV" == dev && -n "${2:-}" ]] && echo "$2" > "$HOME/.crossade-dev-branch"

cd "$DIR"
git fetch -q origin "$BRANCH"
OLD="$(git rev-parse HEAD)"
if [[ "$(git rev-parse --abbrev-ref HEAD)" != "$BRANCH" ]]; then
  git checkout -q "$BRANCH" 2>/dev/null || git checkout -q -b "$BRANCH" "origin/$BRANCH"
  OLD="$(git rev-parse HEAD)"
fi
NEW="$(git rev-parse "origin/$BRANCH")"
if [[ "$OLD" == "$NEW" && -z "${FORCE:-}" ]]; then echo "[$ENV] уже актуально: ${NEW:0:8}"; exit 0; fi
git merge --ff-only -q "origin/$BRANCH" || { echo "[$ENV] не fast-forward: на $DIR есть свои коммиты — разберись руками" >&2; exit 1; }

changed="$(git diff --name-only "$OLD" "$NEW")"
for pkg in server bot table3d; do
  if [[ ! -d "$pkg/node_modules" ]] || grep -qE "^$pkg/(package\.json|package-lock\.json)$" <<<"$changed"; then
    echo "[$ENV] зависимости: $pkg"
    # Лок бота в репозитории не хранится (.gitignore), а `npm install` на npm 10.9 падает на peer-зависимостях vitest.
    if [[ "$pkg" == bot ]]; then (cd bot && npm install --legacy-peer-deps --no-audit --no-fund >/dev/null)
    else (cd "$pkg" && npm ci --no-audit --no-fund >/dev/null); fi
  fi
done

for s in "${SERVICES[@]}"; do systemctl --user restart "$s"; done
for i in $(seq 1 30); do
  out="$(curl -fsS --max-time 3 "$HEALTH" 2>/dev/null)" && { echo "[$ENV] ${NEW:0:8} выкачен: $out"; exit 0; }
  sleep 1
done
echo "[$ENV] перезапущено, но $HEALTH не отвечает — смотри: journalctl --user -u ${SERVICES[0]} -n 30" >&2
exit 1
