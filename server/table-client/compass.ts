// КОМПАС СТОЛА И «СВОЙ СТУЛ ВНИЗУ» — всё, что поворачивает и кладёт стол не жестом по сукну.
//
// У каждого зрителя камера повёрнута на угол его стула; компас показывает, как стол повёрнут сейчас,
// возвращает к стулу тапом и крутится пальцем. Вещь со своим состоянием (куда камера наведена) и без
// знания об остальном экране: ей дают камеру, перерисовку и «мой стул».

import type { Chair, Snapshot } from "../src/table/contract.js";
import { apart, shortWay } from "./angles.js";
import { LEAN_PER_PX, LEAN_STEP, type TableCamera } from "./camera.js";
import { BAR_LOOK, DISC_EYE, T } from "./screenConst.js";

export interface CompassWorld {
  cam: TableCamera;
  redraw(): void;
  /** Стул, на котором я сижу, — в этом снимке или в текущем. */
  myChair(s?: Snapshot): Chair | undefined;
  /** Слушатели окна — экранные: он их и снимет, когда уйдёт со страницы. */
  listen<K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void): void;
  unlisten<K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void): void;
}

export interface Compass {
  /** Довернуть камеру к моему стулу, если он сменился или сдвинулся. Зовётся на каждый кадр. */
  aim(s: Snapshot): void;
  goHome(): void;
  leanToggle(): void;
  drag(down: PointerEvent, part: "ring" | "lean", ring: HTMLElement): void;
  /** Насколько камера ушла от своего стула — поворот коротким путём или наклон, в градусах. */
  offSeat(s: Snapshot): number;
  html(s: Snapshot): string;
}

