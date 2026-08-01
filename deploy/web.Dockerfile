# Один статический образ на два клиента: СТАРЫЙ (v1) на «/», НОВЫЙ (v2) — временно на «/v2/».
# Контекст сборки — КОРЕНЬ репо (нужны обе папки client/ и client2/), поэтому деплой этого
# образа идёт из корня: см. scripts/deploy.sh (--config client/fly.toml --dockerfile этот файл).
#
# Адрес игрового сервера приезжает В РАНТАЙМЕ (APP_SERVER_URL/APP_HTTP_URL → /config.js,
# см. deploy/runtime-config.sh и client/src/runtimeConfig.ts) — поэтому образ ОДИН на все
# окружения и его можно выкатить куда угодно, не пересобирая. Build-аргументы VITE_* ниже
# оставлены как запасной путь: ими собирается docker-compose.yml, и без переменных окружения
# образ ведёт себя ровно как раньше. Номер сборки/коммит — APP_BUILD/APP_COMMIT.

# --- v1: старый клиент ---
FROM node:22-alpine AS build-v1
WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
ARG VITE_SERVER_URL=ws://localhost:2567
ARG VITE_HTTP_URL=http://localhost:2567
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
ENV VITE_HTTP_URL=${VITE_HTTP_URL}
ARG APP_BUILD=dev
ARG APP_COMMIT=dev
ENV APP_BUILD=${APP_BUILD}
ENV APP_COMMIT=${APP_COMMIT}
RUN npm run build

# --- v2: новый клиент (base=/v2/ в production-режиме vite, см. client2/vite.config.ts) ---
FROM node:22-alpine AS build-v2
WORKDIR /app
COPY client2/package.json client2/package-lock.json ./
RUN npm ci
COPY client2/ ./
ARG APP_BUILD=dev
ARG APP_COMMIT=dev
ENV APP_BUILD=${APP_BUILD}
ENV APP_COMMIT=${APP_COMMIT}
RUN npm run build

# --- раздача ---
FROM nginx:alpine AS runtime
COPY --from=build-v1 /app/dist /usr/share/nginx/html
COPY --from=build-v2 /app/dist /usr/share/nginx/html/v2
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Штатный entrypoint nginx:alpine сам выполняет всё из /docker-entrypoint.d/ перед стартом —
# свой CMD ради одного файла заводить незачем, обработка сигналов остаётся родной.
COPY deploy/runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 80
