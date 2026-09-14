# Хаб — одна страница, с которой запускаются игры. Статический образ: ни SSR, ни рантайма.
#
# Контекст сборки — КОРЕНЬ репозитория, и иначе нельзя: репозиторий это npm workspaces с ОДНИМ
# локом, а хаб импортирует и кит, и игры по имени пакета (`game-kit`, `@apps/klondike`). Собрать
# его из папки apps/hub означало бы построить второе дерево зависимостей рядом с первым.
#
# Адрес сервера сюда ПРИЕЗЖАЕТ — с тех пор, как у хаба есть онлайн-столы: см. ARG ниже. Косынка
# по-прежнему грузится ленивым чанком в той же странице и ни с чем не разговаривает.

FROM node:22-alpine AS build
WORKDIR /app

# Сначала манифесты — слой с `npm ci` переживает правку исходников.
COPY package.json package-lock.json ./
# КАЖДЫЙ ВОРКСПЕЙС ИЗ КОРНЕВОГО package.json, ни одним меньше: `npm ci` сверяет лок с манифестами,
# и пакет, чей манифест не доехал, в node_modules не попадает — хаб потом не находит его по имени
# («Rollup failed to resolve import "@crossade/wire"»). Новый пакет в workspaces = новая строка здесь.
COPY game-kit/package.json game-kit/
COPY wire/package.json wire/
COPY look/package.json look/
COPY game-presets/cards/package.json game-presets/cards/
COPY game-presets/desk/package.json game-presets/desk/
COPY game-presets/desks/package.json game-presets/desks/
COPY game-presets/dice/package.json game-presets/dice/
COPY game-presets/hand/package.json game-presets/hand/
COPY game-presets/rooms/package.json game-presets/rooms/
COPY game-presets/tophud/package.json game-presets/tophud/
COPY apps/cards/package.json apps/cards/
COPY apps/chess/package.json apps/chess/
COPY apps/hub/package.json apps/hub/
COPY apps/klondike/package.json apps/klondike/
COPY apps/nardy/package.json apps/nardy/
RUN npm ci

# Баг npm с необязательными зависимостями (npm/cli#4828): лок сгенерирован на macOS, и
# платформенного бинарника rollup для linux в нём нет — сборка падает с «Cannot find module
# @rollup/rollup-linux-x64-...». Доставляется РОВНО он и ровно той версии, что стоит у самого
# rollup, так что `npm ci` остаётся строгим и плавает ноль пакетов.
#
# Здесь MUSL, а не GNU: образ alpine'овый, и это разные бинарники — `npm i` gnu-шного внутри
# alpine падает на `notsup ... Actual libc: musl`. В pages.yml та же строка стоит с `-gnu`, и это
# не расхождение, а разные платформы: там ubuntu-раннер. Правится здесь — сверяется там.
RUN npm i --no-save "@rollup/rollup-linux-x64-musl@$(node -p "require('rollup/package.json').version")"

COPY game-kit/ game-kit/
COPY wire/ wire/
COPY look/ look/
COPY game-presets/ game-presets/
COPY apps/ apps/
# THE SERVER'S ADDRESS, since the hub now does talk to one: the online tables live on the game
# server, and a page on Fly has to know where that is. Baked at build time (Vite inlines
# `import.meta.env.VITE_SERVER_URL`); absent, the hub falls back to the page's own host on :2567,
# which is what local development wants. Passed as `--build-arg VITE_SERVER_URL=...`.
ARG VITE_SERVER_URL=""
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npm run build --workspace @apps/hub

FROM nginx:alpine AS runtime
COPY --from=build /app/apps/hub/dist /usr/share/nginx/html
COPY deploy/hub.nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
