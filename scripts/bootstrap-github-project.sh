#!/usr/bin/env bash
#
# bootstrap-github-project.sh — заводит доску GitHub Projects (v2) для Crusade Deck
# и закидывает в неё все открытые issues.
#
# Спутник bootstrap-github-issues.sh: тот создаёт задачи, этот — доску над ними.
#
# Требует scope 'project' у токена gh:
#   gh auth refresh -s project        # интерактивно, откроет браузер
#
# Запуск (РОВНО ОДИН РАЗ — item-add НЕ идемпотентен, второй прогон создаст дубли карточек):
#   bash scripts/bootstrap-github-project.sh

set -euo pipefail
OWNER="erbcreedok"
REPO="erbcreedok/crusade-deck"
TITLE="Crusade Deck — доска"

# ---------------------------------------------------------------- проект
# Ищем проект по названию; если нет — создаём. Так повторный запуск не плодит доски.
num=$(gh project list --owner "$OWNER" --format json \
  --jq ".projects[] | select(.title==\"$TITLE\") | .number" 2>/dev/null | head -1 || true)

if [ -z "${num:-}" ]; then
  num=$(gh project create --owner "$OWNER" --title "$TITLE" --format json --jq '.number')
  echo "==> Создан проект #$num"
else
  echo "==> Проект уже есть: #$num (карточки могут задвоиться — прогоняй скрипт один раз)"
fi

# ---------------------------------------------------------------- наполнение
# Все открытые issues → в доску. Статус по умолчанию — Todo (поле Status проекта v2).
echo "==> Добавляю открытые issues в доску"
gh issue list --repo "$REPO" --state open --limit 100 --json url --jq '.[].url' \
| while read -r url; do
    gh project item-add "$num" --owner "$OWNER" --url "$url" >/dev/null && echo "  + $url"
  done

echo ""
echo "==> Готово. Доска: https://github.com/users/$OWNER/projects/$num"
echo "    Дальше — включить встроенные Workflows проекта (Settings → Workflows):"
echo "      • Auto-add to project        — новые issues/PR сами падают в доску"
echo "      • Item closed → Done         — закрыл issue → карточка в Done"
echo "      • Pull request merged → Done — смёржил PR → Done"
echo "    Это бесплатно и без PAT (в отличие от Actions actions/add-to-project)."
