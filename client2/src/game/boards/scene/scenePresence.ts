// ПРИСУТСТВИЕ НА СЦЕНЕ БОРДЫ — визуальный коллаборатор BoardScene (композиция, не наследование):
// свечение локов (Glowable на элементах), курсоры-атомы и ведение ЧУЖИХ драгов спрингом.
// Сцена отдаёт ДОСТУП К ДАННЫМ узким швом PresenceSceneHost и зовёт paint() на каждый чих вида;
// вся логика «кого светить, кого куда вести» — здесь, у сцены остаётся только оркестровка.

import { Container, Graphics } from "pixi.js";
import { TEX_W } from "../../engine/constants";
import { Card } from "../../ui/Card";
import type { Piece } from "../../ui/Piece";
import type { GlowShape } from "../../ui/selection";
import { PresenceCursor } from "../../ui/PresenceCursor";
import type { PresenceHub, PresenceView } from "../core/presence";

export type PresenceNode = Card | Piece;

export interface PresenceOpts {
  hub: PresenceHub;
  who: string;
  palette: (who: string) => number;
  label?: (who: string) => string;
}

/** Шов к сцене: только чтение её данных, никакого Pixi-владения (слои — свои, root отдаёт сцена). */
export interface PresenceSceneHost {
  node(id: string): PresenceNode | undefined;
  nodes(): Iterable<[string, PresenceNode]>;
  homeOf(id: string): { x: number; y: number } | null;
  slotOf(id: string): string | null;
  members(slot: string): readonly string[];
  /** Поворот-оверрайд карты (state.fx) — цель спринга чужого драга не сбивает поворот. */
  fxRot(id: string): number;
  /** Масштаб покоя узла в слоте (полоса чужого места ужимает карту). */
  restScaleIn(node: PresenceNode, slot: string | null): number;
  /** Глубина узла по снимку (возврат z после чужого драга). */
  depth(id: string): number;
  /** Свой блок-драг сейчас? (глоу стопки одним контуром). */
  ownBlockDrag(): boolean;
}

/** Свечение локов: держат одиночную — светится ОНА; свой блок-драг — союз силуэтов всей стопки
 *  на нижней карте (erase-пасс выведет контур настоящего ступенчатого союза, как у теней). */
export function glowTargets(
  view: PresenceView | null,
  opts: PresenceOpts | undefined,
  host: PresenceSceneHost,
): Map<string, { color: number; figure?: GlowShape[] }> {
  const want = new Map<string, { color: number; figure?: GlowShape[] }>();
  if (!opts || !view) return want;
  for (const [el, who] of Object.entries(view.held)) {
    const color = opts.palette(who);
    const mineBlock = who === opts.who && host.ownBlockDrag();
    const slot = host.slotOf(el);
    if (!mineBlock || !slot) {
      want.set(el, { color });
      continue;
    }
    const ids = host.members(slot).length ? host.members(slot) : [el];
    const base = ids[0]!;
    const baseHome = host.homeOf(base);
    if (!baseHome) {
      want.set(el, { color });
      continue;
    }
    const figure: GlowShape[] = [];
    for (const id of ids) {
      const home = host.homeOf(id);
      const node = host.node(id);
      if (!home || !node) continue;
      const dx = home.x - baseHome.x;
      const dy = home.y - baseHome.y;
      const sil = node instanceof Card ? null : node.glowSilhouette;
      if (sil) {
        // Собственный силуэт: конь огибается как конь (та же форма, что у его тени).
        figure.push({ kind: "silhouette", x: dx + sil.bounds.x, y: dy + sil.bounds.y, w: sil.bounds.width, h: sil.bounds.height, texture: sil.texture });
        continue;
      }
      const w = node.footprint.hw * 2;
      const h = node.footprint.hh * 2;
      // Карта — скруглённый прямоугольник (это и есть её силуэт), круглая фишка — круг.
      const radius = node instanceof Card ? (16 * w) / TEX_W : Math.min(w, h) / 2;
      figure.push({ x: dx - w / 2, y: dy - h / 2, w, h, radius });
    }
    if (figure.length) want.set(base, { color, figure });
    else want.set(el, { color });
  }
  return want;
}

