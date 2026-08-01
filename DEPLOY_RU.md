# Деплой Crusade Deck через Cloudflare Tunnel

Инструкция для того, кто разворачивает проект на своём сервере. Наружу ничего
открывать не нужно: сервер держит исходящее соединение с Cloudflare, порты
80/443 на машине можно не трогать вообще, TLS и домен — на стороне Cloudflare.

## Что за проект

Монорепо из двух частей, обе на Node:

- `server/` — игровой сервер на Colyseus (Express + WebSocket), слушает **:2567**.
  HTTP-эндпоинты (`/accounts*`, `/rooms*`, `/health`, `/matchmake*`) и игровой
  сокет живут на одном и том же порту.
- `client/` — React + Vite, собирается в статику (`client/dist`), никакого SSR.
  Адрес сервера **зашивается в бандл на этапе сборки**, поэтому клиент нужно
  собирать уже зная итоговые домены.

Требования: **Node 20+** (проверено на 22 LTS), git. Больше ничего — ни базы,
ни Redis. Данные аккаунтов лежат в JSON-файле `server/data/accounts.json`.

## Схема

Два публичных хоста на один сервер — так проще всего с туннелем, потому что
сокет Colyseus живёт в корне (`/{processId}/{roomId}`) и по пути его от статики
не отличить:

```
браузер ──https──> Cloudflare ──tunnel──> cloudflared ─┬─ 127.0.0.1:8080  статика client/dist
             wss                                       └─ 127.0.0.1:2567  Colyseus (API + сокет)
```

- `crusade.ПРИМЕР.com` → статика клиента
- `api.crusade.ПРИМЕР.com` → игровой сервер

CORS уже разрешён на сервере (`Access-Control-Allow-Origin: *`), так что
разные хосты для клиента и API — рабочая конфигурация, править код не надо.

Имена хостов любые, ниже они встречаются в трёх местах: в `.env.production`
клиента, в `config.yml` туннеля и в DNS-записях Cloudflare.

## 1. Собрать проект

```bash
git clone <repo-url> ~/crusade-deck
cd ~/crusade-deck/server && npm ci && npm run build
```

Клиент — только после того, как определились с доменами. Обязательно `wss://`
и `https://`: страница по HTTPS не откроет незащищённый сокет.

```bash
cd ~/crusade-deck/client
cat > .env.production <<'EOF'
VITE_SERVER_URL=wss://api.crusade.ПРИМЕР.com
VITE_HTTP_URL=https://api.crusade.ПРИМЕР.com
EOF
npm ci && npm run build
```

Проверить, что домен реально уехал в бандл:

```bash
grep -c "api.crusade.ПРИМЕР.com" dist/assets/index-*.js
```

> ⚠️ Если рядом окажется `client/.env.local`, он перебьёт `.env.production` даже
> в прод-сборке. В git он не коммитится, на сервере его быть не должно.

## 2. Поднять два локальных процесса

**Игровой сервер:**

```bash
cd ~/crusade-deck/server && PORT=2567 NODE_ENV=production node dist/index.js
```

**Статика клиента** (нужен SPA-фоллбэк — ссылка-приглашение имеет вид `/r/КОД`,
без фоллбэка при перезагрузке будет 404):

```bash
npx serve -s ~/crusade-deck/client/dist -l 8080
```

Годится любой статик-сервер с фоллбэком на `index.html` — nginx, Caddy, что
привычнее. Порт 8080 фигурирует дальше только в конфиге туннеля.

Проверка до туннеля:

```bash
curl http://127.0.0.1:2567/health   # {"status":"ok"}
curl -I http://127.0.0.1:8080/      # 200
```

## 3. Cloudflare Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create crusade-deck
cloudflared tunnel route dns crusade-deck crusade.ПРИМЕР.com
cloudflared tunnel route dns crusade-deck api.crusade.ПРИМЕР.com
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: crusade-deck
credentials-file: /root/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: api.crusade.ПРИМЕР.com
    service: http://127.0.0.1:2567
  - hostname: crusade.ПРИМЕР.com
    service: http://127.0.0.1:8080
  - service: http_status:404
