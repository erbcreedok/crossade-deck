// HUD СЦЕНЫ — владелец экранного слоя виджетов (мобильное удобство): доки по краям, в каждом —
// ряд виджетов (доки зон, а дальше кнопки/реакции). ОТРЕЗКИ виджетов вдоль дока считает чистый
// hud/hudLayout (flex-как-данные: порядок, px/доли, justify, gap) — здесь раздача отрезков,
// ЖИЗНЬ доков зон (SceneZoneDock на каждый виджет kind:"zone"), заглушки-placeholder и резерв
// краёв для fitZoom. Generic-канон: SceneHud не знает, ЧТО в зоне, — док сам считает свою
// глубину (bandDepth) и рисует свою ленту; ноды всех доков живут на ОБЩЕМ слое cardLayer.

import { Container, Graphics, Text } from "pixi.js";
import { PIXEL_FONT } from "../../engine/constants";
import type { BoardSpec, HudDock, HudSide } from "../core/spec";
import type { SafeArea } from "./options";
import { hudDocks, hudSpans, type HudSpan } from "../hud/hudLayout";
import { stripConfig, stripKey } from "../strip/config";
import { paintStripBand } from "../strip/bandPaint";
import { SceneZoneDock } from "./zoneDock";

const PLACEHOLDER_DEPTH = 56; // глубина ленты-заглушки (макет будущего виджета)

export interface HudDeps {
  spec(): BoardSpec;
  accent(): number;
  wake(): void;
  selfSeat: string;
  /** Safe-zone приложения (рычаг сцены setSafeArea): доки и резервы отступают от этих полей. */
  safeArea(): SafeArea;
  /** ЖИВЫЕ полосы хрома (SceneChrome.topH/bottomH): 0 без кнопок — доки прибиты к краю. */
  chrome(): { top: number; bottom: number };
  /** Жители контейнера по ключу (снимок состояния). */
  members(slot: string): readonly string[];
  /** Перецелить пришвартованные ноды на свежие позы (гэп-превью) — зовёт nodeStore. */
  retarget(): void;
}

export class SceneHud {
  /** Слой HUD на chrome; ленты доков — под общим слоем нод. */
  readonly root = new Container();
  /** ОБЩИЙ слой пришвартованных нод (все доки): сюда nodeStore перекладывает их root'ы. */
  readonly cardLayer = new Container();
  private readonly decor = new Graphics(); // ленты заглушек
  private readonly labels = new Map<string, Text>();
  private readonly docks = new Map<string, SceneZoneDock>();
  private size = { w: 0, h: 0 };

  constructor(private readonly deps: HudDeps) {
    this.cardLayer.sortableChildren = true; // правый житель поверх левого; ленты — под всеми
    this.root.addChild(this.decor);
    this.root.addChild(this.cardLayer);
  }

  /** Доки зон (живой список — по текущей спеке). */
  list(): SceneZoneDock[] {
    return [...this.docks.values()];
  }

  /** Раздать виджетам отрезки доков, пересобрать доки зон и перерисовать заглушки. Каждый док
   *  отодвинут от СВОЕГО края на edge = safe-zone + inset дока; main-ось стартует за safe/хромом. */
  layout(w: number, h: number): void {
    this.size = { w, h };
    this.decor.clear();
    const spec = this.deps.spec();
    const seenDocks = new Set<string>();
    const seenLabels = new Set<string>();
    for (const dock of this.docks.values()) dock.setDock(null, null);
    for (const { side, dock } of hudDocks(spec.hud)) {
      const spans = hudSpans(this.dockLength(side), dock);
      const off = this.dockOffsets(side, dock);
      dock.widgets.forEach((widget, i) => {
        if (widget.kind === "zone") {
          const zd = this.dockFor(widget.zone);
          if (!zd) return; // виджет ссылается на не-ленту/чужой id — молча не швартуем
          seenDocks.add(widget.zone);
          zd.setDock(side, spans[i]!, off);
        } else this.paintPlaceholder(side, spans[i]!, widget.label ?? "", seenLabels, off);
      });
    }
    for (const [zid, dock] of this.docks) {
      if (seenDocks.has(zid)) continue;
      dock.destroy(); // зона ушла из HUD (на борду): её ноды заберёт ближайший sync
      this.docks.delete(zid);
    }
    for (const [key, label] of this.labels) {
      if (seenLabels.has(key)) continue;
      label.destroy();
      this.labels.delete(key);
    }
    for (const dock of this.docks.values()) dock.layout(w, h);
  }

  /** Резерв краёв под доки И safe-zone — стол вписывается в остаток (fitZoom). Низ включает
   *  полосу действий; края без доков резервируют свою safe-полосу (чёлку столом не накрываем). */
  reserved(w: number, h: number): { top: number; bottom: number; left: number; right: number } {
    this.layout(w, h);
    const safe = this.deps.safeArea();
    const r = { top: safe.top, bottom: safe.bottom, left: safe.left, right: safe.right };
    for (const { side, dock } of hudDocks(this.deps.spec().hud)) {
      const depth = Math.max(
        ...dock.widgets.map((wd) => (wd.kind === "zone" ? this.docks.get(wd.zone)?.bandDepth() ?? 0 : PLACEHOLDER_DEPTH)),
      );
      const edge = this.dockOffsets(side, dock).edge;
      const chrome = this.deps.chrome();
      r[side] = depth + edge + (side === "bottom" ? chrome.bottom : side === "top" ? chrome.top + 8 : 16);
    }
    return r;
  }

