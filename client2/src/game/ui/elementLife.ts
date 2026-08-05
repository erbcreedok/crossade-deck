import type { CardBody } from "../CardBody";
import { BASE_PRESET, scaled, type AnimPreset } from "../anim/presets";
import { appearStyle } from "../anim/appearStyles";
import { destroyStyle } from "../anim/destroyStyles";
import type { EffectFrame } from "../anim/destroyStyles";

// ЖИЗНЬ ЭЛЕМЕНТА — общая для ВСЕХ предметов стола (карта, фишка, фигура): возраст, пресет
// анимаций и три конечных таймера — «стоп»-покачивание (block), появление (born) и уничтожение
// (dying). Раньше этот блок жил ДВАЖДЫ, построчно, в Card и Piece — каждый новый канал (стиль
// появления, «без вспышек») приходилось вписывать в оба. Здесь он один; сам предмет держит только
// то, что умеет лично он (флип, пыль, текстуры).

interface Timer {
  t: number;
  dur: number;
}

export class ElementLife {
  age = 0;
  dead = false; // догорел — движок убирает предмет со стола
  /** Фил анимаций — пресет, а не константы (anim/presets.ts). Ставит движок на спавне/смене. */
  preset: AnimPreset = BASE_PRESET;
  block: Timer | null = null;
  born: Timer | null = null;
  dying: Timer | null = null;

  /** Лёгкая «стоп»-анимация: короткое затухающее покачивание — «этот предмет тащить нельзя». */
  blockNudge(): void {
    if (!this.block) this.block = { t: 0, dur: 0.4 };
  }

  /** Появиться. Зовёт тот, кто предмет ПОСТАВИЛ (раздача, добор): это события доски, не предмета. */
  appear(): void {
    if (this.dead) return;
    const st = appearStyle(this.preset.appear.style);
    this.born = { t: 0, dur: Math.max(0.001, scaled(st.dur * this.preset.appear.scale, this.preset.speed)) };
  }

  /** Сжечь: замирание → расход; по концу — dead. Стиль — общий реестр (anim/destroyStyles.ts). */
  burn(): void {
    if (this.dying || this.dead) return;
    const st = destroyStyle(this.preset.destroy.style);
    this.dying = { t: 0, dur: Math.max(0.001, scaled(st.dur * this.preset.destroy.scale, this.preset.speed)) };
  }

  get burning(): boolean {
    return this.dying !== null;
  }

  /** Сменить пресет. Пружины и крен — часть пресета, поэтому уезжают в тело сразу. */
  setPreset(p: AnimPreset, body: CardBody): void {
    this.preset = p;
    body.springs = p.springs;
    body.tiltScale = p.tilt;
  }

  step(dt: number): void {
    this.age += dt;
    if (this.block) {
      this.block.t += dt;
      if (this.block.t >= this.block.dur) this.block = null;
    }
    if (this.born) {
      this.born.t += dt;
      if (this.born.t >= this.born.dur) this.born = null; // кончилось — предмет просто стоит в доме
    }
    if (this.dying) {
      this.dying.t += dt;
      if (this.dying.t >= this.dying.dur) {
        this.dying = null;
        this.dead = true;
      }
    }
  }

  /** Все таймеры отработали — ради жизни цикл держать незачем. */
  get settled(): boolean {
    return !this.block && !this.born && !this.dying;
  }

  /** «Стоп»-дрожь вбок: затухающее мелкое смещение. `reach` — чем мерить (ширина предмета). */
  shakeX(reach: number, amp: number): number {
    if (!this.block) return 0;
    const p = this.block.t / this.block.dur;
    return Math.sin(this.block.t * 42) * reach * amp * (1 - p);
  }

  /**
   * Кадр эффекта (появление/уничтожение) для sync. Уничтожение важнее: оно решает, жив ли предмет.
   * Стилю даём СВОЁ время (0..dur стиля), а не растянутое пресетом: иначе множитель скорости менял
   * бы не темп, а форму движения — фронт горения не доходил бы до кромки. «Без вспышек» (issue #9,
   * фото-чувствительность) гасит дрожь, оставляя остальное движение стиля.
   */
  effectFrame(width: number, flashOff: boolean): EffectFrame | null {
    if (this.dying) {
      const st = destroyStyle(this.preset.destroy.style);
      const f = st.frame(st.dur * (this.dying.t / this.dying.dur), { age: this.age, width });
      return flashOff ? { ...f, dx: 0, dy: 0 } : f;
    }
    if (this.born) {
      const st = appearStyle(this.preset.appear.style);
      return st.frame(st.dur * (this.born.t / this.born.dur), { age: this.age, width });
    }
    return null;
  }
}
