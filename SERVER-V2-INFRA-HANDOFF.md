# Handoff: инфраструктура под Server v2 (единая точка входа)

**Дата:** 2026-07-28
**Статус:** готово к реализации
**Отменяет:** `PLAN-B-HANDOFF.md` (единый образ с v1+v2 внутри) — см. §0.
**Эпик:** #43. Сабтаски: #50 (§3), #44 (§A1), #45 (§A2–A7), #51 (§4), #52 (переезд в `legacy/`).
Порядок работ — §5; статус ведётся в тикетах, этот файл их не дублирует.

---

## 0. Почему не «план Б»

Первая версия плана тащила Server v1, Client v1, Server v2 и Client 2 в ОДИН образ с
supervisor'ом и префиксами `/api/v1` `/api/v2`. Отменено: v1 заморожен и будет удалён,
везти его в новый дом незачем. Вся сложность плана Б существовала ради этого переезда.

Заодно там было три фактические ошибки, которые здесь не повторяются:
- `DATA_DIR = __dirname/../data` (`server/src/accounts.ts:14`). Перенос сервера в подпапку
  уводил аккаунты мимо смонтированного тома — молча, до первого пересоздания машины.
- Логи в `/app/logs/*.log`: `fly logs` пустой, а каталог не создавался — supervisord не стартовал.
- Префикс `/api/v1` при корневых маршрутах сервера требовал правок `client/src/colyseus.ts`
  и проверки поддержки сабпутя в colyseus.js.

**Новая рамка:** v1 не трогаем ВООБЩЕ. Единая точка входа строится с нуля для стека v2.

---

## 1. Что должно получиться

```
crusade-deck-server   (v1)   заморожен, живёт как есть → удалить, когда v1 умрёт
crusade-deck-client   (v1)   заморожен, живёт как есть → удалить, когда v1 умрёт

crusade-deck-v2              НОВОЕ приложение, один контейнер, одна машина
├─ nginx :80
│   ├─ /            → статика client2 (base '/', без префикса /v2/)
│   ├─ /playground  → песочница (SPA-фоллбэк, отдельного правила не нужно)
│   ├─ /api/        → 127.0.0.1:2567 (префикс срезается)
│   └─ /health      → 127.0.0.1:2567/health
└─ node server-v2 :2567 (слушает только loopback)
```

Локально — то же самое одним портом `:4269`, без nginx (см. §3).

---

## 2. Задача A — прод-образ стека v2 (#45)

### A1. `server-v2/` — новый пакет (#44)

Отдельная папка в корне репо. `server/` не редактируется ни строчкой.
Требования к коду от инфры (передать автору сервера):
- слушать `httpServer.listen(PORT, "127.0.0.1")` — наружу торчит только nginx;
- маршруты остаются КОРНЕВЫМИ (`/health`, `/accounts`, матчмейкинг Colyseus) — префикс
  срезает nginx, сервер о нём не знает;
- `GET /health` обязателен: на нём висит health-check Fly;
- если данные пишутся на диск — путь должен резолвиться в `/app/data` (том). При раскладке
  «сервер в `/app/dist`» текущая формула `__dirname/../data` даёт именно это.

### A2. `deploy/v2/Dockerfile`

Три стейджа. Опорный образец — существующие `server/Dockerfile` и `deploy/web.Dockerfile`.

```dockerfile
# --- сервер ---
FROM node:22-alpine AS build-server
WORKDIR /app
COPY server-v2/package.json server-v2/package-lock.json ./
RUN npm ci
COPY server-v2/tsconfig.json ./
COPY server-v2/src ./src
RUN npm run build

# --- клиент (base '/': новый дом, сабрут /v2/ здесь не нужен) ---
FROM node:22-alpine AS build-client
WORKDIR /app
COPY client2/package.json client2/package-lock.json ./
RUN npm ci
COPY client2/ ./
ARG APP_BUILD=dev
ARG APP_COMMIT=dev
ENV APP_BUILD=${APP_BUILD} APP_COMMIT=${APP_COMMIT} VITE_BASE=/
RUN npm run build

# --- рантайм ---
FROM node:22-alpine AS runtime
RUN apk add --no-cache nginx
WORKDIR /app
ENV NODE_ENV=production PORT=2567
COPY server-v2/package.json server-v2/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build-server /app/dist ./dist
COPY --from=build-client /app/dist /usr/share/nginx/html
COPY deploy/v2/nginx.conf /etc/nginx/http.d/default.conf
COPY deploy/v2/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ARG APP_BUILD=dev
ARG APP_COMMIT=dev
ENV APP_BUILD=${APP_BUILD} APP_COMMIT=${APP_COMMIT}
EXPOSE 80
CMD ["/entrypoint.sh"]
```

