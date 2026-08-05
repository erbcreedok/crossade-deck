import type { Application } from "pixi.js";
import type { SceneElement, SpreadSource } from "./sceneEngine";
import { SceneRuntime, type SceneApi, type SceneDelegate } from "./sceneRuntime";
import { CardTextureCache } from "../ui/CardTextureCache";
import { SANDBOX_CARD_H } from "./constants";
import { SB_MARGIN } from "./sandboxLayout";
import type { Button } from "../ui/Button";
import type { TableElement } from "./element";
import type { Command } from "./command";
import { applyCommand } from "./kitCommands";
import type { Pt } from "../kit/context";
import { fitZoom, KIT_CAMERA, MAX_FIT_ZOOM, MIN_FIT_ZOOM } from "./kitExtent";
import type { AnimPreset } from "../anim/presets";
import { kitSceneKey, type KitSceneOptions } from "./kitSceneKey";
import { buildKitContext, type KitBuild, type KitContext } from "./kitContext";
import { kitHooks, type KitHooks } from "./kitHooks";
import { buildKitParts, clearParts, type KitParts } from "./kitParts";
import type { KitDecor, KitPlaced } from "./kitPlaced";
import type { KitSpread } from "./kitSpread";
import type { KitDrag } from "./kitDrag";

export type { KitSceneOptions };
export type { KitBuild, KitContext };
export { zOf } from "./kitPlaced";

// ВИТРИНА ОДНОГО КОМПОНЕНТА на общей обвязке стола.
//
// Сцена для каталога (сторибука), но про сторибук она НЕ знает: зависимость односторонняя
// (адаптер → движок), поэтому витрину можно поднять и с обычной страницы, и из e2e. Всё, что делает
// витрину живой — камера, ввод, драг, дроп-зоны, «подглядеть», слитые тени — приходит из SceneEngine
// даром, а содержимое ведут владельцы (kitParts.ts собирает их): что стоит на столе — kitPlaced,
// чем секция это расставляет — kitContext, раздвиг и драг стопки — kitSpread/kitDrag, снимок
// наружу — kitHooks. Сцене остаётся сборка, габарит и швы делегата.
//
// Почему витрины сидят на ПОЛНОЦЕННОМ движке сцены, а не на упрощённом статичном хосте: иначе раздел
// «механики» показывал бы картинку вместо поведения, а картинка не доказывает, что драг работает
// (docs/HANDOFF.md: тест «нелегальный дроп ничего не изменил» даёт тот же результат, что и полностью
// неработающий драг).

export class KitScene implements SceneDelegate {
  /** Движок-рантайм (композиция): камера/ввод/кадр — его; витрина — делегат его швов. */
  readonly rt: SceneRuntime;
  protected readonly api: SceneApi;
  private tex!: CardTextureCache;
  /** Владельцы: что стоит на столе и две независимые механики стопки (раздвиг и драг). У стопки
   *  может быть любая из них, обе или ни одной. */
  protected readonly placed: KitPlaced;
  protected readonly spreadOwner: KitSpread;
  protected readonly dragOwner: KitDrag;
  /** Декор и зоны витрины — второй реестр содержимого (kitPlaced.ts#KitDecor). */
  private readonly decor: KitDecor;
  private readonly parts: KitParts;

  private pending: KitBuild | null = null;
  private explicitExtent: { w: number; h: number } | null = null;

  /** Слушатель габарита — зовётся после каждой сборки. Нужен хосту: высоту канваса задаёт DOM, а
   *  сколько места витрине НА САМОМ ДЕЛЕ нужно, знает только сцена. Без этого стори с одной кнопкой
   *  печаталась во весь экран, и 90% канваса было пустым сукном. */
  onExtent: ((e: { w: number; h: number }) => void) | null = null;

  private readonly cardHeight: number;
  private readonly padding: number;
  private readonly fitOnBuild: boolean;

