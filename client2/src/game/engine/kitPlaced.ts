// РЕЕСТР РАССТАВЛЕННЫХ ЭЛЕМЕНТОВ ВИТРИНЫ — единственный владелец того, что стоит на столе: сами
// элементы с домами и глубиной, спеки «из чего это было сделано» и фил анимаций каждого.
//
// Спеки и филы живут ЗДЕСЬ, а не в замыканиях сборки, и переживают смерть владельца — в этом весь
// смысл: догоревшая карта помечается `dead` и выбывает из реестра (это верное поведение стола, гнуть
// его нельзя), но «восстановить уничтоженное» без отдельной памяти стало бы невозможным в принципе —
// восстанавливать не из чего. Чистятся только при пересборке содержимого.

import type { Container } from "pixi.js";
import type { SceneApi } from "./sceneContract";
import type { SceneElement } from "./sceneEngine";
import type { DropZone } from "../ui/DropZone";
import type { TableElement } from "./element";
import type { Pt } from "../kit/context";
import type { AnimPreset } from "../anim/presets";
import { extentOfPlaced } from "./kitExtent";

export interface Placed {
  el: SceneElement;
  home: Pt;
  /** Экранная глубина: слой автора (`depth`) плюс порядок постановки. См. zOf. */
  z: number;
  /** Двигается командами, а не пальцем (ctx.apiCard) — из хит-теста драга исключена. */
  api?: boolean;
}

export class KitPlaced {
  private items: Placed[] = [];
  private readonly specs = new Map<string, () => void>();
  private readonly presets = new Map<string, AnimPreset>();

  constructor(private readonly api: SceneApi) {}

  list(): readonly Placed[] {
    return this.items;
  }

  /**
   * Поставить элемент: дом, глубина, учёт в хит-тесте, цикле, тенях и реестре по id.
   *
   * Доступность, профиль качества и фил анимаций проставляет РЕЕСТР, а не автор витрины: иначе каждая
   * стори забывала бы их пробросить, и каталог врал бы про reduce-motion, а половина стола жила бы по
   * другому пресету. Пресет ЭЛЕМЕНТА (если такой назначали) важнее общего — он переживает пересборку
   * и воскрешение из спеки.
   */
  add<T extends SceneElement>(el: T, home: Pt, depth = 0): T {
    const z = zOf(depth, this.items.length);
    this.items.push({ el, home, z });
    this.api.byId.set(el.id, el);
    const flags = el as unknown as { reduceMotion?: boolean; flashOff?: boolean; lowFx?: boolean };
    if ("reduceMotion" in el) flags.reduceMotion = this.api.reduceMotion();
    if ("flashOff" in el) flags.flashOff = this.api.flashOff();
    if ("lowFx" in el) flags.lowFx = this.api.lowFx();
    (el as unknown as { setAnimPreset?: (a: AnimPreset) => void }).setAnimPreset?.(this.presets.get(el.id) ?? this.api.preset());
    // Появление здесь НЕ запускается: секция назначает пресет уже ПОСЛЕ того, как расставила
    // элементы, и появление, начатое на постановке, играло бы базовым филом — рычаг «стиль
    // появления» выглядел бы неработающим. Появление — СОБЫТИЕ доски, его играет ctx.appear.
    //
    // Ставим СРАЗУ на место (snapTo), а не пружиной: витрина открывается уже собранной, а не
    // съезжается на глазах из угла.
    el.body.snapTo({ x: home.x, y: home.y, rot: home.rot ?? 0, scale: el.restScale });
    el.root.zIndex = z;
    this.api.placeCard(el);
    return el;
  }

  /** Последний поставленный — под управлением API: в реестре и в цикле есть, в хит-тесте драга нет. */
  markLastApiDriven(): void {
    const last = this.items[this.items.length - 1];
    if (last) last.api = true;
  }

  spec(id: string, make: () => void): void {
    this.specs.set(id, make);
  }

  /** Пересобрать элемент из спеки (для «вернуть уничтоженное»). false — спеки на него нет. */
  rebuildFromSpec(id: string): boolean {
    const spec = this.specs.get(id);
    if (!spec) return false;
    spec();
    return true;
  }

  /** Запомнить фил КОНКРЕТНОГО элемента: без этой памяти он воскресал бы с базовым, и выбранный
   *  стиль работал ровно один раз. */
  setPreset(id: string, preset: AnimPreset): void {
    this.presets.set(id, preset);
  }

  /** Раздать фил всем расставленным (общий рычаг витрины). */
  applyPresetToAll(p: AnimPreset): void {
    for (const q of this.items) (q.el as unknown as { setAnimPreset?: (a: AnimPreset) => void }).setAnimPreset?.(p);
  }

