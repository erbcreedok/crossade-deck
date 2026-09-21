# Сервер столов вместе с HTML-клиентом стола — для хоста, а не для мака.
#
# Контекст сборки — КОРЕНЬ репозитория: клиент стола (`server/table-client`) собирается из кода,
# который лежит за пределами `server/` — `look`, `game-kit`, два файла хаба и растры колоды. Все они
# тянутся относительными путями и не несут своих npm-зависимостей, поэтому ставится только `server/`.
#
# Клиент собирается ЗДЕСЬ, заранее (`build:table-client`), и сервер раздаёт готовую папку
# (`TABLE_CLIENT_DIR`): в итоговом образе нет ни исходников клиента, ни esbuild, ни tsx.

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
COPY apps/hub/src/hub /app/apps/hub/src/hub
COPY game-presets/cards/src/decks/baked /app/game-presets/cards/src/decks/baked

ARG APP_BUILD=dev
ARG APP_COMMIT=dev
ENV APP_BUILD=${APP_BUILD}
ENV APP_COMMIT=${APP_COMMIT}
RUN npm run build && npm run build:table-client

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/server/dist ./dist

ARG APP_BUILD=dev
ARG APP_COMMIT=dev
ENV APP_BUILD=${APP_BUILD}
ENV APP_COMMIT=${APP_COMMIT}
ENV TABLE_CLIENT_DIR=/app/dist/table-client

EXPOSE 2567
CMD ["node", "dist/index.js"]
