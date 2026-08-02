import { Container, Graphics, Text } from "pixi.js";
import { CardBody } from "../CardBody";
import { scaleForState } from "./plane";
import { shadowOf } from "./shadow";
import { BASE_PRESET, scaled, type AnimPreset } from "../anim/presets";
import { destroyStyle } from "../anim/destroyStyles";
import { appearStyle } from "../anim/appearStyles";
import { applyEffect } from "../anim/effectApply";
import type { EffectFrame } from "../anim/destroyStyles";
import { bobOffset, idleBobs, scaleFromZ, screenLift, zFromScale } from "./elevation";
import type { Burnable, Draggable, TableElement } from "../engine/element";
import type { CardState, Pose, ShadowShape } from "./Card";

// Обобщённый ЭЛЕМЕНТ стола, НЕ карта: фишка, шахматная фигура — что угодно с телом и тенью.
// Реализует ровно те же способности, что и Card (TableElement + Draggable + Burnable), но НЕ
// Flippable — значит зона «перевернуть» его проигнорирует (реакция зоны на СПОСОБНОСТИ, не на
// тип), а зона «сжечь» — сработает. Визуал рисует переданный build(root); физика/тень/цикл —
// общие с картой (то самое «встаёт на место карты без правок систем»). Так withDragger/withAnchor
// и драг работают на нём без единой строчки «для фишек».

export interface PieceOptions {
  id: string;
  w: number; // футпринт ПОКОЯ для хит-теста (полуразмеры × scaleVal)
  h: number;
  build: (root: Container) => void; // нарисовать визуал в ЛОКАЛЬНЫХ координатах (центр 0,0)
  shadow: { rx: number; ry: number; dy: number }; // габарит тени: полуоси + сдвиг вниз
  /** Насколько приплюснуть тень по вертикали: стоящая фигура кладёт её на стол, лежащая фишка — нет. */
  flatten?: number;
  pose?: Pose;
  /** Дышит ли фишка (idle-покачивание). Не задано — по позе: поднятая дышит, лежащая нет. */
  idle?: boolean;
  tags?: string[]; // идентичность-ДАННЫЕ: chip, color:green, piece:♞ … (SELECTION-DESIGN §2)
}

export class Piece implements TableElement, Draggable, Burnable {
  readonly root = new Container();
  readonly body = new CardBody();
  shadowRect: ShadowShape | null = null;

  readonly id: string;
  readonly tags: ReadonlySet<string>;
  readonly draggable = true;
  readonly pose: Pose;
  /** Явное «дышать / не дышать»; не задано — решает поза (`idleBobs`). */
  readonly idle?: boolean;
  /** Сдвиг фазы дыхания — чтобы соседи не качались в унисон. Ставит тот, кто расставляет. */
  bobPhase = 0;
  state: CardState;
  private readonly w: number;
  private readonly h: number;
  private readonly shadowCfg: { rx: number; ry: number; dy: number };
  private readonly flatten: number;
  /**
   * СНИМОК собственного визуала для маски тени. Ставит движок сразу после рождения: снять его
   * может только тот, у кого есть рендерер. Нет снимка — тень рисуется габаритной фигурой.
   */
  private silhouetteTex: { width: number; height: number } | null = null;
  private age = 0;
  private block: { t: number; dur: number } | null = null;
  private born: { t: number; dur: number } | null = null;
  private dying: { t: number; dur: number } | null = null;
  private mask: { g: import("pixi.js").Graphics | null } = { g: null };
  /** Фил анимаций — тот же пресет, что у карты. Фишка не «упрощённый элемент», а такой же. */
  private preset: AnimPreset = BASE_PRESET;
  /** Высота над столом (ось z). У лежащего — 0. */
  private zBase = 0;
  dead = false;
  /** «Без вспышек» (issue #9): гасит дрожь «сжечь», оставляя затухание+сжатие. Движок ставит на спавне/смене. */
  flashOff = false;
  /** OS/юзер reduce-motion: замораживает дыхание в статичный кадр. Ставит движок, как у карты. */
  reduceMotion = false;
  /** Лёгкий профиль качества: тоже замораживает дыхание. Ставит движок при просадке FPS. */
  lowFx = false;

  constructor(opts: PieceOptions) {
    this.id = opts.id;
    this.tags = new Set(opts.tags ?? []);
    this.w = opts.w;
    this.h = opts.h;
    this.shadowCfg = opts.shadow;
    this.flatten = opts.flatten ?? 1;
    this.pose = opts.pose ?? "rest";
    this.idle = opts.idle;
    this.state = this.pose;
    opts.build(this.root);
  }

  /** Снимок визуала для тени: что нарисовано, то и отбрасывает тень (ставит движок). */
  setSilhouette(tex: { width: number; height: number }): void {
    this.silhouetteTex = tex;
  }

