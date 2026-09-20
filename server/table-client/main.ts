// ВХОД В СТОЛ — решает, откуда стол, и больше ничего.
//
//   ?stand                         стенд: стол в этой вкладке, за ним боты
//   в Telegram (Mini App)          дверь `telegram`, комната — `start_param` (или `?room=`)
//   в браузере                     дверь `guest`: пустит, только если серверу это разрешено

import type { JoinOptions } from "../src/table/contract.js";
import { localStore } from "./localStore.js";
import { netStore } from "./netStore.js";
import { loadingCross } from "../../look/src/loading.js";
import { mountGround } from "./ground.js";
import { mountScreen } from "./screen.js";
import type { TableStore } from "./store.js";
import { watchScreen, witnessed, type ScreenHealth } from "./watch.js";

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string };
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
}

const telegram = (globalThis as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
const stage = document.getElementById("stage")!;
const params = new URLSearchParams(location.search);

function say(text: string): void {
  const note = document.getElementById("note")!;
  note.textContent = text;
  note.hidden = false;
}

async function open(): Promise<TableStore> {
  if (params.has("stand")) return localStore();
  const room = telegram?.initDataUnsafe.start_param || params.get("room") || params.get("tgWebAppStartParam");
  if (!room) throw new Error("Нет комнаты. Открой стол по ссылке из чата.");
  const options: JoinOptions = telegram?.initData
    ? { room, client: "html", door: "telegram", initData: telegram.initData }
    : { room, client: "html", door: "guest", name: params.get("name") ?? "Гость" };
  return netStore(options);
}

// СВАЙП ВНИЗ НЕ ЗАКРЫВАЕТ СТОЛ — в три слоя, потому что каждый закрывает свою дыру:
//   1. `disableVerticalSwipes` — сам Telegram перестаёт ловить жест (клиенты с Bot API 7.7+);
//   2. `touchmove` отменяется у документа — старый клиент и iOS не получают ни прокрутки, ни резинки,
//      за которую Telegram тянет окно (слушатель НЕ пассивный, иначе отмена молча не работает).
//      ИСКЛЮЧЕНИЕ — окна, которые прокручиваются сами (`[data-scroll]`, например настройки): там палец
//      ведёт содержимое окна, а не стол, и отменять его нечего;
//   3. CSS в `index.html` — страница не прокручивается, и тянуть её не за что.
telegram?.ready();
telegram?.expand();
telegram?.disableVerticalSwipes?.();
document.addEventListener(
  "touchmove",
  (e) => {
    if (!(e.target as Element | null)?.closest?.("[data-scroll]")) e.preventDefault();
  },
  { passive: false },
);
mountGround(stage);
// ЛОАДЕР ХАБА — до входа и до последней картинки колоды. Поверх всего: у стола свои слои выше.
const loading = loadingCross(document.body, "Загружаю стол");
(document.body.lastElementChild as HTMLElement).style.zIndex = "1000";

// ЖУРНАЛ ЭКРАНА НАЧИНАЕТСЯ ДО ВХОДА: падение при загрузке — тоже рассказ, и именно его разобрать
// труднее всего. Пока хранилища нет, рассказывать некуда, и пачка ждёт в памяти до первого `tell`
// после входа.
let tellStore: TableStore | undefined;
let screenHealth: ScreenHealth | undefined;
const witness = watchScreen((seen) => tellStore?.log(seen), {
  sound: () => screenHealth?.sound() ?? null,
  voice: () => screenHealth?.voice() ?? null,
});

open()
  .then((store) => {
    tellStore = store;
    document.title = store.title;
    const screen = mountScreen(stage, witnessed(store, witness), witness);
    screenHealth = screen.health;
    store.onGone(() => say("Стол закрыт."));
    return screen.ready.then(() => loading.done());
  })
  .catch((err: unknown) => {
    loading.done();
    const text = err instanceof Error ? err.message : String(err);
    witness.saw("open.failed", { text: text.slice(0, 300) });
    witness.tell();
    say(/who are you|unsigned/.test(text) ? "Сюда так не войти. Открой стол по ссылке из чата." : text);
  });
