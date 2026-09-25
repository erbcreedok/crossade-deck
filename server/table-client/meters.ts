// ИЗМЕРИТЕЛИ — пинг, кадры в секунду и где стоит камера, строкой поверх стола.
//
// Для отладки на телефоне: «у меня лагает» надо уметь назвать числом, а инспектора в Telegram нет.
// Включаются тумблером в настройках, живут на устройстве. Выключены — не тратят ничего: ни кадров,
// ни сообщений на сервер.

const KEY = "crossade.table.meters";
/** Как часто обновляется строка и уходит эхо, мс. */
const EVERY_MS = 1000;

export interface MetersWorld {
  /** Отправить метку на сервер; нет сети (стенд) — нет. */
  ping?(t: number): void;
  onPing?(listener: (t: number) => void): void;
  /** Взгляд камеры: цель, зум, поворот, наклон — как их держит стол. */
  camera(): { x: number; y: number; zoom: number; turn: number; lean: number; k: number };
}

export interface Meters {
  readonly on: boolean;
  toggle(): void;
}

/** Кадров в секунду за окно: сколько кадров прошло за сколько миллисекунд. */
export const fpsOf = (frames: number, ms: number): number => (ms > 0 ? Math.round((frames * 1000) / ms) : 0);

export function mountMeters(host: HTMLElement, world: MetersWorld): Meters {
  const read = (): boolean => {
    try {
      return localStorage.getItem(KEY) === "on";
    } catch {
      return false;
    }
  };
  let on = read();
  let ping: number | null = null;
  let frames = 0;
  let since = performance.now();
  let fps = 0;
  let raf = 0;
  let tick = 0;

  const panel = document.createElement("div");
  panel.dataset.meters = "";
  panel.style.cssText = "position:fixed;left:16px;top:calc(76px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px));z-index:250;"
    + "pointer-events:none;padding:6px 8px;border-radius:8px;background:rgba(11,7,4,.72);box-shadow:inset 0 0 0 1px #6b4d2c;"
    + "font:400 11px/1.45 ui-monospace,Menlo,monospace;color:#f5ead0;white-space:pre;display:none";
  host.append(panel);

  world.onPing?.((t) => {
    ping = Math.round(performance.now() - t);
  });

  const paint = () => {
    const c = world.camera();
    const pingText = world.ping ? (ping === null ? "…" : `${ping} мс`) : "нет сети";
    panel.dataset.ping = ping === null ? "" : String(ping);
    panel.dataset.fps = String(fps);
    panel.textContent = `пинг   ${pingText}\nкадры  ${fps} fps\n`
      + `камера x ${c.x.toFixed(2)}  y ${c.y.toFixed(2)}\n`
      + `       зум ${c.zoom.toFixed(2)}  ${c.k.toFixed(1)} px/ед\n`
      + `       поворот ${Math.round(c.turn)}°  наклон ${Math.round(c.lean)}°`;
  };

  const frame = (now: number) => {
    frames += 1;
    if (now - since >= EVERY_MS) {
      fps = fpsOf(frames, now - since);
      frames = 0;
      since = now;
    }
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    panel.style.display = "block";
    frames = 0;
    since = performance.now();
    raf = requestAnimationFrame(frame);
    const beat = () => {
      world.ping?.(performance.now());
      paint();
    };
    beat();
    tick = window.setInterval(beat, EVERY_MS);
  };
  const stop = () => {
    panel.style.display = "none";
    cancelAnimationFrame(raf);
    window.clearInterval(tick);
    ping = null;
  };
  if (on) start();

  return {
    get on() {
      return on;
    },
    toggle() {
      on = !on;
      try {
        localStorage.setItem(KEY, on ? "on" : "off");
      } catch {
        // Хранилище закрыто — тумблер проживёт до перезагрузки.
      }
      if (on) start();
      else stop();
    },
  };
}
