#!/bin/sh
# Пишет /config.js при старте контейнера — отсюда клиент узнаёт адрес игрового сервера
# (см. client/src/runtimeConfig.ts). Благодаря этому ОДИН образ годится и для прода, и для
# стенда, и для чужого сервера: меняются переменные окружения, а не артефакт.
#
# Кладётся в /docker-entrypoint.d/ образа nginx:alpine — штатный entrypoint сам выполняет
# оттуда все *.sh перед запуском nginx. Свой CMD ради этого заводить не нужно, и обработка
# сигналов остаётся родной.
#
# Файл пишется ВСЕГДА, даже когда переменных нет: пустые значения клиент трактует как
# «не задано» и уходит на вшитые VITE_* — так старые сборки продолжают работать.
set -e

ROOT="${RUNTIME_CONFIG_ROOT:-/usr/share/nginx/html}"

# Кавычка в адресе сломала бы генерируемый JS (и это была бы инъекция, а не опечатка).
# Лучше упасть на старте с внятным текстом, чем отдать битый config.js в браузер.
for value in "${APP_SERVER_URL:-}" "${APP_HTTP_URL:-}"; do
  case "$value" in
    *'"'* | *'\'* | *'<'*)
      echo "runtime-config: недопустимый символ в APP_SERVER_URL/APP_HTTP_URL: $value" >&2
      exit 1
      ;;
  esac
done

cat > "$ROOT/config.js" <<EOF
window.__CRUSADE_CONFIG__ = {
  serverUrl: "${APP_SERVER_URL:-}",
  httpUrl: "${APP_HTTP_URL:-}"
};
EOF

echo "runtime-config: serverUrl=${APP_SERVER_URL:-<вшитый в бандл>} httpUrl=${APP_HTTP_URL:-<вшитый в бандл>}"
