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
try {
  const room = params.get("room");
  const store = room
    ? await (await import("../../server/table-client/netStore.js")).netStore({ room, client: "table3d", door: "guest", name: params.get("name") ?? "Гость 3D" })
    : (await import("../../server/table-client/localStore.js")).localStore();
  const { mountScene } = await import("./scene.js");
  const { mountHud } = await import("./hud.js");
  note.hidden = true;
  const stage = document.getElementById("stage")!;
  mountHud(document.getElementById("hud")!, stage, store, mountScene(stage, store));
} catch (e) {
  note.textContent = `Стол не открылся: ${e instanceof Error ? e.message : String(e)}`;
  throw e;
}

export {};
