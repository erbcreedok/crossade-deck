// МЕТКИ ЗАХВАТА — коллаборатор SceneEngine поверх marker.ts: «ручки» целей (драггер едет с
// грузом, якорь стоит дома по политике видимости). Цель за меткой — что угодно (стопка, столбик,
// фигура): host отдаёт слот/состояние/ГРУЗ (makePayload), движок про её природу не знает.
// Механизм generic и нужен каждой сцене с ручками — потому живёт движковым модулем, не в песочнице.

import type { Container } from "pixi.js";
import type { DragPayload } from "./drag";
import { Marker, withAnchor, withDragger, type MarkerConfig, type MarkerHost, type ShowPolicy } from "./marker";

export interface Grabber<El> {
  marker: Marker;
  host: MarkerHost;
  lead: () => El | null;
}

export interface MarkerLayers {
  verb: Container;
  surface: Container;
  dragLayer: Container;
}

export class SceneMarkers<El> {
  private markers: Marker[] = [];
  private grabbers: Grabber<El>[] = [];
  /** За какую метку сейчас тянут (follow/endFollow). */
  private grabbed: Marker | null = null;
  /** Host захватываемой цели — живёт между pickElement и beginDrag. */
  private pendingHost: MarkerHost | null = null;

  /** Навесить пару меток (драггер + якорь) на ЛЮБОЙ host и учесть их в хит-тесте захвата. */
  mount(
    layers: MarkerLayers,
    host: MarkerHost,
    lead: () => El | null,
    dragger: Omit<MarkerConfig, "show"> & { show?: ShowPolicy },
    anchorCfg: Omit<MarkerConfig, "show" | "follow" | "hit"> & { show?: ShowPolicy },
  ): { dragger: Marker; anchor: Marker } {
    const d = withDragger(host, layers.verb, layers.dragLayer, dragger);
    const a = withAnchor(host, layers.surface, anchorCfg);
    this.markers.push(d, a);
    this.grabbers.push({ marker: d, host, lead });
    return { dragger: d, anchor: a };
  }

  /** Снести метки (пересборка содержимого). Зовут из своего clearContent. */
  clear(): void {
    for (const m of this.markers) m.destroy();
    this.markers = [];
    this.grabbers = [];
    this.grabbed = null;
    this.pendingHost = null;
  }

  /** Метка-драггер под точкой: за ручку тянут ЦЕЛЬ, а не то, что под ней. Запоминает host до
   *  beginDrag и возвращает лида (верхнюю карту стопки / соло-элемент). undefined — меток нет. */
  pickAt(cx: number, cy: number): El | null | undefined {
    const g = this.grabbers.find((gr) => gr.marker.interactive && gr.marker.hitTest(cx, cy));
    if (!g) return undefined;
    this.pendingHost = g.host;
    this.grabbed = g.marker;
    return g.lead();
  }

  /** Груз запомненной цели (beginDrag): есть — грип едет за пальцем; нет — метка забывается. */
  takePayload(cp: { x: number; y: number }): DragPayload | null {
    const payload = this.pendingHost?.makePayload?.(cp) ?? null;
    this.pendingHost = null;
    if (payload) this.grabbed?.beginFollow();
    else this.grabbed = null;
    return payload;
  }

  followTo(p: { x: number; y: number }): void {
    this.grabbed?.followTo(p);
  }

  endFollow(): void {
    this.grabbed?.endFollow();
    this.grabbed = null;
  }

  list(): readonly Marker[] {
    return this.markers;
  }

  grabberList(): readonly Grabber<El>[] {
    return this.grabbers;
  }
}