export function tableCompass(o: CompassWorld): Compass {
  /**
   * СВОЙ СТУЛ — ВНИЗУ, И ЭТО ДЕЛАЕТ КАМЕРА, А НЕ РИСОВАНИЕ. Стол, стулья и карты у всех в одних осях
   * стола; у каждого зрителя камера по умолчанию повёрнута на угол его стула. Сел впервые — камера
   * встаёт сразу; пересел (или стул сдвинули) — доворачивается плавно, и то, что игрок накрутил сам,
   * до тех пор не трогается.
   */
  let aimedAt: { chair: string; angle: number } | null = null;
  function aim(s: Snapshot): void {
    const chair = o.myChair(s);
    if (!chair) return;
    if (aimedAt && aimedAt.chair === chair.id && aimedAt.angle === chair.angle) return;
    if (!aimedAt) o.cam.camera.turnTo(chair.angle);
    else {
      o.cam.camera.glideTurnTo(chair.angle);
      o.redraw();
    }
    aimedAt = { chair: chair.id, angle: chair.angle };
  }

  /** Наклон меньше этого считается нулевым: глазами такой стол уже плоский, а ровно нуля после глайда не бывает. */
  const LEAN_EPS = 0.5;

  /** Вернуть камеру к своему стулу: и поворот, и наклон. То, чем была стрелка «домой». */
  function goHome(): void {
    const chair = o.myChair();
    if (!chair) return;
    o.cam.camera.glideTurnTo(chair.angle);
    o.cam.camera.glideTiltTo(0);
    o.redraw();
  }

  /** Положить стол на `LEAN_STEP` или поднять обратно — один и тот же тумблер у диска и у своего аватара. */
  function leanToggle(): void {
    o.cam.camera.glideTiltTo(o.cam.camera.pitch > LEAN_EPS ? 0 : LEAN_STEP);
    o.redraw();
  }

  /** Сдвиг с места, после которого нажатие на компас — уже жест, а не тап, в пикселях стекла. */
  const COMPASS_SLOP = 4;

  /**
   * КОМПАС ТЯНЕТСЯ РУКОЙ. Кольцо крутят пальцем по кругу — стол поворачивается вслед за ним; диск
   * тянут вверх-вниз — стол кладётся и встаёт.
   *
   * Это единственный способ повернуть и наклонить стол ОДНИМ пальцем и БЕЗ Ctrl/Cmd: на телефоне
   * модификаторов нет вовсе, а два пальца там уже заняты щипком. Не сдвинулся с места — это тап, и
   * работает прежнее: кольцо возвращает к стулу, диск кладёт стол на `LEAN_STEP`.
   */
  function drag(down: PointerEvent, part: "ring" | "lean", ring: HTMLElement): void {
    const box = ring.getBoundingClientRect();
    const mid = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const aimAt = (e: { clientX: number; clientY: number }) => (Math.atan2(e.clientY - mid.y, e.clientX - mid.x) * 180) / Math.PI;
    const from = { rotation: o.cam.camera.rotation, pitch: o.cam.camera.pitch, aim: aimAt(down), y: down.clientY };
    let moved = false;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return;
      const turned = shortWay(aimAt(e), from.aim);
      // Порог у кольца меряется по дуге под пальцем, а не в градусах: кольцо маленькое, и градус на нём — доли пикселя.
      const far = part === "ring" ? Math.abs((turned * Math.PI * box.width) / 360) : Math.abs(e.clientY - from.y);
      if (!moved && far < COMPASS_SLOP) return;
      moved = true;
      if (part === "ring") o.cam.camera.turnTo(from.rotation - turned);
      else o.cam.camera.tiltTo(from.pitch - (e.clientY - from.y) * LEAN_PER_PX);
      o.redraw();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return;
      o.unlisten("pointermove", move);
      o.unlisten("pointerup", up);
      o.unlisten("pointercancel", up);
      if (moved) return;
      if (part === "lean") leanToggle();
      else goHome();
    };
    o.listen("pointermove", move);
    o.listen("pointerup", up);
    o.listen("pointercancel", up);
  }

  /** Насколько камера ушла от своего стула — поворот коротким путём, в градусах. */
  function offSeat(s: Snapshot): number {
    const chair = o.myChair(s);
    if (!chair) return 0;
    return Math.max(apart(o.cam.camera.rotation, chair.angle), o.cam.camera.pitch);
  }

  /**
   * КОМПАС СТОЛА — кольцо с диском внутри, в правом верхнем углу кадра.
   *
   * Кольцо крутится вместе с камерой: золотая стрелка смотрит на ТВОЙ стул (севера за карточным
   * столом нет), деревянная — в противоположную сторону. Тап по кольцу возвращает и поворот, и
   * наклон. Диск внутри — наклон: камера светлым по панели, пока стол лежит плоско, и тёмным по
   * золоту, когда наклон не ноль. Тап по диску кладёт стол на 45° и возвращает в ноль.
   *
   * Красок со стороны здесь нет: те же гербовые цвета, что у бара и у окон, — зелень сукна, дерево
   * канта, золото и светлая охра букв.
   *
   * Висит ВСЕГДА, а не только когда камера ушла: по нему видно, как стол повёрнут, и это полезно
   * ровно тогда, когда возвращаться ещё не надо.
   */
  function html(s: Snapshot): string {
    const chair = o.myChair(s);
    if (!chair) return "";
    const turn = chair.angle - o.cam.camera.rotation;
    const lean = o.cam.camera.pitch > LEAN_EPS;
    const disc = lean
      ? `background:linear-gradient(${BAR_LOOK.goldHi},${BAR_LOOK.goldLo});color:${T.black}`
      : `background:linear-gradient(${T.panelLight},${T.panel});color:${T.inkDim}`;
    // ДИСК ЛЕЖИТ ПАРАЛЛЕЛЬНО СТОЛУ: он наклонён ровно на тот же угол, и по его сплющенности видно
    // наклон, не трогая камеру. Плоский стол — круг, положенный — эллипс, как сам стол в кадре.
    const lie = `transform:perspective(${DISC_EYE}px) rotateX(${o.cam.camera.pitch.toFixed(1)}deg)`;
    return `<button data-home aria-label="К своему стулу" style="position:absolute;right:12px;top:calc(12px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px));width:52px;height:52px;border:0;padding:0;z-index:45;`
      + `border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;`
      + `background:linear-gradient(${BAR_LOOK.plateHi},${BAR_LOOK.plateLo});box-shadow:inset 0 0 0 3px ${T.black},inset 0 0 0 5px ${BAR_LOOK.rim}">`
      + `<svg viewBox="0 0 52 52" width="52" height="52" style="position:absolute;left:0;top:0;transform:rotate(${turn}deg);pointer-events:none">`
      + `<path d="M26 5 L30 14 L22 14 Z" fill="${T.gold}"/><path d="M26 47 L22 38 L30 38 Z" fill="${BAR_LOOK.rim}"/>`
      + `<circle cx="7" cy="26" r="2" fill="${T.inkDim}" opacity=".7"/><circle cx="45" cy="26" r="2" fill="${T.inkDim}" opacity=".7"/></svg>`
      + `<span data-lean style="position:relative;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;`
      + `box-shadow:inset 0 0 0 2px ${T.black};${lie};${disc}">`
      + `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" style="pointer-events:none">`
      + `<rect x="2.5" y="7" width="12.5" height="10" rx="2.5"/><path d="M15 10.5 L21.5 7 v10 L15 13.5 Z"/></svg></span></button>`;
  }

  return { aim, goHome, leanToggle, drag, offSeat, html };
}