Грабли, которые уже учтены — не «упростить» обратно:
- **`/etc/nginx/http.d/`, а не `conf.d/`.** Здесь nginx ставится через `apk` в node-образ;
  каталог `conf.d` — это соглашение официального образа `nginx:alpine` (как в
  `deploy/web.Dockerfile`). Положишь в `conf.d` — конфиг просто не подхватится.
- **Сервер остаётся в `/app/dist`.** Не переносить в подпапку: сломается путь к данным.
- **`EXPOSE` только 80.** 2567 наружу не нужен и не должен быть доступен.

### A3. `deploy/v2/nginx.conf`

```nginx
# Апгрейд до WebSocket пробрасывается только там, где клиент его действительно просит.
# Хардкод `Connection: upgrade` на обычные POST матчмейкинга — некорректен, поэтому map.
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Трейлинг-слэш в proxy_pass СРЕЗАЕТ /api/ — сервер видит свои корневые маршруты
    # (/health, /accounts, матчмейкинг) и о префиксе не знает.
    location /api/ {
        proxy_pass http://127.0.0.1:2567/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Игровой WS живёт часами и молчит между ходами. Дефолтные 60s его рвут.
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /health {
        proxy_pass http://127.0.0.1:2567/health;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### A4. `deploy/v2/entrypoint.sh`

```sh
#!/bin/sh
# Два процесса без супервизора: node в фоне, nginx на переднем плане как PID 1.
# Смерть node сама контейнер не роняет — её ловит health-check Fly (/health уходит
# в node) и пересоздаёт машину. Для стенда этого достаточно; появится боевая нагрузка —
# тогда и заводить супервизор.
set -e
node /app/dist/index.js &
exec nginx -g 'daemon off;'
```

### A5. `deploy/v2/fly.toml`

```toml
app = "crusade-deck-v2"
primary_region = "fra"

[build]

[env]
  PORT = "2567"
  NODE_ENV = "production"

[http_service]
  internal_port = 80          # снаружи виден nginx, не node
  force_https = true
  auto_stop_machines = "stop" # спит между заходами — простой стоит ~0
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"            # node + nginx; поднять до 512, если словим OOM

[mounts]
  source = "crusade_v2_data"  # свой том, с v1 не пересекается
  destination = "/app/data"

[[http_service.checks]]
  grace_period = "10s"
  interval = "15s"
  method = "GET"
  timeout = "5s"
  path = "/health"
```

### A6. `client2/vite.config.ts` — параметризовать base

Сейчас `base: mode === "production" ? "/v2/" : "/"` (строка 44). Старый образ
(`deploy/web.Dockerfile`) раздаёт client2 под `/v2/` и должен продолжать это делать
без изменений, поэтому base не заменяем, а делаем перекрываемым:

```ts
base: process.env.VITE_BASE ?? (mode === "production" ? "/v2/" : "/"),
```

Новый образ передаёт `VITE_BASE=/`, старый — ничего, и ведёт себя как раньше.
`src/nav.ts` уже читает `import.meta.env.BASE_URL`, править его не нужно.

### A7. `scripts/deploy.sh` — цель `v2`

Добавить цель, не ломая существующие. Порядок «сервер раньше клиента» для v2 не нужен —
адрес сервера теперь относительный, в бандл ничего не вшивается.

```bash
if [[ "$target" == "v2" ]]; then
  flyctl deploy --now \
    --config deploy/v2/fly.toml \
    --dockerfile deploy/v2/Dockerfile \
    --build-arg "APP_BUILD=${APP_BUILD}" \
    --build-arg "APP_COMMIT=${APP_COMMIT}" \
    .
