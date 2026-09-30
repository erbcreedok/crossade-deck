// ПЕСОЧНИЦА НА THREE.JS — тот же стол, что `server/table-client`, другой экран. Стол и сеть — те же самые (`TableStore`:
// `localStore` — стол в этой вкладке с ботами, `netStore` — живая комната); рисует и ловит палец — `scene.ts`.
//
//   ?stand (или без параметров)      стол в этой вкладке, за ним боты — как `?stand` у стола
//   ?room=<подписанный id>&name=…    живая комната, дверь `guest` (сервер должен пускать гостей: `TABLE_GUESTS=1`)
//   &host=http://localhost:2611      чей это стол: оттуда комната и картинки карт (по умолчанию — стол на :2590)

const params = new URLSearchParams(location.search);
// Адрес стола — до того, как код стола прочтёт его (`host.ts` читает при загрузке), поэтому всё остальное — после.
(globalThis as { __TABLE_HOST__?: string }).__TABLE_HOST__ = params.get("host") ?? "http://localhost:2590";

const note = document.getElementById("note")!;
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
try {
  const room = params.get("room");
  const { mountScene } = await import("./scene.js");
  const { mountHud } = await import("./hud.js");
  if (room) {
    // Живая комната: один экран, один человек.
    const store = await (await import("../../server/table-client/netStore.js")).netStore({ room, client: "table3d", door: "guest", name: params.get("name") ?? "Гость 3D" });
    const box = screenBox(true);
    note.hidden = true;
    mountHud(box.hud, box.stage, store, mountScene(box.stage, store), undefined, box.screen);
  } else {
    // СТЕНД: один стол и два стенда на странице — мой экран и экран Алии. Оба живут всё время; Tab (или кнопка DEV) прыгает между ними,
    // и каждый помнит всё своё: камеру, окна, карту в пальце. Чей экран не на виду, тот только не рисуется поверх.
    const { localTable } = await import("../../server/table-client/localStore.js");
    const table = localTable({ freeChair: true });
    const who = [{ key: "me", name: "Ye" }, { key: "alia", name: "Алия" }];
    const screens = who.map((one, k) => {
      const box = screenBox(k === 0), store = table.view(one.key), scene = mountScene(box.stage, store);
      return { ...box, scene, mount: () => mountHud(box.hud, box.stage, store, scene, { label: `${one.name} → ${who[1 - k]!.name}`, onSwitch: () => show(1 - shown) }, box.screen) };
    });
    let shown = 0;
    const show = (k: number): void => {
      shown = k;
      screens.forEach((one, i) => one.screen.classList.toggle("off", i !== k));
      (window as unknown as { __t3d: unknown }).__t3d = screens[k]!.scene.test;
      (document.activeElement as HTMLElement | null)?.blur?.();
    };
    for (const one of screens) one.mount();
    note.hidden = true;
    show(0);
    addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      show(1 - shown);
    });
  }
} catch (e) {
  note.textContent = `Стол не открылся: ${e instanceof Error ? e.message : String(e)}`;
  throw e;
}

export {};
