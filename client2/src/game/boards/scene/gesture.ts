// ЖЕСТ НАД БОРДОЙ — владелец всего, что происходит между «палец коснулся» и «ход ушёл в порт»: что
// вообще берётся, каким жестом, что светится под пальцем, куда прилипает груз, во что превращается
// дроп и что видят остальные клиенты.
//
// Правил тут нет — они данные и чистые планировщики (geometry/dropPlan.ts, geometry/sceneAreas.ts).
// Здесь порядок действий вокруг них, и именно в нём легко ошибиться молча:
//   • подсветка перекрашивается только когда цель СМЕНИЛАСЬ (иначе перерисовка на каждую точку);
//   • блок-драг колоды не светит боксы вовсе — тащат стопку, а не карту в слот;
//   • дроп в фикс-зону у низа экрана (мобильный заменитель ПКМ) разбирается ДО плана дропа: груз
//     летит домой, а действие зоны выполняется;
//   • конец жеста обязан снять всё: подсветку, фикс-зоны, сдвиг блок-драга и live-лок.

import { Graphics } from "pixi.js";
import type { SceneElement } from "../../engine/sceneEngine";
import type { DragPayload } from "../../engine/drag";
import { dropTargetRect, measure, type DropProbe } from "../../slot/slot";
import { dropOf, type Group } from "../../slot/types";
import { CARD } from "../../crossade/tree";
import { hintShape } from "../geometry/sceneAreas";
import { freeZoneAt, isDeckSlot, planDrop, reorderModeOf, type DropWorld } from "../geometry/dropPlan";
import { baseZoneId, slotKey, zoneOf, type BoardCommand, type BoardSpec, type ElementDef } from "../core/spec";
import { handKey, type BoardState } from "../core/state";
import type { BoardTree } from "../geometry/boardTree";
import { DropBar } from "../../ui/DropBar";
import type { BoardNode } from "./nodeFactory";
import type { SceneBlockDrag } from "./blockDrag";
import type { SceneDeckActions } from "./deckActions";
import type { SceneHandHud } from "./handHud";
import type { SceneMenu } from "./menu";
import type { ScenePresence } from "./scenePresence";
import type { ScenePresenceOptions } from "./options";

export interface GestureDeps {
  state(): BoardState;
  tree(): BoardTree;
  spec(): BoardSpec;
  def(id: string): ElementDef | undefined;
  world(): DropWorld;
  selfSeat: string;
  /** Борда только смотрится (витрина без взаимодействия) — тогда ничего не берётся. */
  interactive: boolean;
  presence: ScenePresenceOptions | undefined;
  accent(): number;
  dispatch(cmd: BoardCommand): void;
  node(id: string): BoardNode | undefined;
  // двери движка
  width(): number;
  height(): number;
  wake(): void;
  drag(): DragPayload | null;
  dragScreen(): { x: number; y: number };
  grabMode(): "tap" | "hold";
  defaultBeginDrag(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean;
  // соседи-владельцы
  blockDrag: SceneBlockDrag;
  deckActions: SceneDeckActions;
  menu: SceneMenu;
  presenceOwner: ScenePresence;
  /** Экранная рука-HUD: захват карты руки, дроп-зона «взять/реордер», состояния зоны. */
  handHud: SceneHandHud;
  /** Состав своей руки (для «карта руки?» и «from = рука»). */
  handMembers(): readonly string[];
  /** Вживую переложить ноду драга в пространство руки (экран) или борды (контент) — nodeStore. */
  setDragSpace(id: string, space: "content" | "hand"): void;
}

export class SceneGesture {
  /** Слой подсветки цели — свой, поверх декора: сцена кладёт его в surface. */
  readonly hintLayer = new Graphics();
  /** Фиксированные дроп-зоны у низа экрана (мобильный ПКМ): видны только во время драга. */
  readonly dropBar = new DropBar();

  private dragging = false;
  private hotSlot: string | null = null;
  private grabbedEl: string | null = null;

  constructor(private readonly deps: GestureDeps) {}