```

WebSocket через туннель работает из коробки, отдельных флагов не нужно.
Прокси Cloudflare (оранжевое облако) на обеих записях должен быть включён —
`tunnel route dns` так и создаёт.

```bash
cloudflared tunnel run crusade-deck
```

## 4. Автозапуск

Три сервиса: `cloudflared`, игровой сервер, статика. Для cloudflared есть
штатное `cloudflared service install`. Для остальных двух — обычные unit-файлы
systemd, например `/etc/systemd/system/crusade-deck.service`:

```ini
[Unit]
Description=Crusade Deck game server (Colyseus)
After=network.target

[Service]
Type=simple
User=ПОЛЬЗОВАТЕЛЬ
WorkingDirectory=/home/ПОЛЬЗОВАТЕЛЬ/crusade-deck/server
ExecStart=/usr/bin/node dist/index.js
Environment=NODE_ENV=production
Environment=PORT=2567
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Аналогичный unit для статики с `ExecStart=/usr/bin/npx serve -s /home/ПОЛЬЗОВАТЕЛЬ/crusade-deck/client/dist -l 8080`
(или отдать её nginx/Caddy, если они на машине уже есть).

```bash
systemctl daemon-reload && systemctl enable --now crusade-deck
```

Логи: `journalctl -u crusade-deck -f`, `journalctl -u cloudflared -f`.

## 5. Проверка

```bash
curl https://api.crusade.ПРИМЕР.com/health
```

Ожидается `{"status":"ok"}`. Дальше открыть `https://crusade.ПРИМЕР.com` в
браузере: создаётся профиль, в DevTools → Network должен быть апгрейд
`101 Switching Protocols` на `wss://api.crusade.ПРИМЕР.com/...`.

Если страница открывается, а игра не подключается — почти всегда в бандле
остался неверный адрес (шаг 1) или сокет упёрся в хост без прокси Cloudflare.

## 6. Обновление версии

```bash
cd ~/crusade-deck && git pull
cd server && npm ci && npm run build
cd ../client && npm ci && npm run build
sudo systemctl restart crusade-deck
```

Статику перезапускать не нужно — `serve` отдаёт файлы с диска. Клиенту, скорее
всего, понадобится hard-reload.

> ⚠️ Комнаты, инвайт-коды и руки игроков живут **только в памяти** — рестарт
> сервера выкидывает всех из партии. Не обновлять посреди игры. Аккаунты
> (`server/data/accounts.json`) на диске и рестарт переживают.

## 7. Бэкап аккаунтов

`server/data/` в `.gitignore`, `git pull` его не трогает. Раз в сутки в `crontab -e`:

```
0 4 * * * mkdir -p ~/backups && cp ~/crusade-deck/server/data/accounts.json ~/backups/accounts-$(date +\%F).json
```

## Известные мелочи

- Firebase в зависимостях есть, но не используется и не настроен — ключи не
  нужны, вход работает на своих аккаунтах с recovery-кодом.
- Никаких обязательных переменных окружения у сервера нет, кроме `PORT`
  (по умолчанию 2567).
- Recovery-код копируется через `navigator.clipboard` — работает только в
  secure context, то есть по HTTPS. Через туннель это выполняется само собой,
  а вот по «голому» IP кнопка копирования отвалится.

## Fly.io (текущий прод)

Три аппы, регион `fra`:

| аппа | что это | конфиг |
| --- | --- | --- |
| `crusade-deck-server` | игровой сервер v1 (Colyseus) | `server/fly.toml` |
| `crusade-deck-client` | nginx: клиент v1 на `/`, client2 на `/v2/` | `client/fly.toml` |
| `crusade-deck-storybook` | каталог канвасного UI-kit | `deploy/storybook.fly.toml` |

Сторибук вдобавок выкладывается на **GitHub Pages** — https://erbcreedok.github.io/crusade-deck/.
Это не дубль, а разделение ролей: образ на Fly — артефакт наравне с остальными (тот же
конвейер, тот же откат по тегу, можно поставить на свой сервер), Pages — витрина: бесплатная,
без холодного старта, со ссылкой, которую не жалко дать кому угодно. На Pages при этом уезжает
статика, ВЫНУТАЯ ИЗ УЖЕ СОБРАННОГО ОБРАЗА (`docker create` + `docker cp` в джобе `pages`), а не
собранная второй раз: вторая сборка — это второй артефакт, который однажды разойдётся с первым.
Работает это только потому, что `.storybook/main.ts` ставит `base: "./"` — Pages отдаёт сайт из
подпути `/crusade-deck/`, и с абсолютным `base` все ассеты дали бы 404.

