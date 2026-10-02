# ЗАПАСНОЙ УЗЕЛ НА FLY: стол + бот + надзиратель (`standby.mjs`). Контекст сборки — КОРЕНЬ репозитория:
#   fly deploy . --config deploy/fly-standby/fly.toml --dockerfile deploy/fly-standby/Dockerfile
#
# Стол собирается как в `deploy/table.Dockerfile`; бот берёт контракт стола из `server/src`, поэтому
# исходники сервера кладутся и рядом с ботом. Бот запускается через tsx: у него нет своей сборки в dist.

FROM node:22-alpine AS build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/scripts/buildTableClient.ts ./scripts/
COPY server/table-client ./table-client
COPY look/src /app/look/src
COPY game-kit/src /app/game-kit/src
# 3D-вид стола собирается из `table3d/` — страница и исходники экрана.
COPY table3d/index.html /app/table3d/index.html
COPY table3d/src /app/table3d/src
COPY game-presets/cards/src/decks/baked /app/game-presets/cards/src/decks/baked
# `table3d/` лежит рядом с `server/`, а `three` — в node_modules сервера: ссылка в образе, чтобы esbuild нашёл его от исходников 3D.
RUN ln -s /app/server/node_modules /app/table3d/node_modules && npm run build && npm run build:table-client

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/server/dist ./dist
ENV TABLE_CLIENT_DIR=/app/dist/table-client

# Бот и то, что он берёт из сервера.
COPY server/src /app/server/src
# Лок бота в репозитории намеренно не хранится (`.gitignore`) — ставим без него.
COPY bot/package.json /app/bot/
RUN cd /app/bot && NODE_ENV=development npm install --legacy-peer-deps --no-audit --no-fund
COPY bot/src /app/bot/src
COPY bot/tsconfig.json /app/bot/

# Надзиратель и его решения.
COPY deploy/failover/decide.mjs /app/failover/decide.mjs
COPY deploy/fly-standby/standby.mjs /app/fly-standby/standby.mjs

CMD ["node", "/app/fly-standby/standby.mjs"]
