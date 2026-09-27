// AR-СТОЛ НА ЭКРАНЕ — датчик наклона, место стола в мире и пол под ним.
//
// СТОЛ = ЯКОРЬ + ПОСАДКА (`arSeat.ts`). Якорь по умолчанию — гравитация: стол встаёт туда, куда
// смотришь, камера не нужна. Ходить — джойстиком с компаса или ПРОГУЛКОЙ С КАМЕРОЙ: зажал компас и держишь
// секунду — камера невидимо смотрит на пол и ведёт шаги (`arStride.ts`), отпустил — погасла. По желанию —
// предмет (картина, доска): камера фоном, стол ложится в плоскость предмета (или плашмя), и вдоль него
// можно ходить ногами (`arMarker.ts`, `arFuse.ts`: поворот — гироскоп, метка говорит лишь, где стоит
// телефон). Посадку — сдвиг, наклон, размер — человек подгоняет сам («подогнать»), она своя у каждого
// якоря. Кнопки сверху — `arHud.ts`.
//
// Включает AR сам человек — долгим нажатием на компас (`compass.ts`), выходит — кнопкой сверху; стол
// всегда открывается обычным. Экран
// (`screen.ts`) спрашивает отсюда линзу (`arLens.ts`) вместо линзы пальцевой камеры — и больше ничего не знает. От пальцевой камеры AR берёт только поворот и зум: два пальца крутят и растят стол,
// а свой стул ставит ко мне тот же компас (`compass.ts`). Сдвиг и наклон — дело самого телефона.
//
// Датчик — Telegram (`WebApp.DeviceOrientation`, радианы), если мини-апп его даёт, иначе браузерный
// `deviceorientation` (градусы). iOS даёт браузерный только после разрешения из жеста — поэтому, пока
// датчик молчит, поверх стола висит кнопка «Включить наклон».

import { createFusion, FUSE, gyroTrack } from "./arFuse.js";
import { captureBox, mountHud, type HudState } from "./arHud.js";
import { hearNative, nativeShell, type NativePose } from "./arNative.js";
import { arLens, deviceQuat, placeAtGaze, yawQuat, type ArLens, type ArPlace, type Quat } from "./arLens.js";
import { deleteMarker, listMarkers, makeMarker, openCamera, saveMarker, track, VIDEO_LAG, warm, type Backdrop, type StoredMarker } from "./arMarker.js";
import { assess, greyOf } from "./arQuality.js";
import { clampSeat, readSeat, SEAT0, seated, tableOnMarker, tiltBy, writeSeat, type ArSeat } from "./arSeat.js";
import { startStride } from "./arStride.js";
import { rotate } from "./arTrack.js";
import { leftToGo, walkStep, WALK } from "./arWalk.js";
import { R, RIM } from "./felt.js";

/** Вертикальный обзор: телефонный экран в портрете. */
const FOV = 62;
/** Стол ниже глаз на столько метров, а если смотреть в горизонт — на столько впереди. */
const DROP = 0.35;
const AHEAD = 0.45;
/** Метров в ширине карты: стол радиусом в семь карт — около трети метра, весь в кадре при входе, как у пальцевой камеры. */
const UNIT = 0.022;
/** Нет датчика (компьютер): телефон как бы смотрит вперёд и вниз на столько градусов. */
const STILL_BETA = 55;
/** Сколько ждать датчик, прежде чем попросить разрешение кнопкой. */
const SILENT_MS = 700;
/** Радиус джойстика, px: натяжка меряется в них, перетянуть можно (`WALK.PULL_MAX`). */
const STICK_R = 56;
/** На предмете мир меряется ширинами метки: стол радиусом в 0.6 ширины — чуть шире картины. */
const MARKER_UNIT = 0.6 / (R + RIM);
/** Метку видели не дольше стольких мс назад — «видна»: ходьба ногами, джойстик спит. */
const SEEN_MS = 400;
/** Сторона серого кадра для оценки годности, px — как у стенда. */
const ASSESS = 160;

interface TelegramOrientation {
  isStarted?: boolean;
  alpha?: number | null;
  beta?: number | null;
  gamma?: number | null;
  start?(params: { refresh_rate?: number; need_absolute?: boolean }, cb?: (ok: boolean) => void): void;
  stop?(cb?: (ok: boolean) => void): void;
}
interface TelegramApp {
  DeviceOrientation?: TelegramOrientation;
  onEvent?(name: string, fn: () => void): void;
  offEvent?(name: string, fn: () => void): void;
}

