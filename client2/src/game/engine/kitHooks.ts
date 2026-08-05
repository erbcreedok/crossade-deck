// ДЕВ-ХУКИ ВИТРИНЫ — снимок того, что сейчас на столе, в ЭКРАННЫХ координатах: для проверки руками
// и из e2e (как __fd у песочницы). Канвас не отдаёт ни DOM-узлов, ни ролей, поэтому это единственный
// способ спросить у витрины, что она показывает.

import type { SceneApi } from "./sceneContract";
import type { DropZone } from "../ui/DropZone";
import type { KitPlaced } from "./kitPlaced";

export interface KitHooks {
  elements: { id: string; x: number; y: number; state: string; faceUp: boolean | null; concealed: boolean | null }[];
  zones: Record<string, { x: number; y: number; hot: boolean; armed: boolean }>;
  buttons: { label: string; x: number; y: number }[];
  /** Экранные центры меток-грипов. Метка — не элемент и не кнопка; без этого за неё не потянуть ни
   *  руками из консоли, ни из e2e. */
  grips: { x: number; y: number; interactive: boolean }[];
  /** ВСЕ метки (грипы и якоря) с габаритом рисунка и видимостью. Габарит нужен, чтобы отличить ОДНУ
   *  иконку от другой: сравнение кадров тут не работает — карты стенда левитируют, и кадр отличается
   *  сам по себе, что бы ни поменялось. */
  markers: { x: number; y: number; w: number; h: number; shown: boolean; interactive: boolean }[];
  extent: { w: number; h: number };
  /** КАМЕРА витрины (сдвиг и масштаб): контентная точка → экранная как `x + cx * zoom`. Нужна
   *  всякому, кто ведёт палец в точку КОНТЕНТА (e2e, сценарии `play()`): канвас занимает весь кадр,
   *  витрина стоит по центру и ужимается, так что «где предмет» и «куда ткнуть» — разные числа.
   *  Раньше это читали прямо у сцены (`scene.viewport`) — с переходом на композицию камера уехала к
   *  движку, и такие читатели молча сломались. Дев-хук — единственная дверь внутрь канваса. */
  camera: { x: number; y: number; zoom: number };
}

export function kitHooks(api: SceneApi, placed: KitPlaced, zones: readonly DropZone[]): KitHooks {
  const zoneMap: KitHooks["zones"] = {};
  for (const z of zones) {
    const s = api.contentToScreen(z.rect.x + z.rect.w / 2, z.rect.y + z.rect.h / 2);
    // Состояние читаем по ВИДИМОСТИ подписей — тем же способом, что песочница: у зоны нет флагов
    // наружу, а видимый глагол и есть «зона горит».
    zoneMap[z.label] = { x: s.x, y: s.y, hot: z.verb.visible, armed: z.armedText?.visible ?? false };
  }
  return {
    elements: placed.list().map((p) => {
      const s = api.contentToScreen(p.el.body.px, p.el.body.py);
      // faceUp/concealed — не у всякого элемента (фишка их не знает), поэтому по способностям, а не
      // по типу. Без них «доска изменилась» пришлось бы доказывать глазами по скриншоту.
      const e = p.el as unknown as { faceUp?: boolean; concealed?: boolean };
      return {
        id: p.el.id,
        x: s.x,
        y: s.y,
        state: p.el.state,
        faceUp: typeof e.faceUp === "boolean" ? e.faceUp : null,
        concealed: typeof e.concealed === "boolean" ? e.concealed : null,
      };
    }),
    zones: zoneMap,
    buttons: api.buttonsRef().map((b) => {
      const s = api.contentToScreen(b.x, b.y);
      return { label: b.labelText, x: s.x, y: s.y };
    }),
    grips: [...api.grabbersList()].map((g) => {
      const s = api.contentToScreen(g.marker.gfx.position.x, g.marker.gfx.position.y);
      return { x: s.x, y: s.y, interactive: g.marker.interactive };
    }),
    markers: [...api.markersList()].map((m) => {
      const s = api.contentToScreen(m.gfx.position.x, m.gfx.position.y);
      const b = m.gfx.getLocalBounds();
      return { x: s.x, y: s.y, w: Math.round(b.width), h: Math.round(b.height), shown: m.shown(), interactive: m.interactive };
    }),
    extent: api.contentSize(),
    camera: { x: api.viewport().x, y: api.viewport().y, zoom: api.viewport().zoom },
  };
}
