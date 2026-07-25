#!/usr/bin/env bash
# Выкатка на Fly.io обеих апп с проставленным номером сборки.
#
# Зачем скрипт, а не два `fly deploy` руками:
#   1) ПОРЯДОК. Клиент вшивает адрес сервера в бандл на этапе сборки, поэтому сервер
#      выкатывается первым. Наоборот — и клиент уедет со старым адресом.
#   2) НОМЕР СБОРКИ. В контекст образа .git не попадает, изнутри его не спросить. Здесь он
#      считается снаружи и передаётся build-аргументом. Голый `fly deploy` соберёт образ с
#      подписью "dev", и по проду нельзя будет понять, что именно на нём крутится.
#
# Использование:
#   scripts/deploy.sh            # обе аппы
#   scripts/deploy.sh server     # только сервер
#   scripts/deploy.sh client     # только клиент
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain)" ]]; then
  echo "!! В рабочем дереве есть несохранённые правки — образ соберётся из них," >&2
  echo "   а номер сборки будет от последнего коммита. Закоммить или отложи их." >&2
  exit 1
fi

APP_BUILD="$(git rev-list --count HEAD)"
APP_COMMIT="$(git rev-parse --short HEAD)"
VERSION="$(node -p "require('./client/package.json').version")"
echo "==> Выкатываю v${VERSION}+${APP_BUILD} (${APP_COMMIT})"

target="${1:-all}"

deploy_one() {
  local dir="$1"
  echo "==> ${dir}"
  (cd "$dir" && flyctl deploy --now \
    --build-arg "APP_BUILD=${APP_BUILD}" \
    --build-arg "APP_COMMIT=${APP_COMMIT}")
}

# Сервер всегда первым: см. пункт 1 выше.
#
# Именно if, а не `[[ ... ]] && deploy_one`: у такой связки с ложным условием код возврата
# ненулевой, и если она стоит ПОСЛЕДНЕЙ, его наследует весь скрипт. `deploy.sh server`
# честно выкатывал сервер и завершался с кодом 1 — на ноутбуке это незаметно, а в CI
# означает красный шаг после успешной выкатки.
if [[ "$target" == "all" || "$target" == "server" ]]; then
  deploy_one server
fi
# Клиент — ОДИН образ на две версии: старый (v1) на «/», новый (v2) на «/v2/». Собирается из
# КОРНЯ репо (нужны обе папки) общим deploy/web.Dockerfile; app-имя и адрес сервера (VITE_*)
# берутся из client/fly.toml. Поэтому не deploy_one (у него контекст = папка), а вызов из корня.
if [[ "$target" == "all" || "$target" == "client" ]]; then
  echo "==> client (v1 → /, v2 → /v2 — общий образ из корня)"
  flyctl deploy --now \
    --config client/fly.toml \
    --dockerfile deploy/web.Dockerfile \
    --build-arg "APP_BUILD=${APP_BUILD}" \
    --build-arg "APP_COMMIT=${APP_COMMIT}" \
    .
fi

echo "==> Готово. Проверка:"
echo "    curl -s https://crusade-deck-server.fly.dev/health"
echo "    открыть https://crusade-deck-client.fly.dev/     — старый клиент (версия внизу)"
echo "    открыть https://crusade-deck-client.fly.dev/v2/  — новый клиент (v2)"