### Артефакт отдельно, выкатка отдельно

Fly больше ничего не собирает. Образы собирает GitHub Actions и кладёт в GHCR, а `fly deploy`
только указывает, какой из них взять. Из этого следует всё остальное:

- **откат** — это выкатка прошлого тега, а не revert и пересборка;
- на прод уезжает ТОТ ЖЕ образ, который проверяли, а не «собранный из того же коммита»;
- его же можно поставить куда-то ещё — на свой сервер, на стенд — не пересобирая.

```
пуш в main → зелёные тесты → ghcr.io/erbcreedok/crusade-deck/{server,web,storybook}
                                        ↓ (отдельным решением)
                              Actions → Выкатка   |   scripts/deploy.sh
```

Теги у каждого образа: `sha-<коммит>` (неизменяемый, основной), `build-<номер>` (тот самый
номер, что стоит в подписи версии) и `main` — подвижный указатель на последнюю сборку.

### Выкатка

```bash
scripts/deploy.sh                            # все компоненты, последняя сборка с main
scripts/deploy.sh web                        # один
IMAGE_TAG=sha-abc1234 scripts/deploy.sh web  # конкретная сборка; она же — откат
DEPLOY_ENV=dev scripts/deploy.sh web         # другое окружение (ищет client/fly.dev.toml)
BUILD_FROM_SOURCE=1 scripts/deploy.sh server # запасной путь: собрать на Fly, минуя GHCR
```

То же кнопкой: Actions → **Выкатка** → Run workflow (тег, компоненты, окружение). Workflow
вызывает ровно этот скрипт — и выкатка, и проверка после неё живут в одном месте, а не в
двух расходящихся. Это та же причина, по которой скрипт вообще появился.

Перед выкаткой скрипт проверяет, читается ли образ анонимно, и от ответа выбирает путь:
прямо из GHCR или через перекладку в реестр Fly (см. выше). Перекладке нужен docker; если
его нет и пакет приватный — скрипт скажет об этом сразу, а не свалится в середине выкатки.

### Адрес сервера — в рантайме, а не в бандле

Раньше `client/fly.toml` вшивал `VITE_SERVER_URL` в бандл на сборке, и образ был привязан к
окружению: поставить его на стенд означало пересобрать, то есть выкатить уже ДРУГОЙ артефакт.
Теперь адрес приезжает переменными окружения:

`[env]` в `client/fly.toml` → `deploy/runtime-config.sh` пишет `/config.js` при старте
контейнера → `client/src/runtimeConfig.ts` читает `window.__CRUSADE_CONFIG__`.

Порядок: рантайм → вшитое через `VITE_*` → `localhost`. Средняя ступень оставлена нарочно —
`docker-compose.yml` собирается по-старому и работает без единой правки. `/config.js` отдаётся
с `Cache-Control: no-store`: закэшированная копия означала бы поход на прежний адрес после
переезда сервера, причём при «правильном» образе.

Побочное следствие: порядок «сервер раньше клиента» больше не обязателен — вшивать нечего.

### Добавить компонент

`deploy/components.json` — единственный список того, что собирается и куда едет; его читают и
`scripts/deploy.sh`, и `.github/workflows/build.yml`. Новый компонент — запись в нём, без
правок скрипта и workflow. Тем же способом заводится стек v2, когда появится `server-v2/`.

Стенд — то же правило имён: конфиг `client/fly.dev.toml`, аппа `crusade-deck-client-dev`,
запуск `DEPLOY_ENV=dev scripts/deploy.sh web`.

### Разовая настройка

1. Секрет `FLY_API_TOKEN` в репозитории (`fly tokens create deploy`).
2. `fly apps create crusade-deck-storybook`.
3. После первой сборки сделать пакеты публичными: GitHub → Packages → каждый из
   `crusade-deck/{server,web,storybook}` → Package settings → Change visibility → Public.
   GHCR создаёт пакеты приватными даже в публичном репозитории, а Fly тянет их анонимно.

