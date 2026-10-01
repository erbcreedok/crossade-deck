// AR В ПЕСОЧНИЦЕ — стол стоит перед тобой, а телефон — камера, которая на него смотрит.
//
// Якорь один — ГРАВИТАЦИЯ, как у обычного клиента (`server/table-client/ar.ts`): стол встаёт туда, куда смотрел телефон в миг
// входа (на `DROP` метров ниже глаз, на `AHEAD` впереди, а если смотрел вниз — под взгляд), и больше не двигается. Поворот телефона
// крутит камеру сцены; камера телефона — фоном под сукном. Ходить ногами здесь нельзя: глаз стоит на месте, меняется только взгляд.
//
// Математика — та же, что у обычного клиента (`arLens.ts`: кватернион датчика, место по взгляду). Здесь она лишь переведена
// в оси сцены: стол — в нуле, МОЙ СТУЛ — по ту сторону стола, где стоит человек (глаз — на линии «середина стола → мой стул»).

import * as THREE from "three";
import { deviceQuat, placeAtGaze, type ArPlace, type Quat } from "../../server/table-client/arLens.js";
import { openCamera, type Backdrop } from "../../server/table-client/arMarker.js";

/** Стол ниже глаз на столько метров, а если смотреть в горизонт — на столько впереди. */
export const DROP = 0.35;
export const AHEAD = 0.45;
/** Метров в ширине карты: стол радиусом в семь карт — около трети метра. */
export const UNIT = 0.022;
/** Вертикальный обзор экрана, пока камера не сказала свой. */
const FOV = 62;
/** Сколько ждать датчик после входа, мс: молчит — значит, его здесь нет (компьютер). */
export const SILENT_MS = 1500;

interface TelegramOrientation {
  alpha?: number | null;
  beta?: number | null;
  gamma?: number | null;
  start?(o: { refresh_rate: number; need_absolute: boolean }): void;
  stop?(): void;
}
interface TelegramApp {
  DeviceOrientation?: TelegramOrientation;
  onEvent?(name: string, fn: () => void): void;
  offEvent?(name: string, fn: () => void): void;
}

export interface ArPose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  fov: number;
}

export interface Ar {
  on(): boolean;
  /** Включить: из жеста пальца (iOS даёт датчик только так). Строка — что не вышло; стол при этом всё равно встаёт, чем может. */
  start(stage: HTMLElement, canvas: HTMLElement): Promise<string | null>;
  stop(): void;
  /** Поставить стол заново — туда, куда смотрит телефон сейчас. */
  recenter(): void;
  /** Где камера в осях сцены. `null` — датчик ещё не сказал ни слова. `chair` — угол моего стула, градусы. */
  pose(chair: number, stageH: number): ArPose | null;
  /** Чем кончилось включение: датчик есть / камера есть. */
  has(): { sensor: boolean; camera: boolean };
}

const screenAngle = (): number => screen.orientation?.angle ?? (globalThis as { orientation?: number }).orientation ?? 0;

export function createAr(changed: () => void): Ar {
  let on = false;
  let q: Quat | null = null;
  let place: ArPlace | null = null;
  let backdrop: Backdrop | null = null;
  let off: Array<() => void> = [];

  const hear = (alpha: number, beta: number, gamma: number): void => {
    q = deviceQuat(alpha, beta, gamma, screenAngle());
    if (!place) place = placeAtGaze(q, DROP, AHEAD, UNIT);
    changed();
  };

  async function start(stage: HTMLElement, canvas: HTMLElement): Promise<string | null> {
    if (on) return null;
    on = true;
    q = null;
    place = null;
    let note: string | null = null;
    // Разрешение на iOS — первым делом и без пауз до него: жест пальца живёт недолго.
    const perm = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent?.requestPermission;
    if (perm) {
      const answer = await perm().catch(() => "denied");
      if (answer !== "granted") note = "наклон не разрешили — стол стоит на месте";
    }
    const tg = (globalThis as { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;
    const tgo = tg?.DeviceOrientation;
    if (tgo?.start && tg?.onEvent) {
      const deg = 180 / Math.PI;
      const read = (): void => { if (tgo.beta != null) hear((tgo.alpha ?? 0) * deg, tgo.beta * deg, (tgo.gamma ?? 0) * deg); };
      tg.onEvent("deviceOrientationChanged", read);
      tgo.start({ refresh_rate: 20, need_absolute: false });
      off.push(() => { tg.offEvent?.("deviceOrientationChanged", read); tgo.stop?.(); });
    }
    const onBrowser = (e: DeviceOrientationEvent): void => { if (e.beta != null) hear(e.alpha ?? 0, e.beta, e.gamma ?? 0); };
    addEventListener("deviceorientation", onBrowser);
    off.push(() => removeEventListener("deviceorientation", onBrowser));
    const cam = await openCamera(stage, canvas);
    if (typeof cam === "string") note = note ?? cam;
    else backdrop = cam;
    if (!on) backdrop?.stop();
    return note;
  }

  function stop(): void {
    on = false;
    for (const fn of off) fn();
    off = [];
    backdrop?.stop();
    backdrop = null;
    q = null;
    place = null;
  }

  function recenter(): void {
    if (q) place = placeAtGaze(q, DROP, AHEAD, UNIT);
    changed();
  }

  const tmp = { yaw: new THREE.Quaternion(), dev: new THREE.Quaternion(), pos: new THREE.Vector3() };
  function pose(chair: number, stageH: number): ArPose | null {
    if (!on || !q || !place) return null;
    // Поворот мира телефона в оси стола: «от меня» (куда смотрел телефон) → «к середине стола от моего стула».
    const theta = Math.PI - chair * (Math.PI / 180) - place.yaw;
    tmp.yaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), theta);
    tmp.dev.set(q[0], q[1], q[2], q[3]);
    const quat = tmp.yaw.clone().multiply(tmp.dev);
    // Глаз — в нуле мира телефона, середина стола — в `place.at`: в осях стола это минус `at`, повёрнутый, в единицах стола.
    const pos = tmp.pos.set(-place.at[0], -place.at[1], -place.at[2]).applyQuaternion(tmp.yaw).divideScalar(place.unit).clone();
    return { pos, quat, fov: backdrop ? backdrop.fov(stageH) : FOV };
  }

  return { on: () => on, start, stop, recenter, pose, has: () => ({ sensor: q !== null, camera: backdrop !== null }) };
}