  /**
   * Перевернуть пачку по id — НАСТОЯЩИМ переворотом через общий flipGroup, а не пересборкой с другой
   * стороной: рычаг «лицом вверх» у стопки обязан оставаться переворотом. Если хоть одной карты уже
   * нет (сгорела), не переворачиваем ничего — половина пачки лицом вверх читается как сбой.
   */
  flipStack(ids: readonly string[]): void {
    const els = ids.map((id) => this.api.byId.get(id)).filter((e): e is SceneElement => !!e);
    if (els.length === ids.length) this.api.flipGroup(els);
  }

  draggables(): SceneElement[] {
    return this.items.filter((p) => !p.api).map((p) => p.el);
  }

  everyElement(): TableElement[] {
    return this.items.map((p) => p.el);
  }

  homeOf(el: SceneElement): { home: Pt; depth: number } | null {
    const p = this.items.find((q) => q.el === el);
    return p ? { home: p.home, depth: p.z } : null;
  }

  depthOf(id: string): number {
    return this.items.find((q) => q.el.id === id)?.z ?? 0;
  }

  /** Переставить дом и глубину — про них знает реестр он один (см. flipGroup). */
  setHome(el: SceneElement, home: { x: number; y: number }, depth: number): void {
    const p = this.items.find((q) => q.el === el);
    if (!p) return;
    p.home = { ...home };
    p.z = depth;
    el.root.zIndex = depth;
    el.body.setTarget({ x: home.x, y: home.y });
  }

  /** Габарит содержимого по краям расставленных. Полуразмеры берутся В ПОЗЕ элемента (см.
   *  extentOfPlaced): удерживаемой карте иначе срезало верх на канвасе, поджатом ровно по габариту. */
  extent(padding: number): { w: number; h: number } {
    return extentOfPlaced(
      this.items.map((p) => ({ home: p.home, footprint: p.el.footprint, restScale: p.el.restScale })),
      padding,
    );
  }

  /**
   * Снять догоревших. УЗЕЛ ТОЖЕ СНОСИМ: пока мёртвый элемент выбывал только из реестров, а его
   * Pixi-узел оставался в слое, последний кадр эффекта («сжечь» доедает карту маской, но не в ноль)
   * навсегда застывал на столе. Отсюда и «артефакт после сжигания» — догорала карта верно, просто её
   * останки никто не убирал.
   */
  reapDead(): void {
    const alive = this.items.filter((p) => !p.el.dead);
    if (alive.length === this.items.length) return;
    for (const p of this.items) {
      if (!p.el.dead) continue;
      this.api.byId.delete(p.el.id);
      p.el.root.destroy({ children: true });
    }
    this.items = alive;
  }

  /** Снос содержимого: свои узлы и вся память о нём. */
  clear(): void {
    this.specs.clear();
    this.presets.clear();
    for (const p of this.items) p.el.root.destroy({ children: true });
    this.items = [];
  }
}

/**
 * ДЕКОР И ЗОНЫ витрины — второй реестр содержимого: узлы, которые не элементы стола (подписи, рамки,
 * поясняющая графика) и дроп-зоны, зарегистрированные секцией. Живут отдельно от элементов, потому
 * что у них нет ни дома, ни глубины, ни жизни — их только ставят и сносят вместе с содержимым.
 */
export class KitDecor {
  private nodes: Container[] = [];
  private zoneList: DropZone[] = [];

  keep(node: Container): void {
    this.nodes.push(node);
  }

  keepZone(zone: DropZone): void {
    this.zoneList.push(zone);
  }

  /** Зоны витрины — их читают дев-хуки (у зоны нет флагов наружу, состояние видно по подписям). */
  zones(): readonly DropZone[] {
    return this.zoneList;
  }

  /** Узлы сносим, зоны только забываем: их регистрацию в движке снимает resetSceneState сцены. */
  clear(): void {
    for (const d of this.nodes) d.destroy({ children: true });
    this.nodes = [];
    this.zoneList = [];
  }
}

/**
 * Глубина элемента витрины — УНИКАЛЬНАЯ, а не «слой, заданный автором».
 *
 * Слой (`depth`) задаёт автор секции, и в столбике фишек он у всех одинаковый — ноль. При равном
 * zIndex порядок решает список детей контейнера, а `place()` кладёт узел через `addChild`, то есть
 * В КОНЕЦ. Поэтому стоило взять фишку и отпустить, как она возвращалась на «свою» глубину — и всё
 * равно оказывалась поверх соседей: возврат ставил ей тот же ноль, а в списке детей она была уже
 * последней. Столбик терял порядок с первого же касания.
 *
 * Порядок постановки добавляется младшими разрядами: слой по-прежнему главнее (секция, положившая
 * что-то на depth 1, останется выше всего с depth 0), но внутри слоя глубина у каждого своя, и
 * возврат домой воспроизводит её точно. Тысяча элементов на слой — потолок, которого ни одна
 * витрина близко не касается.
 */
export function zOf(depth: number, seq: number): number {
  return depth * 1000 + seq;
}
