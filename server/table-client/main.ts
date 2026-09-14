// ВХОД В СТОЛ — решает, откуда стол, и больше ничего.
//
//   ?stand                         стенд: стол в этой вкладке, за ним боты
//   в Telegram (Mini App)          дверь `telegram`, комната — `start_param` (или `?room=`)
//   в браузере                     дверь `guest`: пустит, только если серверу это разрешено

import type { JoinOptions } from "../src/table/contract.js";
import { localStore } from "./localStore.js";
import { netStore } from "./netStore.js";
import { mountScreen } from "./screen.js";
import type { TableStore } from "./store.js";

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

telegram?.ready();
telegram?.expand();
telegram?.disableVerticalSwipes?.();

open()
  .then((store) => {
    document.title = store.title;
    mountScreen(stage, store);
    store.onGone(() => say("Стол закрыт."));
  })
  .catch((err: unknown) => {
    const text = err instanceof Error ? err.message : String(err);
    say(/who are you|unsigned/.test(text) ? "Сюда так не войти. Открой стол по ссылке из чата." : text);
  });