  /**
   * Смарт-мок щедрый: тащится верх любого слота стола и любая карта своей руки. Чужая рука — нет
   * (приватность), правила «чей ход» ничего не запрещают (индикация, BOARDS-DESIGN §3). В live
   * элемент в чужих руках не берётся: кто первый схватил, тот и управляет.
   */
  canDrag(el: SceneElement): boolean {
    if (!this.deps.interactive) return false;
    const p = this.deps.presence;
    if (p) {
      const owner = p.hub.heldBy(el.id);
      if (owner && owner !== p.who) return false;
    }
    if (this.deps.handMembers().includes(el.id)) return true; // карта своей ЭКРАННОЙ руки (вне дерева)
    const slot = this.deps.tree().slotOf(el.id);
    if (!slot) return false;
    if (zoneOf(slot) === "seat") return false;
    if (slot === handKey(this.deps.selfSeat)) return true;
    // Реордер-зона (flow-грид): жители разложены веером по позициям — хватается ЛЮБОЙ, не верх.
    if (reorderModeOf(this.deps.world(), slot)) return true;
    const members = this.deps.state().field.slots[slot]?.members ?? [];
    return members[members.length - 1] === el.id;
  }

  /** У жителей КОЛОДЫ ДВА драг-интента: тап тащит верхнюю карту, hold — всю колоду блоком.
   *  Свободные стопки (слоты ≥ 1) блоком не таскаются — это просто карты, лежащие где положили. */
  dragOnHold(el: SceneElement): boolean { const s = this.deps.tree().slotOf(el.id); return !!s && isDeckSlot(this.deps.world(), s); }