Версия видна в трёх местах: внизу экрана лобби, в меню настроек (полная — с коммитом и
временем сборки) и в `/health` сервера. Разъехавшаяся пара клиент/сервер — первое, что
стоит проверить, когда у одного игрока работает, а у другого нет.

Машины спят между визитами (`min_machines_running = 0`), поэтому первый запрос после паузы
будит сервер несколько секунд. Так и задумано: комнаты живут только в памяти, и рестарт
всё равно всех выкидывает.

### Куда это едет: стек v2

Описанное выше — стек v1, и он доживает. Живой стек переезжает в ОТДЕЛЬНОЕ приложение
`crusade-deck-v2` (один контейнер: nginx + node server-v2, client2 на `/`, `/api/` в node),
v1 при этом не редактируется ни строчкой и потом удаляется целиком. Разбор, готовые конфиги
и объяснение каждой грабли — `SERVER-V2-INFRA-HANDOFF.md`, состав работ — эпик #43.

Пока эта секция описывает актуальный порядок деплоя: заморозка v1 (#51) ещё не сделана,
`scripts/deploy.sh` по-прежнему выкатывает v1 по умолчанию. Конвейер к переезду готов:
стек v2 добавляется записью в `deploy/components.json` (`deploy/v2/Dockerfile`,
`deploy/v2/fly.toml`), а заморозка v1 сводится к удалению оттуда записей `server` и `web` —
правок в скрипте и workflow не потребуется. Формулировки §A7 хендоффа про новую цель
в `deploy.sh` при этом устарели: целей больше нет, есть список компонентов.

### CI

Три workflow, разрезанные ровно по шву «артефакт появился» / «прод изменился»:

- **`ci.yml`** — тесты на каждый пуш. На `main` после зелёных вызывает `build.yml` через
  `uses:`. Именно вызовом, а не отдельным workflow: гейт `needs:` существует только внутри
  ОДНОГО запуска, два независимых стартовали бы параллельно — и в реестр уехал бы образ,
  который никто не проверял.
- **`build.yml`** — собирает матрицей всё из `deploy/components.json` и кладёт в GHCR.
  Запускается и руками, для любой ветки.
- **`deploy.yml`** — кнопка. Принимает тег и компоненты, зовёт `scripts/deploy.sh`.

Выкатка на `main` идёт автоматически, но через тот же `deploy.yml` и по НЕИЗМЕНЯЕМОМУ тегу
`sha-<коммит>`, а не по подвижному `main`: иначе к моменту выкатки указатель мог бы уже
показывать на следующую сборку, и уехало бы не то, что проверяли. Тот же workflow дёргается
руками с любым другим тегом — из этого и получается откат.

Образ до Fly доезжает одним из двух путей, решение принимает `scripts/deploy.sh` сам:
публичный пакет Fly тянет прямо из GHCR; приватный — скрипт перекладывает БАЙТ В БАЙТ в
`registry.fly.io` и выкатывает оттуда. Так выкатка не зависит от разового клика «сделать
пакет публичным»: у GitHub нет API для видимости пакета, только кнопка в вебе. GHCR при этом
остаётся хранилищем артефактов, из которого образ можно забрать куда угодно ещё.

Четыре вещи, которые workflow обязаны делать правильно, и все четыре легко упустить:

- `fetch-depth: 0` у checkout. Номер сборки — число коммитов, мелкий клон по умолчанию
  сделал бы его вечной единицей.
- `cancel-in-progress: false` у выкатки. Отменённый на середине flyctl оставит аппу в
  промежуточном состоянии, поэтому запуски встают в очередь, а не вытесняют друг друга.
- `provenance: false` у сборки. С attestation-манифестами в реестр уезжает OCI-индекс, а
  `fly deploy --image` и анонимная проверка ждут обычный манифест.
- `fail-fast: false` у матрицы. Упавший storybook не должен отменять почти собранный
  server: образы независимы, и половина готовых артефактов лучше, чем ноль.

Деплою нужен секрет `FLY_API_TOKEN` в репозитории (Settings → Secrets and variables →
Actions), создаётся командой `fly tokens create deploy`. Для укладки в GHCR секрет не
нужен — хватает собственного `GITHUB_TOKEN` workflow.
