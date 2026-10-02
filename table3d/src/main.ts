import "./uuid-polyfill";
import { lagFromUrl, slowed } from "../../server/table-client/lag.js";
// ПЕСОЧНИЦА НА THREE.JS — тот же стол, что `server/table-client`, другой экран. Стол и сеть — те же самые (`TableStore`:
// `localStore` — стол в этой вкладке с ботами, `netStore` — живая комната); рисует и ловит палец — `scene.ts`.
//
//   ?stand (или без параметров)      стол в этой вкладке, за ним боты — как `?stand` у стола
//   ?room=<подписанный id>&name=…    живая комната, дверь `guest` (сервер должен пускать гостей: `TABLE_GUESTS=1`)
//   &host=http://localhost:2611      чей это стол: оттуда комната и картинки карт (по умолчанию — тот сервер, что раздал страницу /table/3d; на стенде Vite — :2591)

const params = new URLSearchParams(location.search);
// Адрес стола — до того, как код стола прочтёт его (`host.ts` читает при загрузке), поэтому всё остальное — после.
(globalThis as { __TABLE_HOST__?: string }).__TABLE_HOST__ = params.get("host") ?? (location.pathname.startsWith("/table/") ? location.origin : `http://${location.hostname}:2591`);

const note = document.getElementById("note")!;
// СТЕНД ЛОАДЕРА (`/?loader` или `?loader=flip`): объёмный крест крутится сколько угодно; тап по нему листает варианты анимации — для просмотра.
if (params.has("loader")) {
  const { loader3d, LOADER_VARIANTS } = await import("./loader.js");
  note.hidden = true;
  const first = LOADER_VARIANTS.find((v) => v === params.get("loader")) ?? "spin";
  const l = loader3d(document.body, `Стол собирается · ${first}`, first);
  let k = LOADER_VARIANTS.indexOf(first);
  addEventListener("pointerdown", () => { k = (k + 1) % LOADER_VARIANTS.length; l.variant(LOADER_VARIANTS[k]!); l.say(`Стол собирается · ${LOADER_VARIANTS[k]}`); });
  await new Promise(() => {});
}
/** Экран — коробка со своей сценой и своим HUD: у каждого своя камера, свои окна, своя рука в пальце. */
function screenBox(first: boolean): { screen: HTMLElement; stage: HTMLElement; hud: HTMLElement } {
  const screen = document.createElement("div"), stage = document.createElement("div"), hud = document.createElement("div");
  screen.className = "screen";
  stage.className = "stage";
  hud.id = "hud";
  if (first) stage.id = "stage";
  screen.append(stage, hud);
  document.getElementById("screens")!.append(screen);
  return { screen, stage, hud };
}
// СВАЙП ВНИЗ НЕ ЗАКРЫВАЕТ СТОЛ — как у обычного клиента, в три слоя: Telegram не ловит жест (`disableVerticalSwipes`, ниже, когда SDK
// пришёл), `touchmove` отменяется у документа (слушатель НЕ пассивный, иначе отмена молча не работает; окна с собственной прокруткой —
// `[data-scroll]` — исключение), а страница в `index.html` не прокручивается и резинки не тянет.
// Зум страницы щипком или двойным тапом (iOS шлёт `gesturestart`) — не нужен: масштаб у стола свой.
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => { if (!(e.target as Element | null)?.closest?.("[data-scroll]")) e.preventDefault(); }, { passive: false });
const lag = lagFromUrl(location.search);
// Пока стол собирается и комната отвечает — объёмный крест вместо надписи (`loader.ts`).
let loading: { done(): void; say(label: string): void } | null = null;
if (!params.has("loader")) { const { loader3d } = await import("./loader.js"); loading = loader3d(document.body, "Стол собирается"); }
try {
  const tgStart = (globalThis as { Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } } }).Telegram?.WebApp?.initDataUnsafe?.start_param;
  const room = (params.get("room") || tgStart || new URLSearchParams(new URLSearchParams(location.hash.slice(1)).get("tgWebAppData") ?? "").get("start_param") || new URLSearchParams(location.hash.slice(1)).get("tgWebAppStartParam"))?.replace(/^3d_/, "") || null;
  const { mountScene } = await import("./scene.js");
  const { mountHud } = await import("./hud.js");
  if (room) {
    // Живая комната: один экран, один человек.
    // Двери — те же, что у обычного клиента: Telegram (подпись Mini App), пропуск приложения, гость.
    await Promise.race([(globalThis as { __tg?: Promise<void> }).__tg, new Promise((r) => setTimeout(r, 1500))]);
    const tg = (globalThis as { Telegram?: { WebApp?: { initData?: string; ready(): void; expand(): void } } }).Telegram?.WebApp;
    tg?.ready(); tg?.expand();
    (tg as { disableVerticalSwipes?(): void } | undefined)?.disableVerticalSwipes?.();
    const initData = tg?.initData || new URLSearchParams(location.hash.slice(1)).get("tgWebAppData") || "";
    const pass = params.get("pass"), key = params.get("key");
    const door = initData ? { door: "telegram" as const, initData }
      : key || pass ? { door: "app" as const, ...(key ? { key } : { pass: pass! }) }
      : { door: "guest" as const, name: params.get("name") ?? "Гость 3D" };
    const store = await (await import("../../server/table-client/netStore.js")).netStore({ room, client: "table3d", ...door });
    const box = screenBox(true);
    loading?.done();
    note.hidden = true;
    const scene = mountScene(box.stage, store);
    if (params.has("test")) (window as unknown as { __t3d: unknown }).__t3d = scene.test;
    mountHud(box.hud, box.stage, store, scene, undefined, box.screen);
  } else {
    // СТЕНД: один стол и два стенда на странице — мой экран и экран Алии. Оба живут всё время; управляю тем, что на весь экран (Tab
    // или кнопка DEV меняют их местами). Второй — либо скрыт, либо окном рядом: вид глазами другого, его камерой и столом не
    // управляют — только смотреть (кнопка «окно»).
    const { localTable } = await import("../../server/table-client/localStore.js");
    const table = localTable({ freeChair: true });
    const who = [{ key: "me", name: "Ye", ink: "#f2c14e" }, { key: "alia", name: "Алия", ink: "#7fd1b9" }];
    let shown = 0, peek = false;
    const apply = (): void => {
      screens.forEach((one, i) => {
        one.screen.classList.toggle("aside", i !== shown && peek);
        one.screen.classList.toggle("off", i !== shown && !peek);
      });
      (window as unknown as { __t3d: unknown }).__t3d = screens[shown]!.scene.test;
      (document.activeElement as HTMLElement | null)?.blur?.();
    };
    const swap = (): void => { shown = 1 - shown; apply(); };
    const screens = who.map((one, k) => {
      const box = screenBox(k === 0), store = slowed(table.view(one.key), lag), scene = mountScene(box.stage, store);
      box.screen.dataset.who = one.name;
      box.screen.style.setProperty("--who", one.ink);
      const other = who[1 - k]!;
      return {
        ...box, scene,
        mount: () => mountHud(box.hud, box.stage, store, scene, {
          label: `${one.name} → ${other.name}`, onSwitch: swap,
          peek: { label: other.name, on: () => peek, onToggle: () => { peek = !peek; apply(); } },
        }, box.screen),
      };
    });
    (window as unknown as { __t3dScreens: unknown }).__t3dScreens = screens.map((one) => one.scene.test);
    for (const one of screens) one.mount();
    loading?.done();
    note.hidden = true;
    apply();
    addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      swap();
    });
  }
} catch (e) {
  loading?.done();
  note.hidden = false;
  note.textContent = `Стол не открылся: ${e instanceof Error ? e.message : String(e)}`;
  throw e;
}

export {};
