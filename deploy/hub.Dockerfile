# Хаб — одна страница, с которой запускаются игры. Статический образ: ни SSR, ни рантайма.
#
# Контекст сборки — КОРЕНЬ репозитория, и иначе нельзя: репозиторий это npm workspaces с ОДНИМ
# локом, а хаб импортирует и кит, и игры по имени пакета (`game-kit`, `@apps/klondike`). Собрать
# его из папки apps/hub означало бы построить второе дерево зависимостей рядом с первым.
#
# Адрес сервера сюда не приезжает ВООБЩЕ: хаб ни с чем не разговаривает, он грузит игру ленивым
# чанком в той же странице. Поэтому образ один на все окружения и build-аргументов у него нет.

FROM node:22-alpine AS build
WORKDIR /app

# Сначала манифесты — слой с `npm ci` переживает правку исходников.
COPY package.json package-lock.json ./
COPY game-kit/package.json game-kit/
COPY game-presets/cards/package.json game-presets/cards/
COPY game-presets/dice/package.json game-presets/dice/
COPY apps/hub/package.json apps/hub/
COPY apps/klondike/package.json apps/klondike/
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
COPY game-presets/ game-presets/
COPY apps/ apps/
RUN npm run build --workspace @apps/hub

FROM nginx:alpine AS runtime
COPY --from=build /app/apps/hub/dist /usr/share/nginx/html
COPY deploy/hub.nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