  /** Полуразмеры покоя — хит-тест берёт их × scaleVal. */
  get footprint(): { hw: number; hh: number } {
    return { hw: this.w / 2, hh: this.h / 2 };
  }

  get restScale(): number {
    return scaleForState(this.pose);
  }

  setState(s: CardState): void {
    this.state = s;
    this.body.setTarget({ scale: scaleForState(s) });
  }

  blockNudge(): void {
    if (!this.block) this.block = { t: 0, dur: 0.4 };
  }

  setZ(v: number): void {
    this.zBase = Math.max(0, v);
  }

  get animPreset(): AnimPreset {
    return this.preset;
  }

  setAnimPreset(p: AnimPreset): void {
    this.preset = p;
    this.body.springs = p.springs;
    this.body.tiltScale = p.tilt;
  }

  /** Появиться — тот же реестр, что у карты (anim/appearStyles.ts). Зовёт тот, кто её поставил. */
  appear(): void {
    if (this.dead) return;
    const st = appearStyle(this.preset.appear.style);
    this.born = { t: 0, dur: Math.max(0.001, scaled(st.dur * this.preset.appear.scale, this.preset.speed)) };
  }

  /**
   * Уничтожить. Раньше у фишки был СВОЙ эффект — тускнение со сжатием, отдельный от карточного.
   * Значит каждый новый способ («шреддер», «улёт») пришлось бы писать дважды. Теперь реестр общий:
   * маска работает и на фишке, потому что это просто полигон в её локальных координатах.
   */
  burn(): void {
    if (this.dying || this.dead) return;
    const st = destroyStyle(this.preset.destroy.style);
    this.dying = { t: 0, dur: Math.max(0.001, scaled(st.dur * this.preset.destroy.scale, this.preset.speed)) };
  }

  get burning(): boolean {
    return this.dying !== null;
  }

  step(dt: number): void {
    this.age += dt;
    this.body.step(dt);
    if (this.block) {
      this.block.t += dt;
      if (this.block.t >= this.block.dur) this.block = null;
    }
    if (this.born) {
      this.born.t += dt;
      if (this.born.t >= this.born.dur) this.born = null;
    }
    if (this.dying) {
      this.dying.t += dt;
      if (this.dying.t >= this.dying.dur) {
        this.dying = null;
        this.dead = true;
      }
    }
  }

  get resting(): boolean {
    // `born` тут обязателен: без него цикл засыпает ПОСРЕДИ появления и фишка застывает
    // полупрозрачной (см. CLAUDE.md про EngineActivity — ровно эта ловушка). Дыхание — вторая
    // непрерывная анимация фишки, и условие идёт по нему, а не по позе: неподвижная поднятая
    // фишка отпускает цикл, дышащая лежащая — держит.
    return this.body.isResting() && !this.body.travelling && !this.block && !this.born && !this.dying && !this.bobbing;
  }

  /** Качается ли прямо сейчас. Заморозка движения (reduce-motion / лёгкий профиль) её отменяет. */
  private get bobbing(): boolean {
    return !this.reduceMotion && !this.lowFx && idleBobs(this.state, this.idle) && this.preset.idle.amp > 0;
  }