  constructor(opts: KitSceneOptions = {}) {
    // Камера витрины отличается от игровой — почему именно так, см. kitExtent.ts#KIT_CAMERA.
    this.rt = new SceneRuntime({ ...KIT_CAMERA, ...(opts.camera ?? {}) });
    this.rt.attach(this);
    this.api = this.rt.api;
    this.cardHeight = opts.cardHeight ?? SANDBOX_CARD_H;
    this.padding = opts.padding ?? SB_MARGIN;
    this.fitOnBuild = opts.fitOnBuild ?? true;
    this.parts = buildKitParts(this.api);
    const parts = this.parts;
    this.placed = parts.placed;
    this.decor = parts.decor;
    this.spreadOwner = parts.spread;
    this.dragOwner = parts.drag;
  }

  /** Ключ пула. Реализация и её ОБРАТНАЯ сторона — в kitSceneKey.ts (там же тест обратимости). */
  static key(o: KitSceneOptions = {}): string {
    return kitSceneKey(o);
  }

  /** Что собрать при ближайшем boot. Зовётся ДО mount (сцена ещё не поднята). */
  setBuild(build: KitBuild): void {
    this.pending = build;
  }

  // ——— хост-API (тонкие двери в рантайм): интерфейс витрины для CanvasStage/kitPool ———

  mount(host: HTMLElement, width: number, height: number): Promise<void> {
    return this.rt.mount(host, width, height);
  }

  reattach(host: HTMLElement, width: number, height: number): void {
    this.rt.reattach(host, width, height);
  }

  destroy(): void {
    this.rt.destroy();
  }

  setInDocument(v: boolean): void {
    this.rt.setInDocument(v);
  }

  setReduceMotion(v: boolean): void {
    this.rt.setReduceMotion(v);
  }

  setReduceFlash(v: boolean): void {
    this.rt.setReduceFlash(v);
  }

  /** Пересобрать СОДЕРЖИМОЕ витрины. Pixi-приложение и WebGL-контекст при этом живут дальше — именно
   *  это и позволяет одному канвасу обслуживать все стори. */
  rebuild(build: KitBuild): void {
    this.pending = build;
    if (!this.api.appReady()) return; // ещё не смонтированы — соберётся на boot
    clearParts(this.api, this.parts);
    this.runBuild(this.api.app()!);
    this.afterBuild();
  }

  element(id: string): SceneElement | undefined {
    return this.api.byId.get(id);
  }

  /** Экран сменился — вписать витрину заново. Раскладка от него не зависит (содержимое живёт в своих
   *  координатах), а ЗУМ зависит целиком: иначе хост, ужатый под габарит, остался бы с зумом по
   *  прежней высоте, и картинка не совпадала бы с рамкой. */
  onSceneResize(w: number, h: number): void {
    if (!this.fitOnBuild) return;
    this.api.viewport().setZoom(fitZoom(this.api.contentSize(), { w, h }, MIN_FIT_ZOOM, MAX_FIT_ZOOM));
  }

  /** Кнопка витрины по порядку постановки. У Button нет id — адресовать её иначе нечем, а живые
   *  правки из панели («подпись», «недоступна») применяются именно к экземпляру. */
  button(i = 0): Button | undefined {
    return this.api.buttonsRef()[i];
  }

  /** Исполнить команду управления доской — тот же порт, что у песочницы (kitCommands.ts). */
  dispatch(cmd: Command): void {
    applyCommand(cmd, {
      element: (id) => this.api.byId.get(id),
      homeOf: (el) => this.homeOf(el),
      setHome: (el, home, depth) => this.setHome(el, home, depth),
      preset: () => this.api.preset(),
      wake: () => this.api.wake(),
    });
  }

  /** Разбудить цикл после ВНЕШНЕЙ правки элемента (живой сеттер из панели контролов). Без этого
   *  спящий тикер оставил бы на экране прежний кадр, и контрол выглядел бы неработающим. */
  poke(): void {
    this.api.render();
    this.api.wake();
  }

  // ——— Сборка ———

  buildScene(app: Application): void {
    this.tex = new CardTextureCache(app);
    this.runBuild(app);
  }

  onBooted(): void {
    this.afterBuild();
  }

