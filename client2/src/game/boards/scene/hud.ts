// HUD СЦЕНЫ — владелец экранного слоя областей (мобильное удобство): регионы краёв и пины,
// в каждой области — мини-флекс виджетов (доки зон, заглушки; дальше — кнопки/реакции).
// ВСЮ геометрию (лейны, углы по владельцам, пины) считает чистый hud/hudLayout (areaFrames);
// здесь — раздача готовых рамок докам, жизнь доков зон (SceneZoneDock на виджет kind:"zone"),
// заглушки и резерв краёв (hud/reserve) для fitZoom. Generic-канон: SceneHud не знает, ЧТО
// в зоне, — док сам считает глубину (bandDepth); ноды всех доков живут на ОБЩЕМ cardLayer.

import { Container } from "pixi.js";
import type { BoardSpec, HudArea } from "../core/spec";
import type { SafeArea } from "./options";
import { areaFrames, type AreaFrame } from "../hud/hudLayout";
import { hudReserved } from "../hud/reserve";
import type { HudEnv } from "../hud/regions";
import { dockSlotKey, zoneDockConfig } from "../strip/presentation";
import { SceneZoneDock } from "./zoneDock";
import { PLACEHOLDER_DEPTH, ScenePlaceholders } from "./hudPlaceholders";

export interface HudDeps {
  spec(): BoardSpec;
  accent(): number;
  wake(): void;
  selfSeat: string;
  /** Safe-zone приложения (рычаг сцены setSafeArea): области и резервы отступают от полей. */
  safeArea(): SafeArea;
  /** ЖИВЫЕ полосы хрома (SceneChrome.topH/bottomH): 0 без кнопок — области прибиты к краю. */
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
  private readonly placeholders: ScenePlaceholders;
  private readonly docks = new Map<string, SceneZoneDock>();
  private size = { w: 0, h: 0 };

  constructor(private readonly deps: HudDeps) {
    this.cardLayer.sortableChildren = true; // правый житель поверх левого; ленты — под всеми
    this.placeholders = new ScenePlaceholders(this.root, deps.accent);
    this.root.addChild(this.cardLayer);
  }

  /** Доки зон (живой список — по текущей спеке). */
  list(): SceneZoneDock[] {
    return [...this.docks.values()];
  }

  /** Раздать областям рамки (лейны, углы, пины — чистый areaFrames), пересобрать доки зон и
   *  заглушки. Два прохода: глубина дока известна только с рамкой, второй проход уточняет
   *  угловые вычеты по свежим bandDepth (сходится за шаг — глубина от лейна не зависит). */
  layout(w: number, h: number): void {
    this.size = { w, h };
    this.applyFrames(this.frames());
    this.applyFrames(this.frames());
  }

  /** Резерв краёв под области И safe-zone — стол вписывается в остаток (fitZoom). Формула одна
   *  с угловыми вычетами лейнов (hud/reserve): чёлку и полосу действий столом не накрываем. */
  reserved(w: number, h: number): { top: number; bottom: number; left: number; right: number } {
    this.layout(w, h);
    return hudReserved(this.deps.spec().hud, this.env(), (a) => this.areaDepth(a));
  }

  private env(): HudEnv {
    return { w: this.size.w, h: this.size.h, safe: this.deps.safeArea(), chrome: this.deps.chrome() };
  }

  private frames(): AreaFrame[] {
    return areaFrames(this.deps.spec().hud, this.env(), (a) => this.areaDepth(a));
  }

  /** Глубина области — самый толстый виджет: у дока зоны своя (bandDepth), у заглушки макетная. */
  private areaDepth(a: HudArea): number {
    return Math.max(...a.widgets.map((w) => (w.kind === "zone" ? this.docks.get(w.zone)?.bandDepth() ?? PLACEHOLDER_DEPTH : PLACEHOLDER_DEPTH)));
  }

  private applyFrames(frames: AreaFrame[]): void {
    const seenDocks = new Set<string>();
    this.placeholders.begin();
    for (const dock of this.docks.values()) dock.setDock(null, null);
    for (const f of frames) {
      const off = this.frameOffsets(f);
      f.area.widgets.forEach((widget, i) => {
        const span = f.widgets[i]!;
        if (widget.kind === "zone") {
          const zd = this.dockFor(widget.zone);
          if (!zd) return; // не-лента: validateHud уже пожаловался в dev — тихих переездов нет
          seenDocks.add(widget.zone);
          zd.setDock(f.side, span, off);
        } else this.placeholders.paint(this.size, f, span, off, widget.label ?? "");
      });
    }
    for (const [zid, dock] of this.docks) {
      if (seenDocks.has(zid)) continue;
      dock.destroy(); // зона ушла из HUD (на борду): её ноды заберёт ближайший sync
      this.docks.delete(zid);
    }
    this.placeholders.sweep();
    for (const dock of this.docks.values()) dock.layout(this.size.w, this.size.h);
  }

  /** Отступы рамки для дока: edge — от СВОЕГО края (чистый areaFrames: safe+inset или якорь
   *  пина); хром двигает только регионы (пины живут поверх и хрома не знают). */
  private frameOffsets(f: AreaFrame): { edge: number; main: number; chromeTop: number; chromeBottom: number; pinned: boolean } {
    const chrome = f.pinned ? { top: 0, bottom: 0 } : this.deps.chrome();
    return { edge: f.edge, main: 0, chromeTop: chrome.top, chromeBottom: chrome.bottom, pinned: f.pinned };
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

  /** Доки в порядке СПОРА за экранную точку: пины (поверх) раньше регионов. */
  private byOverlay(): SceneZoneDock[] {
    return [...this.docks.values()].sort((a, b) => Number(b.pinned()) - Number(a.pinned()));
  }

  /** Док, чья лента накрывает экранную точку, или null — палец над бордой. Пин выигрывает спор. */
  dockAt(sx: number, sy: number): SceneZoneDock | null {
    for (const dock of this.byOverlay()) {
      if (dock.overBand(sx, sy)) return dock;
    }
    return null;
  }

  /** Житель дока под точкой — лидер драга (помечается dragging в его доке). */
  pickAt(sx: number, sy: number): string | null {
    for (const dock of this.byOverlay()) {
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

  /** Док зоны (создать при первом обращении). Недокуемый layout-kind или чужой id — null. */
  private dockFor(zoneId: string): SceneZoneDock | null {
    const existing = this.docks.get(zoneId);
    if (existing) return existing;
    const zone = this.deps.spec().zones.find((z) => z.id === zoneId);
    if (!zone || !zoneDockConfig(zone)) return null;
    const key = dockSlotKey(zone, this.deps.selfSeat);
    const dock = new SceneZoneDock(zoneId, key, {
      config: () => zoneDockConfig(this.deps.spec().zones.find((z) => z.id === zoneId) ?? zone)!,
      members: () => this.deps.members(key),
      accent: this.deps.accent,
      wake: this.deps.wake,
      retarget: this.deps.retarget,
    });
    this.root.addChildAt(dock.band, 1); // над заглушками, под cardLayer
    this.docks.set(zoneId, dock);
    return dock;
  }

  destroy(): void {
    for (const dock of this.docks.values()) dock.destroy();
    this.docks.clear();
    this.root.destroy({ children: true });
  }
}