export class ScenePresence {
  readonly root = new Container();
  private readonly layer = new Graphics();
  private readonly cursors = new Map<string, PresenceCursor>();
  /** Карты, которые прямо сейчас ведёт ЧУЖОЙ драг-стрим: снимок их не дёргает (см. hasRemote). */
  private readonly remoteDragged = new Set<string>();
  view: PresenceView | null = null;
  ownCursor: { x: number; y: number } | null = null;

  constructor(
    private readonly opts: PresenceOpts | undefined,
    private readonly host: PresenceSceneHost,
  ) {
    this.root.addChild(this.layer);
  }

  /** Карту ведёт чужой драг-стрим — rebuild не должен сажать её домой между кадрами. */
  hasRemote(id: string): boolean {
    return this.remoteDragged.has(id);
  }

  /** Полный проход вида: глоу локов, чужие драги, курсоры. Зовётся на каждый чих presence-вида. */
  paint(): void {
    this.layer.clear();
    this.applyGlow();
    this.applyRemoteDrags();
    this.paintCursors();
  }

  private applyGlow(): void {
    const want = glowTargets(this.view, this.opts, this.host);
    for (const [id, node] of this.host.nodes()) {
      const g = want.get(id);
      node.setGlow(g?.color ?? null, g?.figure);
    }
  }

  /** Чужие драги: якорная карта — в точку стрима, при block весь слот — той же дельтой от домов
   *  (форма стопки цела); стрим кончился — спринг домой, z по снимку. */
  private applyRemoteDrags(): void {
    const drags = (this.opts && this.view?.drags) ?? {};
    const active = new Set<string>();
    for (const [who, d] of Object.entries(drags)) {
      if (!this.opts || who === this.opts.who) continue;
      const anchorHome = this.host.homeOf(d.el);
      if (!anchorHome) continue;
      const delta = { x: d.at.x - anchorHome.x, y: d.at.y - anchorHome.y };
      const slot = this.host.slotOf(d.el);
      const ids = d.block && slot ? (this.host.members(slot).length ? this.host.members(slot) : [d.el]) : [d.el];
      ids.forEach((id, i) => {
        const node = this.host.node(id);
        const home = this.host.homeOf(id);
        if (!node || !home) return;
        active.add(id);
        this.remoteDragged.add(id);
        node.root.zIndex = 1e6 + i; // в пальцах — над столом, порядок стопки цел
        node.body.setTarget({ x: home.x + delta.x, y: home.y + delta.y, rot: this.host.fxRot(id), scale: node.restScale });
      });
    }
    for (const el of [...this.remoteDragged]) {
      if (active.has(el)) continue;
      this.remoteDragged.delete(el);
      const node = this.host.node(el);
      const home = this.host.homeOf(el);
      if (!node || !home) continue;
      node.root.zIndex = this.host.depth(el);
      node.body.setTarget({ x: home.x, y: home.y, rot: this.host.fxRot(el), scale: this.host.restScaleIn(node, this.host.slotOf(el)) });
    }
  }

  private paintCursors(): void {
    const v = this.view;
    const p = this.opts;
    const seen = new Set<string>();
    if (v && p) {
      // Свой курсор — атом без подписи (своё имя под пальцем — шум); чужие — с именем.
      if (this.ownCursor) {
        seen.add(p.who);
        this.cursorFor(p.who, p.palette(p.who), null).place(this.ownCursor.x, this.ownCursor.y);
      }
      for (const [who, at] of Object.entries(v.cursors)) {
        if (who === p.who) continue;
        seen.add(who);
        this.cursorFor(who, p.palette(who), p.label?.(who) ?? who).place(at.x, at.y);
      }
    }
    for (const [who, cursor] of this.cursors) {
      if (seen.has(who)) continue;
      cursor.destroy();
      this.cursors.delete(who);
    }
  }

  private cursorFor(who: string, color: number, label: string | null): PresenceCursor {
    let c = this.cursors.get(who);
    if (!c) {
      c = new PresenceCursor({ color, label: label ?? undefined });
      this.root.addChild(c.root);
      this.cursors.set(who, c);
    }
    c.setColor(color);
    return c;
  }

  destroy(): void {
    for (const c of this.cursors.values()) c.destroy();
    this.cursors.clear();
  }
}