fi
```

Контекст сборки — корень репо (нужны и `server-v2/`, и `client2/`). Корневой
`.dockerignore` уже исключает `node_modules`, `dist`, `.git` — трогать не надо.

---

## 3. Задача B — единый порт локально (#50; можно делать СЕЙЧАС, до появления server-v2)

Отдельный nginx локально не нужен: целевая раскладка — client2 на `/` и `/api/` рядом,
а это ровно то, что умеет `server.proxy` самого vite. Бонусом HMR остаётся на том же
origin и не требует настройки `hmr.clientPort` (при внешнем прокси её пришлось бы городить).

В `client2/vite.config.ts`:

```ts
server: {
  port: 4269,
  host: true,
  proxy: {
    // ws:true — апгрейд для Colyseus; rewrite повторяет трейлинг-слэш прод-nginx
    "/api": {
      target: "http://localhost:2568",
      ws: true,
      rewrite: (p) => p.replace(/^\/api/, ""),
    },
  },
},
```

- `2568` — dev-порт server-v2 (у server v1 занят `2567`, они должны сосуществовать локально).
- Прод и dev срезают префикс ОДИНАКОВО — расхождение здесь даёт баг «локально работает, на проде 404».
- Клиент v1 и сервер v1 локально запускаются как раньше, на своих портах. Смешивать их
  в `:4269` не нужно: `OLD_CLIENT_URL` в `client2/src/nav.ts` уже ведёт на `:5173` в dev.

Проверка: `curl localhost:4269/api/health` отвечает тем же, чем `curl localhost:2568/health`.

---

## 4. Задача C — заморозить v1 явно (#51)

Чтобы «случайно передеплоил v1» стало невозможным без осознанного действия.

- **`.github/workflows/ci.yml`**: job'ы тестов (`Сервер`, `Клиент`, `Клиент v2`) оставить
  как есть — они дёшевы и стерегут регрессии. В job `deploy` (строка ~76) заменить вызов
  `scripts/deploy.sh` на `scripts/deploy.sh v2`.
- **`scripts/deploy.sh`**: цель по умолчанию (`all`) → только `v2`. Цели `server` и `client`
  оставить рабочими, но потребовать явного флага (`FREEZE_OVERRIDE=1`) с внятным сообщением
  «v1 заморожен, выкатывать его нужно только осознанно».
- **`DEPLOY.md`**: раздел про две аппы дополнить абзацем «v1 заморожен, живой стек — v2».

---

## 5. Порядок работ

1. **Задача B** (#50, единый порт локально) — сразу, ни от чего не зависит, нужна для разработки v2.
2. **`server-v2/`** (#44) — скелет пакета с `/health` и `listen(PORT, "127.0.0.1")`. Дальше его
   пилит автор сервера; инфре достаточно, чтобы он собирался и отвечал.
3. **Задача A** (#45) — когда `server-v2/` собирается. Полдня. Не должна быть на критическом пути.
4. **Задача C** (#51) — вместе с первым успешным деплоем v2.
5. **Переезд в `legacy/{client,server}`** (#52) — после заморозки, не раньше: пока v1
   деплоится, перемещение папок обязывает чинить всю деплой-обвязку под ним (и рискует
   тем же `__dirname/../data`, на котором сгорел план Б).

---

## 6. Проверка результата

Локально:
```
docker build -f deploy/v2/Dockerfile -t crusade-v2 .
docker run --rm -p 8080:80 crusade-v2
curl -s localhost:8080/health          # версия сервера v2
open http://localhost:8080/            # client2 без префикса /v2/
open http://localhost:8080/playground  # песочница
```
Отдельно проверить, что WS реально апгрейдится через `/api/` (открыть комнату, а не только
`curl` матчмейкинг) — это самое хрупкое место конфига.

На Fly:
```
scripts/deploy.sh v2
curl -s https://crusade-deck-v2.fly.dev/health
```

Старые адреса при этом обязаны продолжать работать без изменений:
`crusade-deck-client.fly.dev/` и `crusade-deck-server.fly.dev/health`.

---

## 7. Когда v1 умрёт

1. `flyctl apps destroy crusade-deck-client`
2. `flyctl apps destroy crusade-deck-server`
3. Удалить из репо `client/`, `server/`, `deploy/web.Dockerfile`, `deploy/nginx.conf`,
   ветки CI под них, цели `server`/`client` в `scripts/deploy.sh`.
4. `crusade-deck-v2` остаётся единственным. Навесить кастомный домен — и переименование
   приложения уже не понадобится (Fly-аппы не переименовываются, домен решает это чище).
5. `VITE_BASE` из §A6 можно схлопнуть обратно в константу `/`.

Миграции данных нет: у v2 свой том с самого начала.
