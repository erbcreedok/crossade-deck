# Crossade — мультиплеерный стол на движке client2

Дизайн-контракт. Написан 2026-08-03 по разведке кода (сервер, client-макет, Косынка).
Ветка `crossade`. Владелец задал рамку: «та же игра, что в client/», отдельная папка по образцу
Косынки, подключение к текущему серверу, можно авторизацию. **База — только client2; client/ —
макет-референс, его код не трогаем и не копируем.**

## Что уже есть (из разведки)

- **Сервер готов целиком и не требует правок для MVP.** Комнаты `card_room` и `test_room`
  (та же комната + боты — идеальна для разработки без второго игрока). Все сообщения описаны в
  `server/src/messages/*`. Кастом-аккаунты: `POST /accounts`, restore по 6-буквенному коду.
- **`colyseus.js` уже в `client2/package.json`** — манифест не трогаем.
- **Образец структуры — Косынка**: `game/solitaire/{engine,tree,scene,slotPaint}.ts` +
  `SolitaireGame.tsx` + роут в `main.tsx`. Правила отдельно от сцены, геометрия — деревом слотов,
  сцена реализует только швы `SceneEngine`.
- **Мост «сеть → движок» в макете** — `client/src/engineProps.ts` (EngineState/Signals/apply):
  готовая ФОРМА для нашего моста. Переносим форму, не код.
- **`deckRev` last-write-wins** написан на обеих сторонах — переносится как правило, не как код.

## Структура

```
client2/src/net/                 — сетевой слой, БЕЗ Pixi и React
  runtimeConfig.ts               — SERVER_URL/HTTP_URL (window.__CROSSADE_CONFIG__ → VITE_* → localhost:2567)
  account.ts                     — аккаунт в localStorage + API (create/restore/rename), чистая логика отдельно
  connect.ts                     — colyseus Client, joinCardRoom/joinTestRoom/joinByCode, retry «разбудить сервер»

client2/src/game/crossade/
  state.ts                       — CrossadeState: снимок стола из серверной схемы (deck, hand, seats,
                                   discard, play, freeMode, phase, deckRev…) + stale-check по deckRev
                                   + локальный порядок руки (pendingHandOrder). ЧИСТОЕ.
  tree.ts                        — buildCrossadeTree(state, размер экрана) → слоты: deckSlot,
                                   discardSlot, play-grid, ряд руки, места игроков. По образцу
                                   solitaire/tree.ts: только данные, камера подгоняет под экран.
  net.ts                         — подписка на room: schema→CrossadeState, сигналы (card_moved,
                                   hands_collected, action_rejected, go_shout), исходящие команды
                                   (интерфейс CrossadePort: deal/take/discard/play/move/ready/go/…)
  scene.ts                       — CrossadeScene extends SceneEngine: рендер по дереву, HUD
                                   (TopBar: код комнаты, за столом/готовы; кнопки ready/ГОУ/Перераздача),
                                   жесты → CrossadePort. Только швы, как у Косынки.
  slotPaint.ts                   — контуры слотов и подписи зон (покой/при драге)

client2/src/CrossadeGame.tsx     — тонкий React-хост (как SolitaireGame.tsx): mount/destroy, __cro-хук
main.tsx                         — роут `crossade`
```

## Этапы (циклы me-sleep, каждый — коммит после зелёных гейтов)

1. **net/**: runtimeConfig + account + connect. Юниты на чистое (нормализация кода, store с
   подставным localStorage, выбор URL). Без Pixi.
2. **crossade/state.ts + tree.ts**: снимок стола и дерево слотов. Юниты: stale-check по deckRev,
   удержание своего порядка руки, раскладка слотов на 390px и 1280px.
3. **crossade/net.ts**: room → state (schema onStateChange → снимок), исходящий порт. Юнит на
   маппинг схемы (подставной room-объект).
4. **scene.ts + CrossadeGame.tsx + роут**: стол рисуется, тап по колоде (freeMode) берёт карту,
   драг рука→сброс/стол, HUD-кнопки. Проверка руками против ЖИВОГО сервера + test_room с ботами.
5. **Жесты дилера**: deal_card драгом на место игрока, go, collect_hands, ready. Реордер руки.
6. **Авторизация (MVP)**: при первом входе автосоздание аккаунта (`POST /accounts`) с именем
   по умолчанию, хранение в localStorage, recovery-код показывается в HUD/меню. Экран восстановления
   по коду — ПОСЛЕ MVP: канвасного ввода текста в client2 нет, и городить его ночью — не MVP.
7. **e2e**: третий webServer в playwright.config (server на тестовом порту) + сценарий
   «test_room: подключились, раздали, взяли карту». Плюс отчёт.

## Что в MVP НЕ входит (вторая очередь, по образцу макета)

Голосования (dealer/kick), кричалки, свайп-тасовка с ShuffleSession, глиссандо/peek, авто-раздача,
веера колоды/сброса, «толстый палец», discard-горочка с фиксированным узором (в MVP — heap-раскладка
из kit/stackLayout), паблик-список комнат, версия/переключатель клиентов.

## Правила, которые нельзя нарушить

- В канвасе живёт ВСЁ (топбар, кнопки, оверлеи) — HTML по минимуму, как в Косынке.
- Никакого копирования из client/: только форма контрактов. Геометрия и рендер — свои, на
  SceneEngine/деревe слотов.
- Идентификаторы английские, русский — в подписях UI.
- Каждое правило состояния (stale-check, порядок руки) — с юнитом сразу.
- `client/` не трогаем вообще; `server/` без нужды не трогаем (для MVP нужды нет).
