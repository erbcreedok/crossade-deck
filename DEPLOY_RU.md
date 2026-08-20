# Деплой Crossade Deck

Едут две вещи, и друг о друге они не знают:

- `server/` — игровой сервер на Colyseus (Express + WebSocket), слушает **:2567**. HTTP-эндпоинты
  (`/accounts*`, `/rooms*`, `/health`, `/matchmake*`) и игровой сокет живут на одном порту.
- `apps/hub/` — ХАБ: одна статическая страница, с которой запускаются игры, собирается Vite в
  `apps/hub/dist`. Игра — ленивый чанк в той же странице, а не второй сайт.

В хаб не зашивается НИЧЕЙ адрес: он ни с чем не разговаривает. Из этого и следует, что образ у
него один на все окружения — в нём нечему указывать в другое место.

Каталог кита (`game-kit`) — третье лицо, и едет он совсем другой дорогой: у него нет образа вовсе,
он уезжает на **GitHub Pages**, см. раздел в конце.

Требования: **Node 22+**, git. Больше ничего — ни базы, ни Redis. Данные аккаунтов лежат в
JSON-файле `server/data/accounts.json`.

## Схема

Два публичных хоста на одной машине — самая простая раскладка для туннеля, потому что сокет
Colyseus живёт в корне (`/{processId}/{roomId}`) и по пути его от статики не отличить:

```
браузер ──https──> Cloudflare ──туннель──> cloudflared ─┬─ 127.0.0.1:8080  статика apps/hub/dist
             wss                                        └─ 127.0.0.1:2567  Colyseus (API + сокет)
```

- `crossade.EXAMPLE.com` → статика хаба
- `api.crossade.EXAMPLE.com` → игровой сервер

CORS на сервере открыт (`Access-Control-Allow-Origin: *`), так что разные хосты для страницы и API
— рабочая конфигурация, править код не нужно.

## 1. Собрать проект

```bash
git clone <repo-url> ~/crossade-deck
cd ~/crossade-deck/server && npm ci && npm run build
```

Хаб собирается ИЗ КОРНЯ, а не из своей папки: репозиторий — npm workspaces с ОДНИМ локом, и хаб
импортирует кит и игры по имени пакета. Установка внутри `apps/hub` построила бы второе дерево
зависимостей рядом с первым.

```bash
cd ~/crossade-deck && npm ci && npm run build --workspace @apps/hub
```

Никаких `.env`: зашивать нечего. Порядок сборки тоже больше не важен — половинки друг о друге не
знают.

## 2. Поднять два локальных процесса

**Игровой сервер:**

```bash
cd ~/crossade-deck/server && PORT=2567 NODE_ENV=production node dist/index.js
```

**Статика хаба** — и НАРОЧНО без SPA-фоллбэка (`serve -s`): у хаба один адрес, корень, а всё
остальное, что он просит, — настоящие файлы с хэшем в имени. Фоллбэк только рядил бы опечатку в
пустую страницу вместо честного 404.

```bash
npx serve ~/crossade-deck/apps/hub/dist -l 8080
```

Подойдёт любой статический сервер — nginx, Caddy, что уже стоит на машине. Порт 8080 важен дальше
только для конфига туннеля.

Проверка до туннеля:

```bash
curl http://127.0.0.1:2567/health   # {"status":"ok"}
curl -I http://127.0.0.1:8080/      # 200
```

## 3. Cloudflare Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create crossade-deck
cloudflared tunnel route dns crossade-deck crossade.ПРИМЕР.com
cloudflared tunnel route dns crossade-deck api.crossade.ПРИМЕР.com
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: crossade-deck
credentials-file: /root/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: api.crossade.ПРИМЕР.com
    service: http://127.0.0.1:2567
  - hostname: crossade.ПРИМЕР.com
    service: http://127.0.0.1:8080
  - service: http_status:404
```

WebSocket через туннель работает из коробки, отдельных флагов не нужно.
Прокси Cloudflare (оранжевое облако) на обеих записях должен быть включён —
`tunnel route dns` так и создаёт.

```bash
cloudflared tunnel run crossade-deck
```

## 4. Автозапуск

Три сервиса: `cloudflared`, игровой сервер, статика. Для cloudflared есть
штатное `cloudflared service install`. Для остальных двух — обычные unit-файлы
systemd, например `/etc/systemd/system/crossade-deck.service`:

```ini
[Unit]
Description=Crossade Deck game server (Colyseus)
After=network.target

[Service]
Type=simple
User=ПОЛЬЗОВАТЕЛЬ
WorkingDirectory=/home/ПОЛЬЗОВАТЕЛЬ/crossade-deck/server
ExecStart=/usr/bin/node dist/index.js
Environment=NODE_ENV=production
Environment=PORT=2567
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Аналогичный unit для статики с `ExecStart=/usr/bin/npx serve /home/ПОЛЬЗОВАТЕЛЬ/crossade-deck/apps/hub/dist -l 8080`
(или отдать её nginx/Caddy, если они на машине уже есть).

```bash
systemctl daemon-reload && systemctl enable --now crossade-deck
```

Логи: `journalctl -u crossade-deck -f`, `journalctl -u cloudflared -f`.

## 5. Проверка

```bash
curl https://api.crossade.ПРИМЕР.com/health
```

Ожидается `{"status":"ok"}`. Дальше открыть `https://crossade.ПРИМЕР.com` в браузере: хаб рисует
свою полку, а нажатие на плитку подгружает чанк этой игры (DevTools → Network, `.js` внутри
`assets/`) в ту же страницу.

## 6. Обновление версии

```bash
cd ~/crossade-deck && git pull
cd server && npm ci && npm run build
cd .. && npm ci && npm run build --workspace @apps/hub
sudo systemctl restart crossade-deck
```

