// КОНТЕКСТ СБОРКИ ВИТРИНЫ — все двери, которыми секция РАССТАВЛЯЕТ содержимое, и вся DI-проводка к
// владельцам (реестр расставленных, спред, драг). Сцена только зовёт фабрику и отдаёт результат
// сборщику: контекст — единственное место, где «что доступно автору витрины» описано целиком.
//
// Контракт намеренно узкий: стори РАССТАВЛЯЕТ, а не строит. Расширяет SectionContext (kit/context.ts) —
// общий контракт витрины и песочницы; ровно из-за него стори может позвать НАСТОЯЩУЮ секцию стенда
// (kit/buttons.ts и т.п.), а не её копию: обе сцены умеют одно и то же, различаясь лишь тем, куда
// именно ложится узел.

import type { Application, Container } from "pixi.js";
import type { SceneApi } from "./sceneContract";
import type { SceneElement } from "./sceneEngine";
import type { CardTextureCache } from "../ui/CardTextureCache";
import { makeCard } from "../ui/Card";
import { buildPiece } from "../ui/pieceKinds";
import { TEX_H, TEX_W } from "./constants";
import type { DropZone } from "../ui/DropZone";
import { SingleDrag, GroupDrag } from "./drag";
import type { MarkerHost, MarkerState } from "./marker";
import type { Command } from "./command";
import { gripConfig } from "../kit/markerIcons";
import { attachControls } from "../ui/controls";
import { makeLabel, type Pt, type SectionContext } from "../kit/context";
import type { AnimPreset } from "../anim/presets";
import type { StackLayout } from "../kit/stackLayout";
import type { PieceDrag, SpreadConfig, StackDrag } from "../kit/stackInteraction";
import type { KitPlaced } from "./kitPlaced";
import type { KitSpread } from "./kitSpread";
import type { KitDrag } from "./kitDrag";

export interface KitContext extends SectionContext {
  readonly app: Application;
  /** Общий кэш текстур. Переживает rebuild — иначе текстуры перепекались бы на каждое переключение. */
  readonly tex: CardTextureCache;
  /** Масштаб карты витрины относительно исходной текстуры — тот же приём, что в песочнице. */
  readonly baseScale: number;
  /**
   * Поле витрины. Содержимое живёт в ПОЛОЖИТЕЛЬНОЙ четверти, (0,0) — левый верхний угол (та же
   * условность, что в песочнице): камера раскладывает контент в [0..w]×[0..h] и всё, что левее или
   * выше нуля, обрезает. Элемент прибит за ЦЕНТР, поэтому одиночный ставится в
   * `{ x: padding + hw, y: padding + hh }` — для этого padding и торчит наружу.
   */
  readonly padding: number;
  /** Поставить элемент: дом + глубина + учёт в хит-тесте, цикле, тенях и реестре по id. */
  add<T extends SceneElement>(el: T, home: Pt, depth?: number): T;
  /** Задать габарит витрины явно. Не задан — считается по краям расставленных элементов. */
  extent(w: number, h: number): void;
  /**
   * Включить СПРЕД у стопки: раздвиг жестом поверх базовой раскладки (kit/stackInteraction.ts —
   * spread.*Trigger решает, каким устройством). Матчасть там же, владелец механики — kitSpread.ts;
   * тут только регистрация.
   */
  spreadStack(ids: string[], at: Pt, layout: StackLayout, cell: { w: number; h: number }, cfg: SpreadConfig): void;
  /**
   * Включить ДРАГ КАРТ и/или ДРАГ ВСЕЙ СТОПКИ. `pieceDrag`: каким жестом берут отдельную карту
   * (`tap`/`hold`) и какую отдают («любую» под пальцем / только верхнюю — `pick`); `null` — карты по
   * отдельности не тащатся. `stackDrag`: стопка тащится ЦЕЛИКОМ (любая карта — ручка для всей пачки);
   * `null` — такого нет. Оба МОГУТ быть включены разом: у каждого свой триггер, и жест выбирает интент.
   * Владелец механики — kitDrag.ts; тут только регистрация.
   */
  dragConfig(ids: string[], pieceDrag: PieceDrag | null, stackDrag?: StackDrag | null): void;
}

export type KitBuild = (ctx: KitContext) => void;

export interface KitContextDeps {
  api: SceneApi;
  app: Application;
  tex: CardTextureCache;
  placed: KitPlaced;
  spread: KitSpread;
  drag: KitDrag;
  cardHeight: number;
  padding: number;
  /** Декор витрины и её зоны: сцена держит их, чтобы снести вместе с содержимым. */
  keepDecor(node: Container): void;
  keepZone(zone: DropZone): void;
  dispatch(cmd: Command): void;
  moveDuration(id: string): number;
  setExtent(w: number, h: number): void;
}

