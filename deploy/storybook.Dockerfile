# Каталог канвасного UI-kit (Storybook из client2) как отдельный статический образ.
#
# Отдельным, а не внутри web-образа: сторибук — стенд для разработки, у него своя жизнь.
# Его пересборка не должна трогать образ, которым играют, а его выкатка — ждать зелёного
# прода. Ценой этого лишний ~30 МБ образа, который всё равно спит между заходами.
#
# Контекст сборки — КОРЕНЬ репо (нужен deploy/storybook.nginx.conf рядом с client2/).
# .storybook/main.ts ставит base: "./", поэтому статика работает на любом пути и префикс
# сюда прокидывать не нужно.

FROM node:22-alpine AS build
WORKDIR /app
COPY client2/package.json client2/package-lock.json ./
RUN npm ci
COPY client2/ ./

# Подпись сборки: .git в контекст не попадает, спросить её изнутри неоткуда (см. client2/vite.config.ts).
ARG APP_BUILD=dev
ARG APP_COMMIT=dev
ENV APP_BUILD=${APP_BUILD}
ENV APP_COMMIT=${APP_COMMIT}
RUN npm run build-storybook

FROM nginx:alpine AS runtime
COPY --from=build /app/storybook-static /usr/share/nginx/html
COPY deploy/storybook.nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
