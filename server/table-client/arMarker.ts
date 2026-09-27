// КАМЕРА И МЕТКА AR-СТОЛА — фон из камеры телефона и предмет, за который стол держится.
//
// Всё это — ПО ЖЕЛАНИЮ: AR без предмета держится за гравитацию и камеру не трогает. Человек выбрал
// «привязать к предмету» — только тогда включается камера, и только тогда грузится трекер (MindAR с
// CDN, несколько мегабайт: без предмета их не за что платить).
//
// Метка — снимок плоской вещи с рисунком (картина, доска, журнал). Её собирает MindAR прямо на
// телефоне, в сеть ничего не уходит; метки живут в IndexedDB этого устройства.
//
// Трекер отдаёт позу метки в кадре камеры; из неё здесь берутся только `t` — где середина метки (в
// ширинах метки) и `q` — как она повёрнута. Что с ними делать, решает связка (`arFuse.ts`).

import type { Quat } from "./arFuse.js";

type Vec = [number, number, number];

const MINDAR = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js";
/** Вертикальный обзор камеры телефона в портрете (длинная сторона кадра). */
export const CAM_FOV = 62;
/** На сколько кадр камеры на экране старше датчика наклона, мс. */
export const VIDEO_LAG = 60;

// ─── камера ───────────────────────────────────────────────────────────────────────────────────────
export interface Backdrop {
  video: HTMLVideoElement;
  /** Вертикальный обзор ЭКРАНА: видео вписано «cover», его верх и низ могут быть срезаны. */
  fov(screenH: number): number;
  /** Экранная точка → пиксель кадра. */
  toVideo(x: number, y: number): { x: number; y: number };
  scale(): number;
  stop(): void;
}

/** Камера под сукном. Строка вместо фона — почему не вышло, словами для человека. */
export async function openCamera(stage: HTMLElement, felt: HTMLElement): Promise<Backdrop | string> {
  if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) return "камера здесь закрыта: нужен https";
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (err) {
    const name = (err as { name?: string }).name ?? String(err);
    return name === "NotAllowedError" ? "камеру не разрешили" : `камера не включилась: ${name}`;
  }
  const video = document.createElement("video");
  video.dataset.arCamera = "";
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.style.cssText = "position:absolute;pointer-events:none;";
  video.srcObject = stream;
  stage.insertBefore(video, felt);
  // `play()` у потока камеры может не ответить вовсе (кадр ещё не пришёл) — ждём с пределом, а не вечно.
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  await Promise.race([video.play().catch(() => undefined), wait(1500)]);
  if (!video.videoWidth) await Promise.race([new Promise((r) => video.addEventListener("loadedmetadata", r, { once: true })), wait(6500)]);
  if (!video.videoWidth) {
    stream.getTracks().forEach((t) => t.stop());
    video.remove();
    return "камера включилась, но не отдаёт кадр";
  }
  let fit = { w: 0, h: 0, left: 0, top: 0, k: 1 };
  const layout = (): void => {
    const cw = stage.clientWidth, ch = stage.clientHeight, vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    // Трекер читает кадр по АТРИБУТАМ width/height, а не по videoWidth: без них он видит пустоту.
    video.width = vw;
    video.height = vh;
    const k = Math.max(cw / vw, ch / vh);
    fit = { w: vw * k, h: vh * k, left: (cw - vw * k) / 2, top: (ch - vh * k) / 2, k };
    Object.assign(video.style, { width: `${fit.w}px`, height: `${fit.h}px`, left: `${fit.left}px`, top: `${fit.top}px` });
  };
  layout();
  addEventListener("resize", layout);
  return {
    video,
    fov(screenH) {
      layout();
      const half = Math.tan((CAM_FOV / 2) * (Math.PI / 180));
      return fit.h ? (2 * Math.atan((half * screenH) / fit.h) * 180) / Math.PI : CAM_FOV;
    },
    toVideo(x, y) {
      const r = stage.getBoundingClientRect();
      return { x: (x - r.left - fit.left) / fit.k, y: (y - r.top - fit.top) / fit.k };
    },
    scale: () => fit.k,
    stop() {
      removeEventListener("resize", layout);
      stream.getTracks().forEach((t) => t.stop());
      video.remove();
    },
  };
}

// ─── трекер ───────────────────────────────────────────────────────────────────────────────────────
interface MindController {
  projectionTransform: number[][];
  addImageTargetsFromBuffer(buf: ArrayBuffer): { dimensions: [number, number][] };
  dummyRun(input: HTMLVideoElement): void;
  processVideo(input: HTMLVideoElement): void;
  stopProcessVideo(): void;
  dispose?(): void;
}
interface MindCompiler {
  compileImageTargets(images: HTMLCanvasElement[], progress: (p: number) => void): Promise<{ trackingData: { points: unknown[] }[] }[]>;
  exportData(): Uint8Array;
}
interface MindModule {
  Controller: new (o: object) => MindController;
  Compiler: new () => MindCompiler;
}
let mind: Promise<MindModule> | null = null;
/** Адрес — переменной: сборщик не должен пытаться найти CDN у себя на диске. */
const loadMind = (url = MINDAR): Promise<MindModule> => (mind ??= import(/* @vite-ignore */ url) as Promise<MindModule>);

