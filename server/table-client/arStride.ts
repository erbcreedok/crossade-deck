// ПРОГУЛКА С КАМЕРОЙ — пока держишь компас, телефон видит пол и знает, куда ты шагнул.
//
// AR по умолчанию — гироскоп: поворот знает, шагов не знает. Зажал компас и держишь — включается камера,
// НЕВИДИМО: фон тот же, сетка. Камера смотрит на пол под столом и ведёт по нему точки (`arTrack.ts`):
// поворот — от гироскопа, шаг — из того, как точки поехали. Отпустил палец — камера гаснет, ты остаёшься
// там, куда пришёл.
//
// Точки кончились (отвернулся, закрыл камеру) — шаг не считается, стол держит гироскоп; следующий кадр
// набирает точки заново там, где ты сейчас.

import { assess } from "./arQuality.js";
import { CAM_FOV, openCamera, VIDEO_LAG } from "./arMarker.js";
import { eyeFrom, follow, onPlane, pyramid, rayOf, spread, type Grey, type Lens, type Pt, type Quat } from "./arTrack.js";

type Vec = [number, number, number];

/** Ширина серого кадра, px: хватает на точки пола и не грузит телефон. */
const GREY_W = 144;
const LEVELS = 3;
/** Столько точек держим; меньше `REFILL` — добираем новые; меньше `ENOUGH` — шаг не считаем. */
const KEEP = 60, REFILL = 24, ENOUGH = 8;
/** Точка ближе к краю кадра — не берётся: окно слежения вылезло бы за край. */
const EDGE = 10;
/** Шаг глаза за кадр больше этого — сбой слежения, а не шаг человека. */
const JUMP = 0.25;

export interface StrideWorld {
  stage: HTMLElement;
  felt: HTMLElement;
  /** Поворот телефона в миг `t` (мс, `performance.now()`). */
  turnAt(t: number): Quat;
  /** Плоскость стола в мире сейчас: точка на ней и нормаль. */
  plane(): { at: Vec; n: Vec };
  /** Где глаз сейчас и куда его поставить (метры мира AR). */
  eye(): Vec;
  move(eye: Vec): void;
  /** Что сказать человеку: идёт, потерял пол; `null` — молчать. */
  say(text: string | null): void;
}

interface Point { p: Pt; X: Vec }

/** Включить камеру и идти; строка — почему не вышло, словами. */
export async function startStride(w: StrideWorld): Promise<{ stop(): void } | string> {
  const cam = await openCamera(w.stage, w.felt, { hidden: true });
  if (typeof cam === "string") return cam;
  const video = cam.video;
  const gw = GREY_W, gh = Math.round((GREY_W * video.videoHeight) / video.videoWidth);
  const lens: Lens = { width: gw, height: gh, fov: CAM_FOV };
  const canvas = document.createElement("canvas");
  canvas.width = gw;
  canvas.height = gh;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  const grey = (): Grey => {
    g.drawImage(video, 0, 0, gw, gh);
    const px = g.getImageData(0, 0, gw, gh).data;
    const data = new Float32Array(gw * gh);
    for (let i = 0; i < gw * gh; i += 1) data[i] = (0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!) / 255;
    return { data, width: gw, height: gh };
  };

  let live = true;
  let points: Point[] = [];
  let prev: Grey[] | null = null;
  let lastTime = -1;

  /** Добрать точек: самые сильные углы, не рядом с уже ведомыми, лучом на плоскость стола. */
  const refill = (frame: Grey, q: Quat): void => {
    const eye = w.eye(), { at, n } = w.plane();
    const fresh = spread(assess(frame).points.filter((p) => p.x >= EDGE && p.y >= EDGE && p.x <= gw - EDGE && p.y <= gh - EDGE
      && points.every((o) => (o.p.x - p.x) ** 2 + (o.p.y - p.y) ** 2 >= 100)), KEEP - points.length, 10);
    for (const p of fresh) {
      const X = onPlane(eye, rayOf(lens, q, p), at, n);
      if (X) points.push({ p, X });
    }
  };

  const step = (now: number): void => {
    if (!live) return;
    if (video.currentTime !== lastTime && video.videoWidth) {
      lastTime = video.currentTime;
      const t0 = performance.now();
      const frame = grey();
      const pyr = pyramid(frame, LEVELS);
      const q = w.turnAt(now - VIDEO_LAG);
      if (prev && points.length) {
        const moved = follow(prev, pyr, points.map((o) => o.p));
        points = points.flatMap((o, i) => (moved[i] ? [{ p: moved[i]!, X: o.X }] : []));
        if (points.length >= ENOUGH) {
          const was = w.eye();
          const { eye, miss } = eyeFrom(points.map((o) => o.X), points.map((o) => rayOf(lens, q, o.p)), was);
          if (Math.hypot(eye[0] - was[0], eye[1] - was[1], eye[2] - was[2]) < JUMP) {
            w.move(eye);
            const med = [...miss].sort((a, b) => a - b)[miss.length >> 1] ?? 0;
            points = points.filter((_, i) => miss[i]! <= Math.max(0.003, 2 * med));
          } else points = [];
        } else points = [];
      }
      w.say(points.length >= ENOUGH ? "иду с камерой" : "камера не видит пола — держу гироскоп");
      if (points.length < REFILL) refill(frame, q);
      prev = pyr;
      // Сколько кадр съел — для прогона и измерителей: слежение обязано успевать за камерой.
      w.stage.dataset.arStride = `${points.length}:${Math.round(performance.now() - t0)}`;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);

  return {
    stop() {
      live = false;
      cam.stop();
      w.say(null);
    },
  };
}