Статику перезапускать не нужно — `serve` отдаёт файлы с диска. Странице, скорее всего,
понадобится hard-reload.

> ⚠️ Комнаты, инвайт-коды и руки игроков живут **только в памяти** — рестарт
> сервера выкидывает всех из партии. Не обновлять посреди игры. Аккаунты
> (`server/data/accounts.json`) на диске и рестарт переживают.

## 7. Бэкап аккаунтов

`server/data/` в `.gitignore`, `git pull` его не трогает. Раз в сутки в `crontab -e`:

```
0 4 * * * mkdir -p ~/backups && cp ~/crossade-deck/server/data/accounts.json ~/backups/accounts-$(date +\%F).json
```

## Известные мелочи

- Никаких обязательных переменных окружения у сервера нет, кроме `PORT` (по умолчанию 2567).
- Комнаты, инвайт-коды и руки живут ТОЛЬКО в памяти: рестарт сервера заканчивает все партии.
  Аккаунты на диске и рестарт переживают.

## Fly.io (текущий прод)

Две аппы, регион `fra`:

| аппа | что это | конфиг |
| --- | --- | --- |
| `crossade-deck-server` | игровой сервер (Colyseus) | `server/fly.toml` |
| `crossade-deck-hub` | nginx: статика хаба | `deploy/hub.fly.toml` |

И третье лицо, которое НЕ аппа: каталог кита на **GitHub Pages** —
https://erbcreedok.github.io/crossade-deck/. Образа у него нет и не нужно: `game-kit` собирается
в статику, и больше из этих исходников ничего не делается — значит, правилу, по которому живут
образы («на Pages уезжает статика, вынутая из уже собранного образа, а не собранная второй раз»),
тут просто нечего защищать. Взамен получается, что публикация каталога больше не тянет за собой
выкатку прода, — см. `.github/workflows/pages.yml`.

### Артефакт отдельно, выкатка отдельно

Fly больше ничего не собирает. Образы собирает GitHub Actions и кладёт в GHCR, а `fly deploy`
только указывает, какой из них взять. Из этого следует всё остальное:

- **откат** — это выкатка прошлого тега, а не revert и пересборка;
- на прод уезжает ТОТ ЖЕ образ, который проверяли, а не «собранный из того же коммита»;
- его же можно поставить куда-то ещё — на свой сервер, на стенд — не пересобирая.

```
пуш в main → зелёные тесты → ghcr.io/erbcreedok/crossade-deck/{server,hub}
                                        ↓ (отдельным решением)
                              Actions → Выкатка   |   scripts/deploy.sh
```

Теги у каждого образа: `sha-<коммит>` (неизменяемый, основной), `build-<номер>` (тот самый
номер, что стоит в подписи версии) и `main` — подвижный указатель на последнюю сборку.

### Выкатка

```bash
scripts/deploy.sh                            # все компоненты, последняя сборка с main
scripts/deploy.sh hub                        # один
IMAGE_TAG=sha-abc1234 scripts/deploy.sh hub  # конкретная сборка; она же — откат
DEPLOY_ENV=dev scripts/deploy.sh hub         # другое окружение (ищет deploy/hub.fly.dev.toml)
BUILD_FROM_SOURCE=1 scripts/deploy.sh server # запасной путь: собрать на Fly, минуя GHCR
```

То же кнопкой: Actions → **Выкатка** → Run workflow (тег, компоненты, окружение). Workflow
вызывает ровно этот скрипт — и выкатка, и проверка после неё живут в одном месте, а не в
двух расходящихся. Это та же причина, по которой скрипт вообще появился.

Перед выкаткой скрипт проверяет, читается ли образ анонимно, и от ответа выбирает путь:
прямо из GHCR или через перекладку в реестр Fly (см. выше). Перекладке нужен docker; если
его нет и пакет приватный — скрипт скажет об этом сразу, а не свалится в середине выкатки.

### Добавить компонент

`deploy/components.json` — единственный список того, что собирается и куда едет; его читают и
`scripts/deploy.sh`, и `.github/workflows/build.yml`. Новый компонент — запись в нём, без
правок скрипта и workflow. Тем же способом заводится стек v2, когда появится `server-v2/`.

Стенд — то же правило имён: конфиг `deploy/hub.fly.dev.toml`, аппа `crossade-deck-hub-dev`,
запуск `DEPLOY_ENV=dev scripts/deploy.sh hub`.

### Разовая настройка

1. Секрет репозитория `FLY_API_TOKEN` (`fly tokens create deploy`).
2. `fly apps create crossade-deck-hub`.
3. После первой сборки сделать пакеты публичными: GitHub → Packages → каждый из
   `crossade-deck/{server,hub}` → Package settings → Change visibility → Public. GHCR заводит
   пакеты приватными даже в публичном репозитории, а Fly тянет анонимно.
4. Для каталога: Settings → Pages → Source: **GitHub Actions**. Больше ничего — workflow сам
   публикует в окружение `github-pages`.

Машины между заходами спят (`min_machines_running = 0`), поэтому первый запрос после паузы
поднимает их несколько секунд. Для сервера это ожидаемо — комнаты живут только в памяти, и
рестарт всё равно заканчивает партии.

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
- `fail-fast: false` у матрицы. Упавший хаб не должен отменять почти собранный
  server: образы независимы, и половина готовых артефактов лучше, чем ноль.

Деплою нужен секрет `FLY_API_TOKEN` в репозитории (Settings → Secrets and variables →
Actions), создаётся командой `fly tokens create deploy`. Для укладки в GHCR секрет не
нужен — хватает собственного `GITHUB_TOKEN` workflow.
