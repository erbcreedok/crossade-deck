import { Container, Graphics } from "pixi.js";
import { AMBER } from "../fingerContent";

// Цензура в стиле Telegram-спойлера: НЕ мозаика-свапы, а система ЧАСТИЦ (как CAEmitterLayer в TG).
// Точки рождаются на силуэте фака (on-точки), дрейфуют наружу и гаснут за свою жизнь (fade in/out),
// плюс мерцают по alpha. Высокая плотность + случайные фазы дают «шевелящуюся пыль», сквозь которую
// читается форма. Спавн-точки фиксированы (форма фака), рычаги крутят только размер/дрейф/жизнь/мерцание.

export interface ParticleParams {
  dot: number; // размер точки, px
  drift: number; // разлёт: макс. скорость, px/с (аналог velocityRange≈20 у Telegram)
  life: number; // время жизни частицы, с (меньше → чаще churn → живее)
  twinkleHz: number; // частота мерцания alpha
  flicker: boolean; // мерцание вкл/выкл (фото-чувствительность → можно погасить)
  timeScale: number; // множитель времени: <1 замедляет ВСЮ пыль равномерно (жизнь/разлёт/мерцание)
}

interface P {
  ox: number;
  oy: number; // дом (on-точка, где родилась)
  vx: number;
  vy: number; // скорость разлёта
  born: number; // время рождения (с)
  life: number; // индивидуальная жизнь (с разбросом)
  ph: number; // фаза мерцания
}

export class ParticleField {
  readonly view = new Container();
  private g = new Graphics();
  private pts: Array<{ x: number; y: number }>;
  private ps: P[] = [];
  private prm: ParticleParams;

  constructor(pts: Array<{ x: number; y: number }>, prm: ParticleParams) {
    this.pts = pts.length ? pts : [{ x: 0, y: 0 }];
    this.prm = { ...prm };
    this.view.addChild(this.g);
    this.seedAll(0);
  }

  setParams(p: Partial<ParticleParams>): void {
    Object.assign(this.prm, p);
  }

  // Родить частицу: случайная on-точка, случайное направление/скорость, рассинхрон фазы жизни и мерцания.
  private spawn(p: P, t: number): void {
    const pt = this.pts[(Math.random() * this.pts.length) | 0]!;
    p.ox = pt.x;
    p.oy = pt.y;
    const ang = Math.random() * Math.PI * 2;
    const v = Math.random() * this.prm.drift;
    p.vx = Math.cos(ang) * v;
    p.vy = Math.sin(ang) * v;
    p.life = this.prm.life * (0.6 + 0.8 * Math.random());
    p.born = t - Math.random() * p.life; // разброс → не мигают синхронно
    p.ph = Math.random() * Math.PI * 2;
  }

  private seedAll(t: number): void {
    this.ps = this.pts.map(() => {
      const p = { ox: 0, oy: 0, vx: 0, vy: 0, born: 0, life: 0, ph: 0 };
      this.spawn(p, t);
      return p;
    });
  }

  reset(): void {
    this.seedAll(0);
  }

  // Позиция и alpha частицы — чистая функция от возраста (не от dt) → устойчиво к скачкам кадров/скорости.
  // timeScale замедляет всю пыль равномерно: работаем не в реальном t, а в масштабированном tt.
  update(t: number): void {
    const g = this.g;
    g.clear();
    const s = this.prm.dot;
    const tt = t * this.prm.timeScale;
    for (const p of this.ps) {
      const age = tt - p.born;
      if (age >= p.life) {
        this.spawn(p, tt);
        continue;
      }
      const k = age / p.life; // 0..1
      const fade = Math.sin(Math.PI * k); // проявился к середине, погас к концу
      const flick = this.prm.flicker ? 0.55 + 0.45 * Math.sin(tt * this.prm.twinkleHz * 6.2832 + p.ph) : 1;
      const a = fade * flick;
      if (a <= 0.02) continue;
      const x = p.ox + p.vx * age;
      const y = p.oy + p.vy * age;
      g.rect(x - s / 2, y - s / 2, s, s).fill({ color: AMBER, alpha: a });
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