  begin(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean {
    this.deps.menu.close(); // начался драг — меню больше не к месту
    // Live-лок: гонка на первом касании решается хабом; отказ — элемент уже у другого.
    const p = this.deps.presence;
    if (p) {
      if (!p.hub.grab(p.who, el.id)) return false;
      this.grabbedEl = el.id;
    }
    this.dragging = true;
    const slot = this.deps.tree().slotOf(el.id);
    const zone = slot ? baseZoneId(zoneOf(slot)) : null;
    if (slot && zone && isDeckSlot(this.deps.world(), slot) && this.deps.grabMode() === "hold" && this.deps.blockDrag.begin(zone, slot, cp)) {
      // Тащим ВСЮ стопку как блок: жест берёт весь слот, а не верхнюю карту. Колода в пальцах →
      // снизу прилипают фикс-зоны её меню (мобильный заменитель ПКМ).
      this.showBar([
        { key: "menu", label: "настройка" },
        { key: "shuffle", label: "перемешать" },
      ]);
      this.deps.presenceOwner.paint(); // grab эмитил присутствие ДО того, как стало известно, что это блок
      return true;
    }
    // Карта своей руки: перевести ТУ ЖЕ ноду из руки (экран) в контент — дальше обычный драг.
    if (this.deps.handMembers().includes(el.id)) this.deps.setDragSpace(el.id, "content");
    const ok = this.deps.defaultBeginDrag(el, cp, sp);
    // Одиночная карта в пальцах: у неё тоже есть меню — зона «настройка» (armed/hot зоны ведёт moved).
    if (ok) this.showBar([{ key: "menu", label: "настройка" }]);
    return ok;
  }

  moved(p: { x: number; y: number }): void {
    if (this.dropBar.visible) {
      const ds = this.deps.dragScreen();
      this.dropBar.hotAt(ds.x, ds.y);
      this.deps.wake();
    }
    // Драг-стрим: остальным клиентам — ЦЕНТР карты в пальцах (не точка хвата), темп курсора.
    // Блок-драг колоды — той же строкой с флагом block: зрители двигают ВСЮ стопку той же дельтой.
    const pr = this.deps.presence;
    const gn = pr && this.grabbedEl ? this.deps.node(this.grabbedEl) : null;
    if (pr && gn) pr.hub.drag(pr.who, this.grabbedEl!, { x: gn.body.px, y: gn.body.py }, this.deps.blockDrag.active());
    if (this.deps.blockDrag.active()) return; // блок-драг колоды: бокс не подсвечиваем никак
    const lead = this.deps.drag()?.lead;
    const dsh = this.deps.dragScreen();
    // Взаимоисключающе: палец НАД РУКОЙ → карта на слой руки (сверху, среди своих), светится ТОЛЬКО
    // рука, борду гасим. Иначе → карта на борде, светится стол, рука лишь «armed».
    if (lead && this.deps.handHud.overBand(dsh.x, dsh.y)) {
      this.deps.setDragSpace(lead.id, "hand");
      const pose = this.deps.handHud.dragPose(dsh.x);
      lead.body.setTarget({ x: pose.x, y: pose.y, scale: pose.scale, rot: 0 });
      this.deps.handHud.hoverAt(dsh.x); // hot + гэп-превью: ряд раздвигается под индекс вставки
      if (this.hotSlot !== null) { this.hotSlot = null; this.paintHints(); }
      this.deps.wake();
      return;
    }
    if (lead) this.deps.setDragSpace(lead.id, "content");
    this.deps.handHud.setZone("armed");
    const target = dropTargetRect(this.deps.tree().root, this.probe(p));
    this.applyMagnet(target);
    // Приоритет подсветки: конкретная цель (колода/стопка/центр) → сам бокс free-зоны
    // (псевдо-слот «zone:box»: карта ляжет свободно) → ничего.
    const fz = freeZoneAt(this.deps.world(), p);
    const hot = target?.group.id ?? (fz ? slotKey(fz, "box") : null);
    if (hot === this.hotSlot) return;
    this.hotSlot = hot;
    this.paintHints();
    this.deps.wake();
  }

  resolve(el: SceneElement, cp: { x: number; y: number }): void {
    const drag = this.deps.drag();
    if (!drag) return;
    const ds = this.deps.dragScreen();
    // Дроп в фикс-зону у низа экрана: груз летит домой, действие зоны выполняется.
    const bar = this.dropBar.visible ? this.dropBar.hotAt(ds.x, ds.y) : null;
    if (bar) {
      const slot = this.deps.tree().slotOf(el.id);
      const wasBlock = this.deps.blockDrag.active();
      this.deps.blockDrag.cancel(); // сдвиг колоды не меняем — стопка вернётся, откуда поднята
      drag.release();
      if (!slot) return;
      if (bar === "shuffle") this.deps.deckActions.shuffle(slot);
      else this.deps.menu.openFor(wasBlock ? { kind: "deck", slot } : { kind: "card", id: el.id }, { x: ds.x, y: ds.y - 200 });
      return;
    }
    if (this.deps.blockDrag.active()) {
      // Блок-драг колоды: решает коллаборатор (внутри бокса — offsetFree, мимо — без изменений).
      this.deps.blockDrag.resolveAt(cp);
      drag.release();
      return;
    }
    // Дроп над полосой руки: «взять со стола» или реордер внутри руки. Экранная проверка — ДО плана
    // борды: рука вне дерева, её судит HUD по экранной точке.
    const dsr = this.deps.dragScreen();
    if (this.deps.handHud.overBand(dsr.x, dsr.y)) {
      const to = handKey(this.deps.selfSeat);
      const from = this.fromSlotOf(el.id);
      const idx = this.deps.handHud.insertIndexAt(dsr.x);
      // Груз обязан лечь В ПОКАЗАННЫЙ ГЭП: со стола — move (аппенд) + реордер на индекс превью.
      if (from && from !== to) this.deps.dispatch({ t: "move", el: el.id, from, to });
      if (from) {
        const order = this.deps.handMembers().filter((m) => m !== el.id);
        order.splice(Math.min(idx, order.length), 0, el.id);
        this.deps.dispatch({ t: "reorderHand", seat: this.deps.selfSeat, order });
      }
      drag.release();
      return;
    }
    const target = dropTargetRect(this.deps.tree().root, this.probe(cp));
    const node = this.deps.node(el.id);
    const plan = planDrop(this.deps.world(), {
      el: el.id,
      from: this.fromSlotOf(el.id),
      target: target ? { slot: target.group.id, index: target.index } : null,
      cp,
      myHand: handKey(this.deps.selfSeat),
      handReorder: this.deps.spec().hand?.reorder ?? false,
      carriedFaceUp: node?.kind === "card" ? node.faceUp : null,
    });
    if (plan.kind === "command") this.deps.dispatch(plan.cmd);
    drag.release(); // состояние уже новое: дом = целевой слот, release долетает туда
  }

  /** Конец жеста (отмена или дроп): снять подсветку, фикс-зоны, сдвиг блок-драга и live-лок. */
  end(): void {
    this.dragging = false;
    this.hotSlot = null;
    this.deps.blockDrag.cancel(); // не тащим сдвиг в следующий жест
    this.dropBar.hide(); // фикс-зоны живут только пока элемент в пальцах
    this.deps.handHud.clearDragging(); // вернуть HUD-спрайт руки и покой дроп-зоны
    if (this.grabbedEl && this.deps.presence) {
      const p = this.deps.presence;
      p.hub.drag(p.who, this.grabbedEl, null); // конец стрима: дальше карту ведёт снимок
      p.hub.release(p.who, this.grabbedEl);
      this.grabbedEl = null;
    }
    this.paintHints();
  }

  /** Подсветка целевого слота под пальцем: фигуру считает чистый hintShape (sceneAreas), здесь —
   *  только обводка акцентом (в live — цветом игрока, не общим золотом). */
  paintHints(): void {
    const g = this.hintLayer;
    g.clear();
    if (!this.dragging || !this.hotSlot) return;
    const tree = this.deps.tree();
    const shape = hintShape({
      hotSlot: this.hotSlot,
      zone: this.deps.spec().zones.find((z) => z.id === baseZoneId(zoneOf(this.hotSlot!))),
      cellRects: tree.cellRects,
      origins: tree.origins,
      members: this.deps.state().field.slots[this.hotSlot]?.members.length ?? 0,
      card: CARD,
    });
    if (!shape) return;
    const stroke = { width: 3, color: this.deps.accent() };
    if (shape.kind === "circle") g.circle(shape.cx, shape.cy, shape.r).stroke(stroke);
    else g.roundRect(shape.x, shape.y, shape.w, shape.h, 8).stroke(stroke);
  }

  destroy(): void {
    this.dropBar.destroy();
  }

  /** Слот-ИСТОЧНИК: дерево, а для карты экранной руки (её нет в дереве) — hand:self. */
  private fromSlotOf(id: string): string | null { return this.deps.tree().slotOf(id) ?? (this.deps.handMembers().includes(id) ? handKey(this.deps.selfSeat) : null); }

  private showBar(zones: readonly { key: string; label: string }[]): void { this.dropBar.show([...zones], this.deps.width(), this.deps.height(), this.deps.accent()); }

  /** ГРУЗ для дроп-политик: прямоугольник фигуры (по спринг-таргету — намерению руки, не отставшему
   *  px), палец, вид элемента и наклон (fx.rot — как лежит на столе). */
  private probe(p: { x: number; y: number }): DropProbe {
    const lead = this.deps.drag()?.lead;
    const fp = (lead as { footprint?: { hw: number; hh: number } } | undefined)?.footprint;
    if (!lead || !fp) return { rect: { x: p.x, y: p.y, w: 0, h: 0 }, finger: p };
    const hw = fp.hw * lead.body.scaleVal;
    const hh = fp.hh * lead.body.scaleVal;
    return {
      rect: { x: lead.body.targetX - hw, y: lead.body.targetY - hh, w: hw * 2, h: hh * 2 },
      finger: p,
      kind: this.deps.def(lead.id)?.kind,
      tiltDeg: this.deps.state().fx[lead.id]?.rot,
    };
  }

  /** Магнит цели: пока зона с magnet-политикой — цель дропа, груз пружиной ведётся к её центру
   *  (визуально прилипает ещё до отпускания). Уводит палец — move перецелит на него же. */
  private applyMagnet(target: { group: Group } | null): void {
    const lead = this.deps.drag()?.lead;
    const o = target ? this.deps.tree().origins[target.group.id] : undefined;
    if (!lead || !target || !o || !dropOf(target.group)?.policy?.magnet) return;
    const s = measure(target.group);
    lead.body.setTarget({ x: o.x + s.w / 2, y: o.y + s.h / 2, rot: 0 });
  }
}