  private runBuild(app: Application): void {
    this.explicitExtent = null;
    this.pending?.(
      buildKitContext({
        api: this.api,
        app,
        tex: this.tex,
        placed: this.placed,
        spread: this.spreadOwner,
        drag: this.dragOwner,
        cardHeight: this.cardHeight,
        padding: this.padding,
        keepDecor: (node) => this.decor.keep(node),
        keepZone: (zone) => this.decor.keepZone(zone),
        dispatch: (cmd) => this.dispatch(cmd),
        moveDuration: (id) => this.rt.moveDuration(id),
        setExtent: (w, h) => void (this.explicitExtent = { w, h }),
      }),
    );
  }

  /** Габарит и вписывание — после сборки, когда элементы уже расставлены. Появление тут НЕ
   *  запускается: пересборка случается на каждую правку рычага, и карта переявлялась бы по десять раз
   *  подряд — шум, который прячет то, ради чего рычаг крутят. Появление — СОБЫТИЕ доски (раздали,
   *  вернули, добрали), и запускает его тот, кто его вызвал. */
  private afterBuild(): void {
    const e = this.explicitExtent ?? this.placed.extent(this.padding);
    this.api.setContentSize(e.w, e.h);
    this.api.syncVp();
    if (this.fitOnBuild) this.api.viewport().setZoom(fitZoom(e, { w: this.api.width(), h: this.api.height() }, MIN_FIT_ZOOM, MAX_FIT_ZOOM));
    this.api.clampView();
    this.api.applyView();
    this.api.render();
    this.api.wake();
    this.onExtent?.(e);
  }

  onTeardown(_app: Application): void {
    clearParts(this.api, this.parts);
    this.tex?.destroy();
  }

  // ——— Обязательные швы сцены ———

  draggables(): SceneElement[] {
    return this.placed.draggables();
  }

  everyElement(): TableElement[] {
    return this.placed.everyElement();
  }

  /** Жест по стопке → раздвиг. Правила и детент на пределе — у владельца (kitSpread.ts). */
  spreadOnElement(cp: Pt, rawX: number, rawY: number, source: SpreadSource): boolean {
    return this.spreadOwner.onGesture(cp, rawX, rawY, source);
  }

  onSpreadBegin(): void {
    this.spreadOwner.onGestureBegin();
  }

  stepScene(dt: number): boolean {
    return this.spreadOwner.step(dt);
  }

  /** Что поднимается пальцем и каким жестом — у владельца драга (kitDrag.ts). */
  canDrag(el: SceneElement): boolean {
    return this.dragOwner.canDrag(el);
  }

  dragOnTap(el: SceneElement): boolean {
    return this.dragOwner.hasIntent(el, "tap");
  }

  dragOnHold(el: SceneElement): boolean {
    return this.dragOwner.hasIntent(el, "hold");
  }

  beginDrag(el: SceneElement, cp: Pt, sp: Pt): boolean {
    return this.dragOwner.begin(el, cp, sp);
  }

  setHome(el: SceneElement, home: { x: number; y: number }, depth: number): void {
    this.placed.setHome(el, home, depth);
  }

  /** Публичная дверь каталога к настоящему перевороту пачки (см. kitPlaced.ts#flipStack). */
  flipStack(ids: readonly string[]): void {
    this.placed.flipStack(ids);
  }

  /** Тир качества движка. На `reduced` теневой пасс гаснет целиком, idle-анимации замирают. */
  setProfile(p: "full" | "reduced"): void {
    this.api.setQualityProfile(p);
  }

  /** Сменить фил анимаций витрины: сцене — для расписания пачки, картам — для их собственных. */
  setAnimPreset(p: AnimPreset): void {
    this.api.setPreset(p);
    this.placed.applyPresetToAll(p);
    this.api.wake();
  }

  homeOf(el: SceneElement): { home: Pt; depth: number } | null {
    // Карта раздвинутой стопки живёт в СПРЕД-позиции, а не в статичном доме раскладки (см. kitSpread).
    return this.spreadOwner.homeOf(el.id) ?? this.placed.homeOf(el);
  }

  reapDead(): void {
    this.placed.reapDead();
  }

  /** Для проверки руками и из e2e — как __fd у песочницы: канвас не отдаёт ни DOM, ни ролей. */
  testHooks(): KitHooks {
    return kitHooks(this.api, this.placed, this.decor.zones());
  }
}