  /** Отступы дока: edge — от СВОЕГО края (safe + inset спеки); main — старт вдоль края (safe и,
   *  у вертикалей, живой хром верха); chrome — живые полосы (в рамку дока). */
  private dockOffsets(side: HudSide, dock: HudDock): { edge: number; main: number; chromeTop: number; chromeBottom: number } {
    const safe = this.deps.safeArea();
    const chrome = this.deps.chrome();
    const edge = (dock.inset ?? 0) + safe[side];
    const main = side === "left" || side === "right" ? chrome.top + safe.top : safe.left;
    return { edge, main, chromeTop: chrome.top, chromeBottom: chrome.bottom };
  }

  // ——— агрегат для жеста и nodeStore: спрашивают HUD, он находит нужный док ———

  /** Экранная поза пришвартованного жителя (первый док, знающий его) или null. */
  poseOf(id: string): { x: number; y: number; scale: number } | null {
    for (const dock of this.docks.values()) {
      const p = dock.poseOf(id);
      if (p) return p;
    }
    return null;
  }

  /** Ключ контейнера, чьим жителем id пришвартован («hand:p1»), или null — id не в HUD. */
  memberKey(id: string): string | null {
    for (const dock of this.docks.values()) {
      if (dock.active() && this.deps.members(dock.key).includes(id)) return dock.key;
    }
    return null;
  }

  /** Док, чья лента накрывает экранную точку (первый по порядку), или null — палец над бордой. */
  dockAt(sx: number, sy: number): SceneZoneDock | null {
    for (const dock of this.docks.values()) {
      if (dock.overBand(sx, sy)) return dock;
    }
    return null;
  }

  /** Житель дока под точкой — лидер драга (помечается dragging в его доке). */
  pickAt(sx: number, sy: number): string | null {
    for (const dock of this.docks.values()) {
      const id = dock.pickAt(sx, sy);
      if (id) return id;
    }
    return null;
  }

  /** Ленты всех доков в armed (груз в полёте), кроме exclude (он hot и красится сам). */
  armBands(exclude?: SceneZoneDock): void {
    for (const dock of this.docks.values()) {
      if (dock !== exclude) dock.setBand("armed");
    }
  }

  /** Конец жеста: снять пометки драга и вернуть покой всех лент. */
  clearDragging(): void {
    for (const dock of this.docks.values()) dock.clearDragging();
  }

  /** Дев-хук: экранные целевые позы жителей всех доков (по порядку доков и жителей). */
  screenPoses(): { zone: string; id: string; x: number; y: number }[] {
    return this.list().flatMap((d) => d.screenPoses());
  }

  /** Док зоны (создать при первом обращении). Не-лента или неизвестный id — null. */
  private dockFor(zoneId: string): SceneZoneDock | null {
    const existing = this.docks.get(zoneId);
    if (existing) return existing;
    const zone = this.deps.spec().zones.find((z) => z.id === zoneId);
    if (zone?.layout.kind !== "strip") return null;
    const key = stripKey(zoneId, this.deps.selfSeat);
    const dock = new SceneZoneDock(zoneId, key, {
      config: () => stripConfig(this.deps.spec().zones.find((z) => z.id === zoneId) ?? zone),
      members: () => this.deps.members(key),
      accent: this.deps.accent,
      wake: this.deps.wake,
      retarget: this.deps.retarget,
    });
    this.root.addChildAt(dock.band, 1); // над заглушками, под cardLayer
    this.docks.set(zoneId, dock);
    return dock;
  }

  /** Длина дока вдоль края: горизонтали — ширина минус safe-поля; вертикали — высота между
   *  живыми полосами хрома минус safe-поля верха/низа. */
  private dockLength(side: HudSide): number {
    const safe = this.deps.safeArea();
    const chrome = this.deps.chrome();
    if (side === "left" || side === "right") return Math.max(0, this.size.h - chrome.top - chrome.bottom - safe.top - safe.bottom);
    return Math.max(0, this.size.w - safe.left - safe.right);
  }

  /** Лента-заглушка виджета: тот же стиль ленты + подпись (макет для сторибука). */
  private paintPlaceholder(side: HudSide, span: HudSpan, text: string, seen: Set<string>, off: { edge: number; main: number; chromeTop: number; chromeBottom: number }): void {
    const b = this.placeholderRect(side, span, off);
    paintStripBand(this.decor, b, "rest", this.deps.accent());
    const key = `${side}:${span.from}`;
    seen.add(key);
    let label = this.labels.get(key);
    if (!label) {
      label = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: 0x9aa79c } });
      this.root.addChild(label);
      this.labels.set(key, label);
    }
    label.text = text;
    label.position.set(b.x + b.w / 2 - label.width / 2, b.y + b.h / 2 - label.height / 2);
  }

  private placeholderRect(side: HudSide, span: HudSpan, off: { edge: number; main: number; chromeTop: number; chromeBottom: number }): { x: number; y: number; w: number; h: number } {
    const d = PLACEHOLDER_DEPTH;
    if (side === "bottom") return { x: off.main + span.from, y: this.size.h - off.chromeBottom - off.edge - d, w: span.len, h: d };
    if (side === "top") return { x: off.main + span.from, y: off.chromeTop + off.edge + 8, w: span.len, h: d };
    const y = off.main + span.from;
    return side === "left" ? { x: 16 + off.edge, y, w: d, h: span.len } : { x: this.size.w - 16 - off.edge - d, y, w: d, h: span.len };
  }

  destroy(): void {
    for (const dock of this.docks.values()) dock.destroy();
    this.docks.clear();
    this.root.destroy({ children: true });
  }
}