export interface ArRig {
  /** Линза на этот кадр: поворот и зум — от пальцевой камеры. */
  lens(frame: { w: number; h: number }, turn: number, zoom: number): ArLens;
  /** Поставить стол туда, куда сейчас смотрит телефон. */
  place(): void;
  /** ВЫРОВНЯТЬ: вернуться к своему стулу и поставить стол перед собой. */
  recenter(): void;
  /** Джойстик ходьбы с серединой `from` (компас), палец `id` уже в `at`; живёт, пока палец не поднят. */
  stick(id: number, from: { x: number; y: number }, at: { x: number; y: number }): void;
  /** Палец лёг на пустое сукно — хват: точка стола под пальцем идёт за ним, пока палец не поднят. */
  grab(down: PointerEvent): void;
  /** Компас зажат секунду — прогулка с камерой, пока палец не поднят (`arStride.ts`). */
  stride(on: boolean): void;
  dispose(): void;
}

export function mountAr(stage: HTMLElement, felt: HTMLCanvasElement, changed: () => void, exit: () => void): ArRig {
  let q: Quat = deviceQuat(0, STILL_BETA, 0, 0);
  const gyro = gyroTrack();
  // В ПРИЛОЖЕНИИ (`arNative.ts`) поворот и место телефона — от ARKit, камера — под страницей.
  const shell = nativeShell();
  let native: NativePose | null = null;
  /** Стол перед глазами: куда смотришь, на `DROP` ниже глаза; в приложении — от того места, где стоишь. */
  function gazePlace(): ArPlace {
    const p = placeAtGaze(q, DROP, AHEAD, UNIT);
    const at = native?.pos;
    return at ? { ...p, at: [p.at[0] + at[0], p.at[1] + at[1], p.at[2] + at[2]] } : p;
  }
  let placed: ArPlace = gazePlace();
  let heard = false;
  /** Где стоишь — условные метры от своего стула (метр — радиус стола), `arWalk.ts`. */
  let walk = { x: 0, z: 0 };
  const off: Array<() => void> = [];

  const screenAngle = (): number => screen.orientation?.angle ?? (globalThis as { orientation?: number }).orientation ?? 0;
  const place = (): void => {
    placed = gazePlace();
    changed();
  };
  const hear = (alpha: number, beta: number, gamma: number): void => {
    q = deviceQuat(alpha, beta, gamma, screenAngle());
    gyro.push(performance.now(), q);
    if (!heard) {
      heard = true;
      ask.remove();
      placed = gazePlace(); // первое слово датчика — стол встаёт туда, куда смотришь
    }
    changed();
  };

  // ── датчик ─────────────────────────────────────────────────────────────────────────────────────
  const tg = (globalThis as { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;
  const tgo = tg?.DeviceOrientation;
  if (shell) {
    shell.ar(true);
    off.push(() => shell.ar(false));
    off.push(hearNative((pose) => {
      native = pose;
      q = pose.q;
      if (!heard) {
        heard = true;
        placed = gazePlace();
      }
      changed();
    }));
  }
  if (tgo?.start && tg?.onEvent && !shell) {
    const deg = 180 / Math.PI;
    const read = (): void => {
      if (tgo.beta == null) return;
      hear((tgo.alpha ?? 0) * deg, tgo.beta * deg, (tgo.gamma ?? 0) * deg);
    };
    tg.onEvent("deviceOrientationChanged", read);
    tgo.start({ refresh_rate: 20, need_absolute: false });
    off.push(() => { tg.offEvent?.("deviceOrientationChanged", read); tgo.stop?.(); });
  }
  const onBrowser = (e: DeviceOrientationEvent): void => {
    if (e.beta != null) hear(e.alpha ?? 0, e.beta, e.gamma ?? 0);
  };
  if (!shell) {
    addEventListener("deviceorientation", onBrowser);
    off.push(() => removeEventListener("deviceorientation", onBrowser));
  }

  // Разрешение на iOS — только из жеста. Кнопка появляется, если датчик молчит, и уходит, как заговорит.
  const ask = document.createElement("button");
  ask.textContent = "Включить наклон";
  ask.dataset.arAsk = "";
  Object.assign(ask.style, {
    position: "fixed", left: "50%", top: "38%", transform: "translate(-50%,-50%)", zIndex: "40",
    font: "400 14px/1 Tiny5, monospace", color: "#0b0704", background: "#f2c14e", border: "0",
    borderRadius: "8px", padding: "14px 18px", boxShadow: "inset 0 -3px 0 rgba(0,0,0,.25)",
  });
  ask.onclick = async () => {
    const perm = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent?.requestPermission;
    if (perm) await perm().catch(() => "denied");
    ask.textContent = "Датчик молчит — стол стоит на месте";
    setTimeout(() => ask.remove(), 1800);
  };
  const needsAsk = !shell && typeof (globalThis as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent?.requestPermission === "function";
  const silent = setTimeout(() => { if (!heard && needsAsk) document.body.append(ask); }, SILENT_MS);
  off.push(() => { clearTimeout(silent); ask.remove(); });

  // ── пол ────────────────────────────────────────────────────────────────────────────────────────
  // Сетка на плоскости стола до горизонта: без неё поворот телефона читается как дрожь картинки, а не
  // как поворот головы. Слой под сукном и над фоном хаба — сукно хаба в AR не видно. Это SVG, а не
  // холст: холст на странице один — стол, и его находят по `querySelector("canvas")`.
  const SVG = "http://www.w3.org/2000/svg";
  const floor = document.createElement("div");
  floor.dataset.arFloor = "";
  floor.style.cssText = "position:absolute;inset:0;pointer-events:none;background:linear-gradient(#07100b,#15261d);";
  const grid = document.createElementNS(SVG, "svg");
  grid.setAttribute("width", "100%");
  grid.setAttribute("height", "100%");
  grid.style.cssText = "position:absolute;inset:0;";
  const lines = document.createElementNS(SVG, "path");
  const axis = document.createElementNS(SVG, "path");
  lines.setAttribute("stroke", "rgba(127,209,185,.10)");
  axis.setAttribute("stroke", "rgba(107,77,44,.55)");
  for (const el of [lines, axis]) { el.setAttribute("fill", "none"); el.setAttribute("stroke-width", "1"); grid.append(el); }
  floor.append(grid);
  stage.insertBefore(floor, felt);
  off.push(() => floor.remove());
  // В приложении под страницей — камера: пол и все фоны страницы прозрачны, пока AR включён.
  if (shell) {
    floor.style.background = "transparent";
    const clear = [document.documentElement, document.body, stage];
    const was = clear.map((el) => el.style.background);
    for (const el of clear) el.style.background = "transparent";
    off.push(() => clear.forEach((el, i) => { el.style.background = was[i]!; }));
  }

  const drawFloor = (l: ArLens): void => {
    const STEP = 4, SPAN = 64, SEG = 32;
    let d = "", d0 = "";
    for (let i = -SPAN; i <= SPAN; i += STEP) {
      for (const [a, b] of [[{ x: i, y: -SPAN }, { x: i, y: SPAN }], [{ x: -SPAN, y: i }, { x: SPAN, y: i }]] as const) {
        let path = "", pen = false;
        for (let k = 0; k <= SEG; k += 1) {
          const q = l.project({ x: a.x + ((b.x - a.x) * k) / SEG, y: a.y + ((b.y - a.y) * k) / SEG });
          if (!q) { pen = false; continue; }
          path += `${pen ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
          pen = true;
        }
        if (i === 0) d0 += path; else d += path;
      }
    }
    lines.setAttribute("d", d);
    axis.setAttribute("d", d0);
  };

  // ── ходьба: джойстик, хват и подсказка ─────────────────────────────────────────────────────────
  // Джойстик — НА КОМПАСЕ (`compass.ts`): повёл палец от компаса — кольцо встаёт вокруг него, ручка идёт
  // за пальцем. Пустое сукно — ХВАТ: взятая точка стола остаётся под пальцем, глаз едет по полу вместо неё.
  // Второй палец — это щипок или поворот: ходьба и хват прекращаются и отдают жест камере.
  const hint = document.createElement("div");
  hint.dataset.arHint = "";
  hint.style.cssText = "position:fixed;left:50%;top:calc(76px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px));"
    + "transform:translateX(-50%);z-index:44;padding:6px 12px;border-radius:8px;background:rgba(11,7,4,.82);color:#f5ead0;"
    + "font:400 12px/1 Tiny5,monospace;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .2s";
  document.body.append(hint);
  off.push(() => hint.remove());

  /** Курс телефона по полу — как у `placeAtGaze`: взгляд плюс верх экрана, чтобы не терять его, глядя вниз. */
  const yawOf = (): number => {
    const t = placeAtGaze(q, DROP, AHEAD, UNIT);
    return t.yaw;
  };
  let walking: { id: number; x0: number; y0: number; x: number; y: number; at: number; ring: HTMLElement; knob: HTMLElement } | null = null;
  const stopWalk = (): void => {
    if (!walking) return;
    walking.ring.remove();
    walking = null;
    hint.style.opacity = "0";
  };
  const stepWalk = (now: number): void => {
    if (!walking) return;
    const dt = Math.min(0.05, (now - walking.at) / 1000);
    walking.at = now;
    const stick = { x: (walking.x - walking.x0) / STICK_R, y: -(walking.y - walking.y0) / STICK_R };
    walk = walkStep(walk, stick, yawOf(), dt);
    const left = leftToGo(Math.hypot(walk.x, walk.z));
    hint.style.opacity = left === null ? "0" : "1";
    if (left !== null) hint.textContent = `дальше можно ещё ${left.toFixed(1)} м`;
    changed();
    requestAnimationFrame(stepWalk);
  };
  const stick = (id: number, from: { x: number; y: number }, at: { x: number; y: number }): void => {
    if (feet()) return;
    stopGlide();
    stopWalk();
    grabbing = null;
    const ring = document.createElement("div");
    ring.dataset.arStick = "";
    const size = STICK_R * 2;
    // Над компасом: ручка стартует из его середины и должна быть видна поверх.
    ring.style.cssText = `position:fixed;left:${from.x - STICK_R}px;top:${from.y - STICK_R}px;width:${size}px;height:${size}px;border-radius:50%;`
      + "z-index:46;pointer-events:none;box-shadow:inset 0 0 0 2px rgba(245,234,208,.45);background:rgba(11,7,4,.18)";
    const knob = document.createElement("div");
    knob.style.cssText = `position:absolute;left:${STICK_R - 22}px;top:${STICK_R - 22}px;width:44px;height:44px;border-radius:50%;`
      + "background:linear-gradient(#f8d885,#b08a26);box-shadow:inset 0 0 0 2px #0b0704";
    ring.append(knob);
    document.body.append(ring);
    walking = { id, x0: from.x, y0: from.y, x: from.x, y: from.y, at: performance.now(), ring, knob };
    moveKnob(at.x, at.y);
    requestAnimationFrame(stepWalk);
  };
  /** Хват: точка стола под пальцем в миг касания; глаз двигается так, чтобы она оставалась под ним. */
  let grabbing: { id: number; desk: { x: number; y: number } } | null = null;
  let seenLens: ArLens | null = null;
  let metre = 1;
  const grab = (down: PointerEvent): void => {
    if (!seenLens || feet()) return;
    stopGlide();
    stopWalk();
    grabbing = { id: down.pointerId, desk: seenLens.toDesk({ x: down.clientX, y: down.clientY }) };
  };
  const dragGrab = (e: PointerEvent): void => {
    if (!grabbing || !seenLens || e.pointerId !== grabbing.id) return;
    const want = seenLens.toWorld(grabbing.desk), got = seenLens.toWorld(seenLens.toDesk({ x: e.clientX, y: e.clientY }));
    let x = walk.x + (want[0] - got[0]) / metre, z = walk.z + (want[2] - got[2]) / metre;
    const d = Math.hypot(x, z);
    if (d > WALK.MAX) { x = (x / d) * WALK.MAX; z = (z / d) * WALK.MAX; }
    walk = { x, z };
    changed();
  };
  const moveKnob = (x: number, y: number): void => {
    if (!walking) return;
    walking.x = x;
    walking.y = y;
    const dx = x - walking.x0, dy = y - walking.y0, len = Math.hypot(dx, dy), k = len > STICK_R ? STICK_R / len : 1;
    walking.knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
  };
  const onMove = (e: PointerEvent): void => {
    if (walking && e.pointerId === walking.id) moveKnob(e.clientX, e.clientY);
    dragGrab(e);
  };
  const onUp = (e: PointerEvent): void => {
    if (walking && e.pointerId === walking.id) stopWalk();
    if (grabbing && e.pointerId === grabbing.id) grabbing = null;
  };
  const onSecond = (e: PointerEvent): void => {
    if (walking && e.pointerId !== walking.id) stopWalk();
    if (grabbing && e.pointerId !== grabbing.id) grabbing = null;
  };
  addEventListener("pointermove", onMove);
  addEventListener("pointerup", onUp);
  addEventListener("pointercancel", onUp);
  addEventListener("pointerdown", onSecond, true);
  off.push(() => {
    stopWalk();
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerup", onUp);
    removeEventListener("pointercancel", onUp);
    removeEventListener("pointerdown", onSecond, true);
  });

  // ── якорь, посадка, камера ─────────────────────────────────────────────────────────────────────
  /** `unit` — ширин метки в единице стола: у предмета своя мерка. */
  type Anchor = { kind: "gravity" } | { kind: "marker"; id: string; unit: number };
  let anchor: Anchor = { kind: "gravity" };
  let seat: ArSeat = readSeat(localStorage, "gravity");
  const seatKey = (): string => (anchor.kind === "marker" ? `marker:${anchor.id}` : anchor.kind);
  /**
   * ПОКОЛЕНИЕ ЯКОРЯ. Привязка к предмету долгая (камера, запуск трекера), а человек за это время может
   * выбрать другое. Каждая смена якоря — новое поколение; привязка, чьё поколение устарело, останавливает
   * свой трекер и ничего не трогает.
   */
  let gen = 0;
  const fusion = createFusion(() => ({ ...FUSE, flat: seat.flat }));
  let backdrop: Backdrop | null = null;
  let untrack: (() => void) | null = null;
  let markers: StoredMarker[] = [];
  let lensAt = performance.now();
  let lastTurn = 0;
  let lastZoom = 1;
  const seenNow = (): HudState["seen"] => {
    if (anchor.kind === "gravity" || !fusion.S.locked) return "search";
    return performance.now() - fusion.S.seenAt < SEEN_MS ? "seen" : "lost";
  };
  /** Сказать сверху (там же, где «дальше можно ещё …»); `null` — убрать. */
  const say = (text: string | null, ms = 0): void => {
    hint.style.opacity = text ? "1" : "0";
    if (text) hint.textContent = text;
    if (text && ms) setTimeout(() => { if (hint.textContent === text && !walking) hint.style.opacity = "0"; }, ms);
  };
  /** Предмет виден — ходишь ногами: джойстик и хват спят, об этом — подсказка. */
  const feet = (): boolean => {
    if (seenNow() !== "seen") return false;
    say("предмет виден — ходи ногами", 1400);
    return true;
  };

  const hud: HudState = { anchor: "gravity", seen: "search", camera: "off", fitting: false, seat, markers: [], active: null, sheet: null, progress: 0 };
  const showHud = (): void => {
    Object.assign(hud, { anchor: anchor.kind, seat, active: anchor.kind === "marker" ? anchor.id : null, markers: markers.map(({ id, name, thumb, points }) => ({ id, name, thumb, points })) });
    stage.dataset.arAnchor = `${anchor.kind}:${hud.seen}`;
    stage.dataset.arSeat = JSON.stringify(seat);
    ui.render(hud);
  };
  const sheet = (s: HudState["sheet"]): void => { hud.sheet = s; showHud(); };

  const stopTrack = (): void => { untrack?.(); untrack = null; fusion.reset(); };
  const stopCamera = (): void => {
    stopTrack();
    backdrop?.stop();
    backdrop = null;
    floor.style.display = "";
    if (hud.camera === "on" || hud.camera === "starting") hud.camera = "off";
  };
  /** Камера под сукном — только для предмета: его надо видеть. Не вышло — почему, видно в окне якоря. */
  const camera = async (): Promise<Backdrop | null> => {
    if (backdrop) return backdrop;
    stride.stop();
    hud.camera = "starting";
    showHud();
    const got = await openCamera(stage, felt);
    if (typeof got === "string") {
      hud.camera = { error: got };
      sheet("menu");
      return null;
    }
    backdrop = got;
    hud.camera = "on";
    void warm(); // трекер грузится и прогревается сейчас, а не когда человек ждёт метку
    floor.style.display = "none";
    showHud();
    changed();
    return backdrop;
  };
  const useSeat = (): void => { seat = readSeat(localStorage, seatKey()); showHud(); changed(); };

  /** Перед собой: стол держит гироскоп, камера не нужна. */
  const gravity = (): void => {
    gen += 1;
    stopCamera();
    anchor = { kind: "gravity" };
    useSeat();
    place();
  };
  /** Стол держится за предмет `m`. */
  const attach = async (m: StoredMarker, next: Anchor & { kind: "marker" }, mine = ++gen): Promise<void> => {
    const cam = await camera();
    if (!cam || mine !== gen) return;
    stopTrack();
    anchor = next;
    hud.sheet = null;
    // Где телефон, теперь говорит предмет: пройденные джойстиком и с камерой шаги к нему не относятся.
    walk = { x: 0, z: 0 };
    lift = 0;
    useSeat();
    const stop = await track(cam.video, m.buf, (pose, grabbedAt) => {
      if (!pose) return;
      const was = seenNow();
      const q0 = gyro.at(grabbedAt - VIDEO_LAG) ?? q;
      // Прошёл джойстиком, пока предмета не было видно, — шаги вливаются в связку до её слова.
      if (was === "lost" && (walk.x || walk.z)) {
        fusion.shift([walk.x * metre, 0, walk.z * metre]);
        walk = { x: 0, z: 0 };
      }
      fusion.measure(q0, pose.t, pose.q, performance.now());
      changed();
    });
    if (mine === gen && anchor === next && backdrop === cam) untrack = stop;
    else stop();
  };
  const use = async (id: string): Promise<void> => {
    const m = markers.find((x) => x.id === id);
    if (m) await attach(m, { kind: "marker", id, unit: MARKER_UNIT });
  };
  const fit = (on: boolean): void => { hud.fitting = on; hud.sheet = null; fingers.clear(); showHud(); };

  const ui = mountHud({
    exit,
    menu: (open) => {
      // Окно якоря открыли — значит, возможно, будут снимать предмет: трекер греется, пока человек читает и
      // целится, и метка потом собирается за доли секунды.
      if (open) void warm();
      if (open) void listMarkers().then((list) => { markers = list; sheet("menu"); });
      else sheet(null);
    },
    fit,
    fitDone: () => { writeSeat(localStorage, seatKey(), seat); fit(false); },
    fitReset: () => { seat = { ...SEAT0, flat: seat.flat }; showHud(); changed(); },
    fitCancel: () => { fit(false); useSeat(); },
    gravity: () => { hud.sheet = null; gravity(); },
    use: (id) => void use(id),
    forget: (id) => void deleteMarker(id).then(listMarkers).then((list) => {
      markers = list;
      if (anchor.kind === "marker" && anchor.id === id) gravity();
      sheet("menu");
    }),
    capture: () => void camera().then((cam) => { if (cam) sheet("capture"); }),
    shoot: () => void (async () => {
      const cam = backdrop;
      if (!cam) return;
      const box = captureBox(innerWidth, innerHeight);
      const a = cam.toVideo(box.x, box.y), b = cam.toVideo(box.x + box.side, box.y + box.side);
      hud.progress = 0;
      sheet("compile");
      try {
        const m = await makeMarker(cam.video, { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }, markers.length, (p) => { hud.progress = p; showHud(); });
        await saveMarker(m);
        markers = await listMarkers();
        await use(m.id);
      } catch (err) {
        hud.camera = { error: `метка не собралась: ${String((err as Error)?.message ?? err)}` };
        sheet("menu");
      }
    })(),
    flat: () => { seat = { ...seat, flat: !seat.flat }; writeSeat(localStorage, seatKey(), seat); fusion.reset(); showHud(); changed(); },
    again: () => { walk = { x: 0, z: 0 }; sheet(null); fusion.reset(); changed(); },
    close: () => {
      // Съёмку бросили — камера была нужна только ей.
      if (hud.sheet === "capture" && anchor.kind === "gravity") stopCamera();
      sheet(null);
    },
  });
  off.push(() => ui.dispose());
  void listMarkers().then((list) => { markers = list; showHud(); });

  // ── «выровнять» — плавно ─────────────────────────────────────────────────────────────────────────
  // Тап по компасу: назад к своему стулу, стол перед собой. Прыжком это читалось как телепорт; теперь стол
  // едет на новое место за то же время, что компас доворачивает поворот (600 мс), с разгоном и торможением.
  // «Меньше анимаций» — прыжком, как раньше. Джойстик, хват или прогулка посреди пути — путь бросается.
  const GLIDE_MS = 600;
  let glide = 0;
  const stopGlide = (): void => { cancelAnimationFrame(glide); glide = 0; };
  function glideHome(): void {
    stopGlide();
    const to = gazePlace();
    if (document.documentElement.dataset.reduceMotion !== undefined) {
      walk = { x: 0, z: 0 };
      lift = 0;
      placed = to;
      changed();
      return;
    }
    const from = { walk: { ...walk }, lift, placed }, t0 = performance.now();
    let turn = to.yaw - from.placed.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / GLIDE_MS), k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      walk = { x: from.walk.x * (1 - k), z: from.walk.z * (1 - k) };
      lift = from.lift * (1 - k);
      placed = {
        at: [0, 1, 2].map((i) => from.placed.at[i]! + (to.at[i]! - from.placed.at[i]!) * k) as [number, number, number],
        yaw: from.placed.yaw + turn * k,
        unit: to.unit,
      };
      changed();
      glide = t < 1 ? requestAnimationFrame(step) : 0;
    };
    glide = requestAnimationFrame(step);
  }
  off.push(stopGlide);

  // ── годность кадра в рамке съёмки ───────────────────────────────────────────────────────────────
  const shot = document.createElement("canvas");
  shot.width = shot.height = ASSESS;
  const shotG = shot.getContext("2d", { willReadFrequently: true })!;
  const look = window.setInterval(() => {
    const cam = backdrop;
    if (!cam || !cam.video.videoWidth || hud.sheet !== "capture") return;
    const box = captureBox(innerWidth, innerHeight);
    const a = cam.toVideo(box.x, box.y), b = cam.toVideo(box.x + box.side, box.y + box.side);
    shotG.drawImage(cam.video, a.x, a.y, b.x - a.x, b.y - a.y, 0, 0, ASSESS, ASSESS);
    ui.quality(assess(greyOf(shotG, ASSESS, ASSESS)), ASSESS);
  }, 250);
  off.push(() => clearInterval(look));

  // ── прогулка с камерой: пока держишь компас ─────────────────────────────────────────────────────
  // Камера невидимо смотрит на пол, пока палец на компасе (`arStride.ts`), и двигает глаз по полу: шаги
  // ногами становятся шагами у стола. Отпустил — камера гаснет, ты там, куда пришёл.
  let lift = 0;
  const stride = (() => {
    let session: { stop(): void } | null = null;
    let want = false;
    return {
      async start(): Promise<void> {
        want = true;
        stopGlide();
        if (session) return;
        if (anchor.kind !== "gravity") { say("держусь за предмет — ходи ногами", 1600); return; }
        say("включаю камеру…");
        const tableQ = (): Quat => { const p = seated(placed, seat); return p.q ?? yawQuat(p.yaw); };
        const got = await startStride({
          stage, felt,
          turnAt: (t) => gyro.at(t) ?? q,
          plane: () => ({ at: seated(placed, seat).at, n: rotate(tableQ(), [0, 1, 0]) }),
          eye: () => [walk.x * metre, lift, walk.z * metre],
          move: ([x, y, z]) => {
            let wx = x / metre, wz = z / metre;
            const d = Math.hypot(wx, wz);
            if (d > WALK.MAX) { wx = (wx / d) * WALK.MAX; wz = (wz / d) * WALK.MAX; }
            walk = { x: wx, z: wz };
            lift = y;
            changed();
          },
          say: (text) => say(text),
        });
        if (typeof got === "string") { say(`камера: ${got}`, 2400); return; }
        if (!want) { got.stop(); return; }
        session = got;
      },
      stop(): void {
        want = false;
        session?.stop();
        session = null;
      },
    };
  })();
  off.push(() => stride.stop());

  // ── подгонка: пальцы по сукну ──────────────────────────────────────────────────────────────────
  // Пока подгонка, стол не играет: касание сукна перехватывается на окне, в захвате, раньше стола. Кнопки
  // HUD, окно якоря и «Настройки» пропускаются как есть — поверх страницы ничего не лежит. Один палец —
  // стол едет за пальцем по плоскости якоря; два — развести (размер), вместе вверх-вниз (наклон).
  const PASS = "[data-over-hud],[data-ar-bar],[data-ar-sheet],[data-ar-strip],[data-settings-layer]";
  const fingers = new Map<number, { x: number; y: number }>();
  let fitTouchedAt = 0;
  const onFitDown = (e: PointerEvent): void => {
    if (!hud.fitting || (e.target as Element | null)?.closest?.(PASS)) return;
    e.stopPropagation();
    e.preventDefault();
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    fitTouchedAt = performance.now();
  };
  const onFitMove = (e: PointerEvent): void => {
    const was = fingers.get(e.pointerId);
    if (!was) return;
    e.stopPropagation();
    if (!seenLens) return;
    const prev = new Map(fingers);
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ids = [...fingers.keys()];
    if (ids.length === 1) {
      const a = seenLens.toDesk(was), b = seenLens.toDesk({ x: e.clientX, y: e.clientY });
      const dx = b.x - a.x, dy = b.y - a.y, t = (lastTurn * Math.PI) / 180;
      const lx = Math.cos(t) * dx - Math.sin(t) * dy, ly = Math.sin(t) * dx + Math.cos(t) * dy;
      seat = { ...seat, x: seat.x + lx * lastZoom, y: seat.y - ly * lastZoom };
    } else {
      const [i, j] = ids as [number, number];
      const a0 = prev.get(i)!, b0 = prev.get(j)!, a1 = fingers.get(i)!, b1 = fingers.get(j)!;
      const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
      seat = tiltBy(clampSeat({ ...seat, zoom: seat.zoom * (d0 > 1 ? d1 / d0 : 1) }), a0, b0, a1, b1);
    }
    showHud();
    changed();
  };
  const onFitUp = (e: PointerEvent): void => {
    if (!fingers.delete(e.pointerId)) return;
    e.stopPropagation();
    fitTouchedAt = performance.now();
  };
  // Клик после касания сукна тоже не столу: иначе тап по стулу открыл бы его окно.
  const onFitClick = (e: MouseEvent): void => {
    if (!hud.fitting || (e.target as Element | null)?.closest?.(PASS) || performance.now() - fitTouchedAt > 600) return;
    e.stopPropagation();
    e.preventDefault();
  };
  addEventListener("pointerdown", onFitDown, true);
  addEventListener("pointermove", onFitMove, true);
  addEventListener("pointerup", onFitUp, true);
  addEventListener("pointercancel", onFitUp, true);
  addEventListener("click", onFitClick, true);
  off.push(() => {
    removeEventListener("pointerdown", onFitDown, true);
    removeEventListener("pointermove", onFitMove, true);
    removeEventListener("pointerup", onFitUp, true);
    removeEventListener("pointercancel", onFitUp, true);
    removeEventListener("click", onFitClick, true);
  });

  return {
    lens(frame, turn, zoom) {
      const now = performance.now();
      const shown = fusion.frame(now - lensAt);
      lensAt = now;
      const z = zoom * seat.zoom;
      const onMarker = anchor.kind !== "gravity" && fusion.S.locked;
      const unit = anchor.kind !== "gravity" && onMarker ? anchor.unit : UNIT;
      // Условный метр — радиус стола в мире при нынешнем зуме: подошёл к большому столу — прошёл больше.
      metre = (R + RIM) * unit * z;
      const stepped: [number, number, number] = [walk.x * metre, onMarker ? 0 : lift, walk.z * metre];
      const pos = onMarker
        ? ([0, 1, 2].map((i) => shown[i]! + stepped[i]!) as [number, number, number])
        : native ? ([0, 1, 2].map((i) => native!.pos[i]! + stepped[i]!) as [number, number, number]) : stepped;
      const base: ArPlace = onMarker ? { at: fusion.S.anchor.pos, yaw: 0, unit, q: tableOnMarker(fusion.S.anchor.q) } : placed;
      // Кадр камеры на экране старше датчика: сцена берёт поворот того мига, иначе стол бежит впереди фона.
      const eye = native ? native.q : backdrop ? (gyro.at(now - VIDEO_LAG) ?? q) : q;
      const l = arLens({ q: eye, fov: native ? native.fov : backdrop ? backdrop.fov(frame.h) : FOV, pos }, seated(base, seat), turn, z, frame);
      if (!backdrop && !shell) drawFloor(l);
      seenLens = l;
      lastTurn = turn;
      lastZoom = z;
      const sees = seenNow();
      if (sees !== hud.seen) { hud.seen = sees; showHud(); }
      return l;
    },
    place,
    recenter() {
      stopWalk();
      grabbing = null;
      glideHome();
    },
    stick,
    grab,
    stride(on) {
      // В приложении шаги и так знает ARKit — своя камера для прогулки не нужна.
      if (shell) return;
      if (on) void stride.start();
      else stride.stop();
    },
    dispose() {
      stopCamera();
      for (const fn of off.splice(0)) fn();
    },
  };
}