  sync(): void {
    const render = this.body.scaleVal;
    let shakeX = 0;
    if (this.block) {
      const p = this.block.t / this.block.dur;
      shakeX = Math.sin(this.block.t * 42) * this.w * 0.06 * (1 - p);
    }
    // Дыхание — ЭКРАННОЕ покачивание, как у карты: в `z` оно не идёт, иначе тень начнёт дышать
    // размером под предметом, который не изменился.
    const bob = this.bobbing ? bobOffset(Math.sin(this.age * this.preset.idle.speed + this.bobPhase), this.preset.idle.amp, this.h) : 0;
    // Высота — та же ось, что у карты: поза покоя плюс подъём полёта плюс заданный z.
    const z = zFromScale(this.body.scaleVal) + this.body.liftPx / Math.max(1, this.h) + this.zBase;
    this.root.position.set(this.body.px + shakeX, this.body.py + screenLift(z, this.h) + bob);
    this.root.rotation = this.body.rotation;
    const drawn = render * scaleFromZ(this.zBase); // тот же множитель, что уходит в root.scale
    this.root.scale.set(drawn);

    // Эффект — ДО тени: она выводится из итогового состояния, а не правится под каждый способ.
    let fx: EffectFrame | null = null;
    if (this.dying) {
      const st = destroyStyle(this.preset.destroy.style);
      const f = st.frame(st.dur * (this.dying.t / this.dying.dur), { age: this.age, width: this.w });
      // «Без вспышек»: дрожь — фото-триггер, гасим её; остальное движение стиля остаётся.
      fx = this.flashOff ? { ...f, dx: 0, dy: 0 } : f;
    } else if (this.born) {
      const st = appearStyle(this.preset.appear.style);
      fx = st.frame(st.dur * (this.born.t / this.born.dur), { age: this.age, width: this.w });
    }
    if (fx) applyEffect(this.root, this.body.px, this.body.py, fx, this.mask);

    // Со снимком силуэт меряется ПО НЕМУ, а не по габаритному эллипсу типа: снимок — это сам
    // предмет, и втискивать его в чужую коробку значит рисовать не его форму, а её огрызок.
    const tex = this.silhouetteTex;
    const shw = tex ? (tex.width / 2) * drawn : this.shadowCfg.rx * drawn;
    const shh = tex ? (tex.height / 2) * drawn : this.shadowCfg.ry * drawn;
    // Приплюснутую тень кладём ПОДОШВОЙ туда, где предмет стоит: центр уезжает вниз ровно на
    // половину съеденной высоты.
    const shdy = tex ? tex.height * drawn * (1 - this.flatten) * 0.5 : this.shadowCfg.dy * drawn;

    this.shadowRect = shadowOf(
      {
        px: this.body.px,
        py: this.body.py,
        shakeX: shakeX + (fx?.dx ?? 0),
        z: z + Math.max(0, (fx?.scale ?? 1) - 1),
        screenY: fx?.dy ?? 0,
        // Размер тени идёт от НАРИСОВАННОГО размера: поднятая фишка крупнее лежащей, и тень у
        // неё крупнее во столько же.
        hw: shw,
        hh: shh,
        baseDy: shdy,
        reach: this.w * drawn,
        // Эффект-маска важнее снимка: горящая фигура режется тем же контуром, что и её визуал,
        // иначе от неё осталась бы целая тень.
        round: !this.silhouetteTex,
        poly: fx?.mask ?? null,
        tex: fx?.mask ? undefined : this.silhouetteTex,
        flatten: this.flatten,
        fade: fx?.shadow ?? 1,
      },
      this.preset.shadow,
    );
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

// ——— визуалы (рисуют в ЛОКАЛЬНЫХ координатах, центр 0,0) ———

/** Покерная фишка: диск номинала, кремовые edge-споты по ободу, кремовое кольцо, светлое ядро, номинал. */
export function drawChip(root: Container, radius: number, color: number, label: string): void {
  const cream = 0xf2ecda;
  const g = new Graphics();
  // тело + тонкий тёмный кант (чтобы читалось на любом фоне)
  g.circle(0, 0, radius).fill({ color }).stroke({ width: radius * 0.05, color: darken(color, 0.5) });
  // edge-споты: 6 кремовых блоков по ободу (радиально-тангенциальные дуги)
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2;
    g.arc(0, 0, radius * 0.84, a - 0.24, a + 0.24).stroke({ width: radius * 0.34, color: cream, cap: "butt" });
  }
  // кремовое кольцо + светлое ядро (перекрывает внутренние концы спотов — остаются только на ободе)
  g.circle(0, 0, radius * 0.6).stroke({ width: radius * 0.09, color: cream });
  g.circle(0, 0, radius * 0.56).fill({ color: lighten(color, 0.12) });
  root.addChild(g);
  if (label) root.addChild(glyph(label, radius * 0.8, textInk(lighten(color, 0.12)), radius * 0.05, darken(color, 0.6)));
}

/** Шахматная фигура — СПЛОШНОЙ силуэт (без диска-подложки): глиф чёрного набора, крашенный в
 *  команду, с контрастным контуром. Белая — кремовая с тёмным кантом, чёрная — тёмная со светлым. */
export function drawChessPiece(root: Container, size: number, dark: boolean, sym: string): void {
  const fill = dark ? 0x2a2521 : 0xf1e8d4;
  const ink = dark ? 0xc9b892 : 0x241c14;
  root.addChild(glyph(sym, size * 1.15, fill, size * 0.045, ink));
}

// Текст-глиф по центру (0,0), с настраиваемым контуром.
function glyph(text: string, size: number, color: number, strokeW: number, strokeColor = 0x000000): Container {
  const t = new Text({
    text,
    style: { fontFamily: "'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols2','DejaVu Sans',serif", fontSize: size, fill: color, stroke: { color: strokeColor, width: strokeW }, align: "center" },
  });
  t.anchor.set(0.5);
  return t;
}

function darken(c: number, f: number): number {
  return mix(c, 0x000000, f);
}
function lighten(c: number, f: number): number {
  return mix(c, 0xffffff, f);
}
function textInk(bg: number): number {
  // Тёмный номинал на светлой фишке и наоборот — по яркости фона.
  const r = (bg >> 16) & 255;
  const gg = (bg >> 8) & 255;
  const b = bg & 255;
  return 0.299 * r + 0.587 * gg + 0.114 * b > 140 ? 0x201b16 : 0xf4ecd8;
}
function mix(a: number, b: number, f: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * f);
  const g = Math.round(ag + (bg - ag) * f);
  const bl = Math.round(ab + (bb - ab) * f);
  return (r << 16) | (g << 8) | bl;
}