export function buildKitContext(deps: KitContextDeps): KitContext {
  const { api, placed, tex } = deps;
  const baseScale = deps.cardHeight / TEX_H;
  const layerOf = (layer: "surface" | "verb"): Container => (layer === "verb" ? api.layers().verb : api.layers().surface);
  const elementsOf = (ids: readonly string[]): SceneElement[] => ids.map((id) => api.byId.get(id)).filter((e): e is SceneElement => !!e);
  /** Состояние цели для меток: сколько её элементов живо (не сгорело) и сколько стоит дома, не в драге. */
  const presence = (ids: readonly string[]): MarkerState => {
    const live = elementsOf(ids);
    return { atHome: live.filter((el) => el.state !== "drag").length, total: live.length };
  };
  const addButton = (b: { root: Container }): void => {
    api.layers().surface.addChild(b.root);
  };

  const ctx: KitContext = {
    app: deps.app,
    tex,
    baseScale,
    cardW: TEX_W * baseScale,
    cardH: deps.cardHeight,
    padding: deps.padding,
    add: (el, home, depth = 0) => placed.add(el, home, depth),
    decor: (node, layer = "surface") => {
      deps.keepDecor(node);
      layerOf(layer).addChild(node);
    },
    label: (text, x, y, size, fill, wrap, anchorX, layer = "surface") => {
      const t = makeLabel(text, x, y, size, fill, wrap, anchorX);
      deps.keepDecor(t);
      layerOf(layer).addChild(t);
      return t;
    },
    // Витрина рождает карту СРАЗУ (в отличие от песочницы с её отложенными спеками): слои разведены
    // контейнерами, так что подписи под картой не окажутся, в каком бы порядке секция ни строилась.
    card: (opts, home, depth = 0, bobPhase = 0) => {
      if (opts.id) placed.spec(opts.id, () => ctx.card(opts, home, depth, bobPhase));
      const c = makeCard(opts, tex, baseScale);
      c.bobPhase = bobPhase;
      ctx.add(c, home, depth);
    },
    // Карта под управлением API: в реестре и в цикле она есть, в хит-тесте драга — нет.
    apiCard: (opts, home) => {
      ctx.add(makeCard({ ...opts, pose: opts.pose ?? "rest" }, tex, baseScale), home);
      placed.markLastApiDriven();
    },
    dispatch: (cmd) => deps.dispatch(cmd),
    piece: (id, home, spec, r, depth = 0, plan = {}) => {
      placed.spec(id, () => ctx.piece(id, home, spec, r, depth, plan));
      ctx.add(buildPiece(id, spec, r, api.renderer(), plan), home, depth);
    },
    // Метки. Механизм общий (SceneEngine.mountMarkers), «как выглядит грип» — общее с песочницей
    // (kit/markerIcons). Витрина отличается лишь тем, что груз собирается прямо из её реестра:
    // никаких стопок-объектов у неё нет, есть список id.
    solo: (id, slot, anchor) => {
      const host: MarkerHost = {
        slotPos: () => slot,
        state: () => presence([id]),
        makePayload: (cp) => {
          const el = api.byId.get(id);
          return el ? new SingleDrag(el, api.dragCtx(), cp) : null;
        },
      };
      return { ...api.mountMarkers(host, () => api.byId.get(id) ?? null, gripConfig(deps.cardHeight), anchor), host };
    },
    pile: (ids, slot, anchor) => {
      const host: MarkerHost = {
        slotPos: () => slot,
        state: () => presence(ids),
        makePayload: (cp) => {
          const els = elementsOf(ids);
          // «Врассыпную»: пачка сохраняет свою форму относительно пальца. Сжатие в руку — рычаг
          // песочницы (dragSqueeze), у витрины его нет и притворяться нечем.
          return els.length ? new GroupDrag(els, els.map((e) => ({ dx: e.body.px - cp.x, dy: e.body.py - cp.y })), api.dragCtx()) : null;
        },
      };
      return { ...api.mountMarkers(host, () => api.byId.get(ids[ids.length - 1] ?? "") ?? null, gripConfig(deps.cardHeight), anchor), host };
    },
    button: (b, at) => {
      if (at) b.place(at.x, at.y);
      addButton(b);
      api.buttonsRef().push(b);
      return b;
    },
    zone: (z, onDrop, accepts, textFor) => {
      api.registerZone(z, onDrop, accepts, textFor);
      deps.keepZone(z);
      return z;
    },
    needsPeek: (el) => api.needsPeek(el),
    element: (id) => api.byId.get(id),
    controls: (cfg, at, onChange) =>
      attachControls(
        cfg,
        {
          layer: api.layers().surface,
          register: (b) => {
            addButton(b);
            api.buttonsRef().push(b);
          },
          onChange: onChange ?? (() => api.wake()),
        },
        at,
      ),
    flipStack: (ids) => placed.flipStack(ids),
    setAnimPreset: (ids, preset) => {
      for (const id of ids) {
        placed.setPreset(id, preset);
        (api.byId.get(id) as unknown as { setAnimPreset?: (a: AnimPreset) => void } | undefined)?.setAnimPreset?.(preset);
      }
      api.wake();
    },
    appear: (ids) => {
      for (const id of ids) {
        const el = api.byId.get(id) as unknown as { appear?: () => void } | undefined;
        // Живой — проигрываем появление заново. Мёртвого сначала СОБИРАЕМ ЗАНОВО из спеки: без этого
        // «восстановить уничтоженное» упиралось бы в то, что восстанавливать нечего. Появление ему
        // нужно именно в этот момент — карта возвращается на стол, а не мигает при загрузке.
        if (el) {
          el.appear?.();
          continue;
        }
        if (!placed.rebuildFromSpec(id)) continue;
        (api.byId.get(id) as unknown as { appear?: () => void } | undefined)?.appear?.();
      }
      api.wake();
    },
    after: (delay, fn) => api.after(delay, fn),
    moveDuration: (id) => deps.moveDuration(id),
    animDuration: (id, kind) => api.animDuration(id, kind),
    wake: () => api.wake(),
    extent: (w, h) => deps.setExtent(w, h),
    spreadStack: (ids, at, layout, cell, cfg) => deps.spread.register(ids, at, layout, cell, cfg),
    dragConfig: (ids, pieceDrag, stackDrag = null) => deps.drag.register(ids, pieceDrag, stackDrag),
  };
  return ctx;
}