export interface MarkerPose {
  /** Середина метки в кадре камеры, в ширинах метки (камера смотрит в −Z, верх — +Y). */
  t: Vec;
  /** Поворот метки в кадре камеры: X — вправо, Y — вверх по картинке, Z — из неё к камере. */
  q: Quat;
}

/**
 * Следить за меткой. `onPose` зовётся на каждый разобранный кадр: поза или `null` (не видно), и миг,
 * когда этот кадр был схвачен (`performance.now()`), — к нему берётся поворот телефона.
 */
export async function track(video: HTMLVideoElement, buf: ArrayBuffer, onPose: (pose: MarkerPose | null, grabbedAt: number) => void): Promise<() => void> {
  const { Controller } = await loadMind();
  let grabbedAt = performance.now();
  let live = true;
  let dims: [number, number] = [1, 1];
  const ctl = new Controller({
    inputWidth: video.videoWidth, inputHeight: video.videoHeight,
    // Сглаживает связка — в мире, а не в кадре: своё сглаживание трекера только опаздывает к руке.
    filterMinCF: 1e4, filterBeta: 0, warmupTolerance: 5, missTolerance: 5,
    onUpdate: (d: { type: string; worldMatrix?: number[] | null }) => {
      if (!live) return;
      if (d.type === "processDone") { grabbedAt = performance.now(); return; }
      if (d.type !== "updateMatrix") return;
      onPose(d.worldMatrix ? poseOf(d.worldMatrix, dims) : null, grabbedAt);
    },
  });
  // Обзор трекера зашит в 45°; до `addImageTargets…` его матрицу можно поправить на месте — трекер и
  // его воркер получают её там. Обзор тот же, что у фона: иначе поворот телефона и сдвиг фона разойдутся.
  const f = video.videoHeight / 2 / Math.tan((CAM_FOV / 2) * (Math.PI / 180));
  ctl.projectionTransform[0]![0] = f;
  ctl.projectionTransform[1]![1] = f;
  dims = ctl.addImageTargetsFromBuffer(buf).dimensions[0]!;
  ctl.dummyRun(video);
  ctl.processVideo(video);
  return () => { live = false; ctl.stopProcessVideo(); ctl.dispose?.(); };
}

/** Матрица трекера (по столбцам, пиксели снимка метки) → поза в ширинах метки. */
export function poseOf(m: number[], [w, h]: [number, number]): MarkerPose {
  const col = (i: number): Vec => [m[i * 4]!, m[i * 4 + 1]!, m[i * 4 + 2]!];
  const len = (v: Vec): number => Math.hypot(v[0], v[1], v[2]);
  const sx = len(col(0)) || 1;
  const cx = w / 2, cy = h / 2;
  const t: Vec = [0, 1, 2].map((r) => (m[r]! * cx + m[4 + r]! * cy + m[12 + r]!) / (w * sx)) as Vec;
  const [x, y, z] = [col(0), col(1), col(2)].map((c) => c.map((v) => v / (len(c) || 1)) as Vec) as [Vec, Vec, Vec];
  return { t, q: quatOf(x, y, z) };
}

/** Кватернион из столбцов матрицы поворота. */
export function quatOf(x: Vec, y: Vec, z: Vec): Quat {
  const [m00, m10, m20] = x, [m01, m11, m21] = y, [m02, m12, m22] = z;
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

// ─── съёмка ───────────────────────────────────────────────────────────────────────────────────────
export interface StoredMarker {
  id: string;
  name: string;
  created: number;
  thumb: string;
  buf: ArrayBuffer;
  points: number;
}

/** Снять метку из квадрата кадра (`rect` — в пикселях видео) и собрать её на телефоне. */
export async function makeMarker(video: HTMLVideoElement, rect: { x: number; y: number; w: number; h: number }, count: number, progress: (p: number) => void): Promise<StoredMarker> {
  const side = Math.min(480, Math.round(rect.w));
  const shot = document.createElement("canvas");
  shot.width = shot.height = side;
  shot.getContext("2d")!.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, side, side);
  const thumb = document.createElement("canvas");
  thumb.width = thumb.height = 96;
  thumb.getContext("2d")!.drawImage(shot, 0, 0, 96, 96);
  const { Compiler } = await loadMind();
  const compiler = new Compiler();
  const data = await compiler.compileImageTargets([shot], progress);
  const bytes = compiler.exportData();
  return {
    id: Date.now().toString(36),
    name: `предмет ${count + 1}`,
    created: Date.now(),
    thumb: thumb.toDataURL("image/jpeg", 0.8),
    buf: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    points: data[0]!.trackingData.reduce((s, l) => s + l.points.length, 0),
  };
}

// ─── память меток ─────────────────────────────────────────────────────────────────────────────────
const DB = "crossade-ar", STORE = "markers";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => { resolve(req.result); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function listMarkers(): Promise<StoredMarker[]> {
  try {
    return ((await run("readonly", (s) => s.getAll())) as StoredMarker[]).sort((a, b) => b.created - a.created);
  } catch {
    return [];
  }
}
export const saveMarker = (m: StoredMarker): Promise<unknown> => run("readwrite", (s) => s.put(m));
export const deleteMarker = (id: string): Promise<unknown> => run("readwrite", (s) => s.delete(id));
