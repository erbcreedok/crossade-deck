// AR-СТОЛ — стенд: навёл камеру на предмет → он стал меткой → на нём лежит стол, и в него можно тапать.
//
// Три режима, одна сцена (договор в pose.js: единица — ширина метки, стол в плоскости XY якоря):
//   ФОТО — метка из снимка: MindAR компилирует её прямо в браузере и трекает;
//   КОД  — запасная: квадратный код ArUco (js-aruco2) на экране второго телефона или на бумаге;
//   ГИРО — без метки вообще: стол висит в пространстве и держится только за гироскоп.
// В ФОТО и КОД по умолчанию включена СВЯЗКА (fuse.js): поворот — гироскоп, метка — только где стоит
// телефон. Ручка «связка» = 0 возвращает сырой трекер, чтобы сравнить.
//
// Стол = якорь + посадка (seat.js). Якорь — гравитация (ГИРО) или метка: в её плоскости (картина на
// стене — стол на стене) или плашмя. Посадку — сдвиг, курс, наклон, масштаб — человек подгоняет сам
// в режиме «подогнать»; она своя у каждого якоря и живёт на устройстве.
// Стол — обычный 2D-canvas (table.js), натянутый текстурой; тап идёт лучом обратно в его пиксели.
// Рука — поверх экрана, как в продукте: AR её не касается.
//
// ГИРО — режим по умолчанию: ему не нужна камера, только датчик наклона. Камера включается, когда
// режим её требует (ФОТО, КОД), или по кнопке «фон: камера» в ГИРО. Без неё за столом — пол-сетка,
// чтобы поворот телефона читался как поворот головы, а не как дрожь картинки.

import * as THREE from "three";
import { assess, greyOf, DEFAULTS as QD } from "./quality.js";
import { centred, coverFit, deviceQuaternion, focalPx, positMatrix, screenFov } from "./pose.js";
import { createTable, drawTable, name, RANK_OF, SUIT_OF, tapTable, TH, throwToPile, TW } from "./table.js";
import { deleteMarker, listMarkers, saveMarker } from "./store.js";
import { createFusion, FUSE, gyroTrack } from "./fuse.js";
import { applyTwo, planeHit, readSeat, SEAT0, seatLocal, twoFinger, writeSeat } from "./seat.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage"), cam = $("cam"), sheet = $("sheet"), statusEl = $("status"), frameEl = $("frame"), dots = $("dots");

// ─── ручки ────────────────────────────────────────────────────────────────────────────────────────
const KNOBS = [
  ["Стол", [
    ["tableScale", "ширина стола", "в ширинах метки", 1.8, 0.5, 10, 0.1],
  ]],
  ["Годность кадра", [
    ["corner", "порог угла", "выше — меньше точек", QD.corner, 0.001, 0.2, 0.001],
    ["enough", "углов — «полно»", "", QD.enough, 10, 600, 10],
    ["okScore", "годится от", "счёт = полнота × покрытие, 0..1", QD.okScore, 0, 1, 0.05],
    ["sharp", "резкость от", "ниже — «смазано»", QD.sharp, 0, 5, 0.05],
    ["glare", "блик до", "доля пересвета", QD.glare, 0, 1, 0.01],
  ]],
  ["Фото-метка (MindAR)", [
    ["captureSize", "сторона снимка, px", "больше — точнее и дольше компиляция", 480, 200, 1024, 20],
    ["filterMinCF", "сглаживание: minCF", "меньше — меньше дрожи, больше отставания", 0.001, 0.00001, 1, 0.0001],
    ["filterBeta", "сглаживание: beta", "больше — быстрее догоняет движение", 1000, 0, 100000, 100],
    ["warmup", "кадров до показа", "", 5, 1, 30, 1],
    ["miss", "кадров до пропажи", "", 5, 1, 60, 1],
  ]],
  ["Код (ArUco)", [
    ["arucoId", "номер кода", "0..249", 0, 0, 249, 1],
    ["arucoWidth", "кадр детектора, px", "больше — дальше видит, медленнее", 480, 240, 1280, 40],
    ["arucoSmooth", "сглаживание", "0 — сырое, 0.9 — вязкое", 0.5, 0, 0.95, 0.05],
    ["arucoHold", "кадров до пропажи", "", 8, 0, 60, 1],
  ]],
  ["Связка: гиро + метка", [
    ["fuse", "связка", "1 — поворот от гиро, метка только двигает; 0 — сырой трекер", 1, 0, 1, 1],
    ["gyroFov", "обзор камеры телефона, °", "вертикальный, портрет. Врёт — стол при повороте плывёт по фону", 62, 30, 100, 1],
    ["videoLag", "опоздание видео, мс", "на сколько кадр камеры старше гироскопа", 60, 0, 300, 5],
    ["gate", "скачок до, ширин метки", "дальше — выброс", FUSE.gate, 0.1, 10, 0.1],
    ["jumpFrames", "кадров подряд для скачка", "", FUSE.jumpFrames, 1, 30, 1],
    ["maxTurn", "поворот метки до, °", "резче — выброс, пока кадры не подтвердят", FUSE.maxTurn, 5, 180, 1],
    ["settle", "кадров на усреднение", "столько первых кадров поворот якоря берётся целиком", FUSE.settle, 1, 120, 1],
    ["turnGain", "подтяжка курса", "после усреднения — только курс; 0 — не поправлять уход гироскопа", FUSE.turnGain, 0, 1, 0.01],
    ["minCutoff", "гладкость стоя, Гц", "меньше — меньше дрожи", FUSE.minCutoff, 0.01, 10, 0.01],
    ["beta", "догон при ходьбе", "больше — меньше отставания", FUSE.beta, 0, 10, 0.05],
    ["glideMs", "доводка, мс", "между кадрами трекера", FUSE.glideMs, 0, 1000, 10],
  ]],
  ["Подгонка", [
    ["tiltPerPx", "наклон двумя пальцами, ° на px", "", 0.3, 0.05, 2, 0.05],
  ]],
  ["Гироскоп", [
    ["gyroUnit", "ширина метки, м", "масштаб стола в пространстве", 0.2, 0.05, 1, 0.01],
    ["gyroDist", "вперёд, м", "если телефон смотрит в горизонт", 0.45, 0.1, 3, 0.05],
    ["gyroDrop", "вниз, м", "", 0.35, 0, 2, 0.05],
  ]],
];
const KEY = "ar-stand-knobs";
const K = Object.fromEntries(KNOBS.flatMap(([, list]) => list.map(([k, , , d]) => [k, d])));
try { Object.assign(K, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* без памяти */ }
const qOpts = () => ({ corner: K.corner, enough: K.enough, okScore: K.okScore, sharp: K.sharp, glare: K.glare });

// ─── состояние ────────────────────────────────────────────────────────────────────────────────────
const S = {
  screen: "start", mode: "gyro", gyroCam: false, gyroPlaced: false, markers: [], active: null,
  controller: null, detector: null, orient: null, fit: null, q: null, table: createTable(), hand: [],
  seat: { ...SEAT0 }, seatKey: null, fitting: false,
  dirty: true, seen: -1e9, frame: 0, fps: 0, fpsCount: 0, fpsAt: performance.now(), log: [],
};
S.K = K;
const gyro = gyroTrack();
const fusion = createFusion(() => ({ ...K, flat: S.seat.flat }));
S.fusion = fusion.S;
window.__ar = S; // для прогона Playwright
/** Связка работает, когда она включена, есть гироскоп и режим с меткой. */
const fused = () => K.fuse >= 0.5 && !!S.orient && S.mode !== "gyro";

// ─── сцена ────────────────────────────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: $("gl"), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
const anchor = new THREE.Group();
anchor.matrixAutoUpdate = false; anchor.visible = false;
scene.add(anchor);
const tableCanvas = document.createElement("canvas");
tableCanvas.width = TW; tableCanvas.height = TH;
const tg = tableCanvas.getContext("2d");
const texture = new THREE.CanvasTexture(tableCanvas);
texture.colorSpace = THREE.SRGBColorSpace;
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, TH / TW), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
anchor.add(mesh);
const HH = TH / TW / 2;
const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-0.5, HH], [0.5, HH], [0.5, -HH], [-0.5, -HH]].map(([x, y]) => new THREE.Vector3(x, y, 0.001))), new THREE.LineBasicMaterial({ color: 0xf2c14e }));
border.visible = false;
mesh.add(border);
/** Якорь в мире — без посадки. Стол = якорь · посадка. */
const base = new THREE.Matrix4();
const seatM = new THREE.Matrix4();
function setAnchor() { anchor.matrix.multiplyMatrices(base, seatM.fromArray(seatLocal(S.seat))); }
/** Чья посадка сейчас: у ГИРО своя, у каждой метки и каждого кода — своя. */
function loadSeat(key) { S.seatKey = key; S.seat = readSeat(localStorage, key); }
S.three = { anchor, camera, mesh };
const applyScale = () => mesh.scale.setScalar(K.tableScale);
const floor = new THREE.GridHelper(6, 30, 0x6b4d2c, 0x2a3a31);
floor.visible = false;
scene.add(floor);
applyScale();

// ─── раскладка ────────────────────────────────────────────────────────────────────────────────────
function layout() {
  const cw = stage.clientWidth, ch = stage.clientHeight;
  renderer.setSize(cw, ch, false);
  camera.aspect = cw / ch;
  if (cam.videoWidth) {
    // MindAR читает кадр по АТРИБУТАМ width/height видео, не по videoWidth: без них он видит пустоту.
    // На экране размер задаёт стиль ниже, атрибуты ему не мешают.
    cam.width = cam.videoWidth; cam.height = cam.videoHeight;
    S.fit = coverFit(cam.videoWidth, cam.videoHeight, cw, ch);
    Object.assign(cam.style, { width: `${S.fit.w}px`, height: `${S.fit.h}px`, left: `${S.fit.left}px`, top: `${S.fit.top}px` });
  }
  // Видео на экране — «cover»: его вертикаль срезана под экран. Трекер и сцена берут один обзор:
  // в связке — настоящий, иначе поворот от гироскопа и сдвиг фона разойдутся.
  const shown = S.fit && cam.srcObject && cam.style.visibility !== "hidden";
  const input = S.mode === "gyro" || fused() ? K.gyroFov : undefined;
  camera.fov = shown ? screenFov(cam.videoHeight, S.fit, ch, input) : S.mode === "gyro" ? K.gyroFov : 45;
  camera.updateProjectionMatrix();
  const side = Math.round(Math.min(cw, ch) * 0.78);
  Object.assign(frameEl.style, { width: `${side}px`, height: `${side}px`, left: `${(cw - side) / 2}px`, top: `${Math.max(90, ch * 0.4 - side / 2)}px` });
  dots.width = side * 2; dots.height = side * 2;
  placeHand();
}
addEventListener("resize", layout);

/** Рамка съёмки в пикселях видео. */
function frameInVideo() {
  const f = S.fit, r = frameEl.getBoundingClientRect(), s = stage.getBoundingClientRect();
  return { x: (r.left - s.left - f.left) / f.scale, y: (r.top - s.top - f.top) / f.scale, w: r.width / f.scale, h: r.height / f.scale };
}

// ─── камера и датчики ─────────────────────────────────────────────────────────────────────────────
/** Датчик наклона. На iOS разрешение спрашивается только из жеста — поэтому зовётся из кнопки «Начать». */
let sensorsOn = false;
async function startSensors() {
  if (sensorsOn) return;
  sensorsOn = true;
  const ask = globalThis.DeviceOrientationEvent?.requestPermission;
  if (ask) await ask.call(DeviceOrientationEvent).catch(() => {});
  addEventListener("deviceorientation", (e) => {
    if (e.beta == null) return;
    S.orient = { alpha: e.alpha ?? 0, beta: e.beta, gamma: e.gamma ?? 0 };
    gyro.push(performance.now(), orientQ());
  });
}

async function startCamera() {
  if (cam.srcObject) return true;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    status(`камера закрыта: нужен https (${location.hostname}:9583)`, "bad");
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
    cam.srcObject = stream;
    await cam.play();
    if (!cam.videoWidth) await new Promise((r) => cam.addEventListener("loadedmetadata", r, { once: true }));
    layout();
    return true;
  } catch (err) {
    status(`камера: ${err.name || err}`, "bad");
    return false;
  }
}

/** Камера гасится целиком, а не прячется: ГИРО без фона не должен держать её включённой. */
function stopCamera() {
  cam.srcObject?.getTracks().forEach((t) => t.stop());
  cam.srcObject = null;
}

// ─── режимы ───────────────────────────────────────────────────────────────────────────────────────
function stopTrackers() {
  S.controller?.stopProcessVideo();
  S.controller?.dispose?.();
  S.controller = null;
  anchor.visible = false;
  fusion.reset();
  camera.position.set(0, 0, 0);
  camera.quaternion.identity();
}

async function setMode(mode) {
  S.mode = mode;
  document.querySelectorAll("#top .chip").forEach((c) => c.classList.toggle("on", c.dataset.mode === mode));
  if (S.screen === "start") return render();
  stopTrackers();
  S.fitting = false;
  if (mode === "gyro") loadSeat("gyro");
  if (mode === "code") loadSeat(`code:${K.arucoId}`);
  const needsCamera = mode !== "gyro" || S.gyroCam;
  if (needsCamera && !(await startCamera())) return;
  if (!needsCamera) stopCamera();
  cam.style.visibility = needsCamera ? "visible" : "hidden";
  floor.visible = !needsCamera;
  layout();
  if (mode === "image") {
    const m = S.markers.find((x) => x.id === S.active);
    if (m) return startImage(m);
    return go(S.markers.length ? "library" : "capture");
  }
  if (mode === "code") return startCode();
  return startGyro();
}

async function startImage(marker) {
  loadSeat(`img:${marker.id}`);
  go("play");
  status("гружу трекер…");
  const { Controller } = await import("mind-ar");
  if (S.mode !== "image") return;
  const fuse = fused();
  setNearFar(fuse ? 0.05 : 10, fuse ? 200 : 1e5);
  // Кадр трекера схвачен сразу после конца прошлого разбора — в этот миг и берётся поворот к нему.
  let grabbedAt = performance.now();
  const ctl = new Controller({
    inputWidth: cam.videoWidth, inputHeight: cam.videoHeight,
    // В связке сглаживает мир, а не кадр: своё сглаживание MindAR только опаздывает к повороту руки.
    filterMinCF: fuse ? 1e4 : K.filterMinCF, filterBeta: fuse ? 0 : K.filterBeta, warmupTolerance: K.warmup, missTolerance: K.miss,
    onUpdate: (d) => {
      if (S.controller !== ctl) return;
      if (d.type === "processDone") { grabbedAt = performance.now(); tick(); return; }
      if (d.type !== "updateMatrix") return;
      if (fuse) {
        if (d.worldMatrix) feed(new THREE.Matrix4().fromArray(d.worldMatrix).multiply(post), grabbedAt);
        return;
      }
      if (!d.worldMatrix) { anchor.visible = false; status("ищу метку…"); return; }
      base.fromArray(d.worldMatrix).multiply(post);
      setAnchor();
      anchor.visible = true;
      status(`держу · ${S.fps} к/с`, "ok");
    },
  });
  // Обзор MindAR зашит в 45°; до `addImageTargets…` его матрицу ещё можно поправить на месте —
  // трекер и воркер получают её там.
  if (fuse) {
    const f = focalPx(cam.videoHeight, K.gyroFov);
    ctl.projectionTransform[0][0] = f; ctl.projectionTransform[1][1] = f;
  }
  const { dimensions } = ctl.addImageTargetsFromBuffer(marker.buf);
  const [w, h] = dimensions[0];
  const post = new THREE.Matrix4().compose(new THREE.Vector3(w / 2, h / 2, 0), new THREE.Quaternion(), new THREE.Vector3(w, w, w));
  S.controller = ctl;
  ctl.dummyRun(cam);
  ctl.processVideo(cam);
  status("ищу метку…");
}

async function startCode() {
  go("play");
  setNearFar(0.01, 100);
  if (!window.AR) {
    status("гружу детектор…");
    for (const f of ["cv.js", "aruco.js", "svd.js", "posit1.js"]) await script(`https://cdn.jsdelivr.net/npm/js-aruco2@2.0.0/src/${f}`);
  }
  S.detector ??= new AR.Detector({ dictionaryName: "ARUCO_MIP_36h12" });
  status(`ищу код №${K.arucoId}…`);
}

function startGyro() {
  go("play");
  setNearFar(0.01, 100);
  aimCamera();
  placeGyro();
  S.gyroPlaced = !!S.orient; // датчик может заговорить позже — тогда стол переставится в цикле
  gyroStatus();
}

function setNearFar(near, far) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }

const gyroStatus = () => status(S.orient ? "гироскоп" : "нет гироскопа", S.orient ? "ok" : "bad");

const script = (src) => new Promise((resolve, reject) => {
  const el = document.createElement("script");
  el.src = src; el.onload = resolve; el.onerror = () => reject(new Error(src));
  document.head.append(el);
});

// ─── ArUco ────────────────────────────────────────────────────────────────────────────────────────
const detCanvas = document.createElement("canvas");
const dg = detCanvas.getContext("2d", { willReadFrequently: true });
const smoothed = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1), has: false };

function detectCode() {
  if (!S.detector || !cam.videoWidth) return;
  const dw = Math.round(K.arucoWidth), dh = Math.round((dw * cam.videoHeight) / cam.videoWidth);
  if (detCanvas.width !== dw || detCanvas.height !== dh) { detCanvas.width = dw; detCanvas.height = dh; }
  dg.drawImage(cam, 0, 0, dw, dh);
  const found = S.detector.detect(dg.getImageData(0, 0, dw, dh));
  tick();
  const m = found.find((x) => x.id === K.arucoId);
  if (fused()) {
    if (!m) return;
    const pose = new POS.Posit(1, focalPx(dh, K.gyroFov)).pose(centred(m.corners, dw, dh));
    feed(new THREE.Matrix4().fromArray(positMatrix(pose.bestRotation, pose.bestTranslation)), performance.now());
    return;
  }
  if (!m) {
    if (S.frame - S.seen > K.arucoHold) { anchor.visible = false; smoothed.has = false; status(found.length ? `вижу код №${found[0].id}, жду №${K.arucoId}` : `ищу код №${K.arucoId}…`); }
    return;
  }
  S.seen = S.frame;
  const pose = new POS.Posit(1, focalPx(dh)).pose(centred(m.corners, dw, dh));
  const e = new THREE.Matrix4().fromArray(positMatrix(pose.bestRotation, pose.bestTranslation));
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  e.decompose(p, q, s);
  const k = smoothed.has ? 1 - K.arucoSmooth : 1;
  smoothed.p.lerp(p, k); smoothed.q.slerp(q, k); smoothed.s.lerp(s, k); smoothed.has = true;
  base.compose(smoothed.p, smoothed.q, smoothed.s);
  setAnchor();
  anchor.visible = true;
  status(`держу код · ${S.fps} к/с`, "ok");
}

// ─── гироскоп ─────────────────────────────────────────────────────────────────────────────────────
const orientQ = () => {
  const o = S.orient, angle = screen.orientation?.angle ?? window.orientation ?? 0;
  return deviceQuaternion(o.alpha, o.beta, o.gamma, angle);
};

/**
 * Поворот камеры. Когда за столом видео, кадр на экране старше датчика на `videoLag` — сцена берёт
 * поворот того мига, иначе при повороте руки стол бежит впереди фона.
 */
function aimCamera() {
  if (S.orient) {
    const late = cam.srcObject && cam.style.visibility !== "hidden" ? K.videoLag : 0;
    camera.quaternion.fromArray((late && gyro.at(performance.now() - late)) || orientQ());
  } else {
    camera.quaternion.setFromEuler(new THREE.Euler(-0.6, 0, 0));
  }
}

/**
 * Стол лёжа, ниже глаз на `gyroDrop` — там, куда упирается взгляд: «поставить сюда» значит сюда.
 * Если телефон смотрит почти горизонтально (взгляд до стола не дотянется), стол встаёт на `gyroDist`.
 */
function placeGyro() {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const yaw = Math.atan2(-f.x, -f.z);
  const ahead = f.y < -0.1 ? Math.min(3, Math.max(0.15, (K.gyroDrop / -f.y) * Math.hypot(f.x, f.z))) : K.gyroDist;
  const pos = new THREE.Vector3(0, -K.gyroDrop, -ahead).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, yaw, 0, "YXZ"));
  base.compose(pos, q, new THREE.Vector3().setScalar(K.gyroUnit));
  setAnchor();
  anchor.visible = true;
  floor.position.set(0, -K.gyroDrop - 0.005, 0);
}

// ─── связка ───────────────────────────────────────────────────────────────────────────────────────
const vp = new THREE.Vector3(), vq = new THREE.Quaternion(), vs = new THREE.Vector3();

/** Кадр трекера → измерение связки. `m` — метка в кадре камеры; `at` — миг, когда кадр снят. */
function feed(m, at) {
  const q = gyro.at(at - K.videoLag);
  if (!q) return;
  m.decompose(vp, vq, vs);
  const said = fusion.measure(q, vp.toArray().map((v) => v / vs.x), vq.toArray(), performance.now());
  if (said === "lock") toast("стол поставлен на метку");
}

let lastFrameAt = performance.now();
/** Каждый кадр экрана: стол стоит в мире, камера — гироскоп + где её видела метка. */
function placeFused(now) {
  const shown = fusion.frame(now - lastFrameAt);
  if (!fusion.S.locked) { anchor.visible = false; status(S.mode === "code" ? `ищу код №${K.arucoId}…` : "ищу метку…"); return; }
  const { pos, q } = fusion.S.anchor;
  base.compose(vp.fromArray(pos), vq.fromArray(q), vs.set(1, 1, 1));
  setAnchor();
  anchor.visible = true;
  camera.position.fromArray(shown);
  const sees = now - fusion.S.seenAt < 400;
  status(sees ? `держу · метка · ${S.fps} к/с` : "держу гиро · метку не вижу", sees ? "ok" : "");
}

// ─── съёмка метки ─────────────────────────────────────────────────────────────────────────────────
const qc = document.createElement("canvas");
qc.width = qc.height = 160;
const qg = qc.getContext("2d", { willReadFrequently: true });
const VERDICT = {
  ok: ["годится — жми «сделать меткой»", "var(--ok)"],
  few: ["мало рисунка — нужен узор по всей рамке", "var(--bad)"],
  blur: ["смазано — замри или добавь света", "var(--warn)"],
  glare: ["блик — наклони, убери отражение", "var(--warn)"],
};

function assessFrame() {
  if (S.screen !== "capture" || !S.fit) return;
  const r = frameInVideo();
  qg.drawImage(cam, r.x, r.y, r.w, r.h, 0, 0, 160, 160);
  const q = assess(greyOf(qg, 160, 160), qOpts());
  S.q = q;
  const g = dots.getContext("2d"), k = dots.width / 160;
  g.clearRect(0, 0, dots.width, dots.height);
  g.fillStyle = q.verdict === "ok" ? "#7fd1b9" : "#f2c14e";
  for (const p of q.points) { g.beginPath(); g.arc(p.x * k, p.y * k, 5, 0, Math.PI * 2); g.fill(); }
  frameEl.classList.toggle("ok", q.verdict === "ok");
  const [text, colour] = VERDICT[q.verdict];
  const bar = sheet.querySelector(".meter i"), v = sheet.querySelector(".verdict"), n = sheet.querySelector(".nums");
  if (bar) { bar.style.width = `${Math.round(q.score * 100)}%`; bar.style.background = colour; }
  if (v) { v.textContent = text; v.style.color = colour; }
  const tilt = S.orient ? Math.round((Math.acos(Math.cos((S.orient.beta * Math.PI) / 180) * Math.cos((S.orient.gamma * Math.PI) / 180)) * 180) / Math.PI) : null;
  if (n) n.innerHTML = `углов <b>${q.count}</b> · покрытие <b>${Math.round(q.coverage * 100)}%</b> · резкость <b>${q.sharp.toFixed(2)}</b> · блик <b>${Math.round(q.glare * 100)}%</b>`
    + (tilt == null ? "" : ` · наклон <b>${tilt}°</b>${tilt > 20 ? " <span style='color:var(--warn)'>— держи параллельно</span>" : ""}`);
}
setInterval(assessFrame, 200);

async function capture() {
  const r = frameInVideo();
  const side = Math.min(Math.round(K.captureSize), Math.round(r.w));
  const shot = document.createElement("canvas");
  shot.width = shot.height = side;
  shot.getContext("2d").drawImage(cam, r.x, r.y, r.w, r.h, 0, 0, side, side);
  const q = S.q;
  const thumb = document.createElement("canvas");
  thumb.width = thumb.height = 112;
  thumb.getContext("2d").drawImage(shot, 0, 0, 112, 112);

  go("compile");
  const t0 = performance.now();
  const { Compiler } = await import("mind-ar");
  const compiler = new Compiler();
  const bar = () => sheet.querySelector(".meter i"), txt = () => sheet.querySelector(".nums");
  const data = await compiler.compileImageTargets([shot], (p) => {
    if (bar()) bar().style.width = `${Math.round(p)}%`;
    if (txt()) txt().innerHTML = `<b>${Math.round(p)}%</b> · ${((performance.now() - t0) / 1000).toFixed(1)} с`;
  });
  const bytes = compiler.exportData();
  const marker = {
    id: Date.now().toString(36),
    name: `метка ${S.markers.length + 1}`,
    created: Date.now(),
    thumb: thumb.toDataURL("image/jpeg", 0.8),
    buf: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    stats: {
      tracking: data[0].trackingData.reduce((s, l) => s + l.points.length, 0),
      matching: data[0].matchingData.reduce((s, l) => s + l.maximaPoints.length + l.minimaPoints.length, 0),
      seconds: +((performance.now() - t0) / 1000).toFixed(1),
      kb: Math.round(bytes.byteLength / 1024),
      verdict: q?.verdict ?? "?", score: q ? +q.score.toFixed(2) : null, side,
    },
  };
  await saveMarker(marker);
  S.markers = await listMarkers();
  S.active = marker.id;
  toast(`готово за ${marker.stats.seconds} с · точек ${marker.stats.tracking}`);
  if (S.mode === "image") startImage(marker);
}

// ─── стол и рука ──────────────────────────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
let down = null;
stage.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
stage.addEventListener("pointerup", (e) => {
  if (!down || S.screen !== "play" || S.fitting) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
  down = null;
  if (moved > 12 || dt > 600 || !anchor.visible) return;
  const r = stage.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = raycaster.intersectObject(mesh, false)[0]; // рамка подгонки — линия: луч её не ищет
  if (!hit) return;
  const p = { x: hit.uv.x * TW, y: (1 - hit.uv.y) * TH };
  const said = tapTable(S.table, p);
  S.dirty = true;
  S.log.push({ p, said });
  toast(said ?? `мимо · ${Math.round(p.x)}, ${Math.round(p.y)}`);
});

// ─── подгонка ─────────────────────────────────────────────────────────────────────────────────────
// Один палец — стол едет за пальцем по плоскости якоря. Два — крутить (курс), развести (размер),
// вместе вверх-вниз (наклон). Пока идёт подгонка, тапы по столу не играют.
const fingers = new Map();
const ndc = (p) => { const r = stage.getBoundingClientRect(); return new THREE.Vector2(((p.x - r.left) / r.width) * 2 - 1, -((p.y - r.top) / r.height) * 2 + 1); };
/** Точка экрана → точка в плоскости якоря, в его единицах. */
function onBase(p) {
  camera.updateMatrixWorld();
  raycaster.setFromCamera(ndc(p), camera);
  const inv = base.clone().invert().elements;
  return planeHit(inv, raycaster.ray.origin.toArray(), raycaster.ray.direction.toArray());
}
/** Якорь смотрит на камеру лицом? От этого зависит, в какую сторону крутить. */
function facing() {
  const n = new THREE.Vector3().setFromMatrixColumn(base, 2);
  const at = new THREE.Vector3().setFromMatrixPosition(base);
  return n.dot(camera.position.clone().sub(at)) > 0;
}
stage.addEventListener("pointerdown", (e) => { if (S.fitting) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
stage.addEventListener("pointermove", (e) => {
  if (!S.fitting || !fingers.has(e.pointerId)) return;
  const was = new Map(fingers);
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const ids = [...fingers.keys()];
  if (ids.length === 1) {
    const a = onBase(was.get(ids[0])), b = onBase(fingers.get(ids[0]));
    if (!a || !b) return;
    S.seat = { ...S.seat, x: S.seat.x + b[0] - a[0], y: S.seat.y + b[1] - a[1] };
  } else {
    const [i, j] = ids;
    S.seat = applyTwo(S.seat, twoFinger(was.get(i), was.get(j), fingers.get(i), fingers.get(j)), facing(), K.tiltPerPx);
  }
  setAnchor();
  showSeat();
});
for (const kind of ["pointerup", "pointercancel"]) stage.addEventListener(kind, (e) => fingers.delete(e.pointerId));

function showSeat() {
  const el = $("seatNums");
  if (!el) return;
  const s = S.seat;
  el.innerHTML = `курс <b>${Math.round(s.yaw)}°</b> · наклон <b>${Math.round(s.tilt)}°</b> · размер <b>×${s.scale.toFixed(2)}</b> · сдвиг <b>${s.x.toFixed(2)}, ${s.y.toFixed(2)}</b>`;
}

function fit(on) {
  S.fitting = on;
  fingers.clear();
  render();
}

function refill() {
  while (S.hand.length < 5 && S.table.deck.length) S.hand.push(S.table.deck.pop());
  S.dirty = true;
  renderHand();
}

function renderHand() {
  const hand = $("hand");
  hand.innerHTML = "";
  const n = S.hand.length;
  S.hand.forEach((c, i) => {
    const el = document.createElement("div");
    const [glyph, colour] = SUIT_OF(c);
    el.className = "c";
    el.style.color = colour;
    el.style.transform = `rotate(${(i - (n - 1) / 2) * 7}deg)`;
    el.innerHTML = `${RANK_OF(c)}<span>${glyph}</span>`;
    el.addEventListener("click", () => {
      S.hand.splice(i, 1);
      throwToPile(S.table, c);
      S.dirty = true;
      toast(`${name(c)} → в сброс`);
      renderHand();
    });
    hand.append(el);
  });
}

function placeHand() {
  const h = sheet.offsetHeight;
  $("hand").style.bottom = `${h + 6}px`;
  $("handbar").style.bottom = `${h + 128}px`;
}

// ─── экраны ───────────────────────────────────────────────────────────────────────────────────────
function go(screenName) { S.screen = screenName; render(); }

function render() {
  const play = S.screen === "play";
  frameEl.style.display = S.screen === "capture" ? "block" : "none";
  $("hand").classList.toggle("on", play && !S.fitting);
  $("handbar").classList.toggle("on", play && !S.fitting);
  border.visible = play && S.fitting;
  if (S.screen !== "play") anchor.visible = false;

  if (S.screen === "start") {
    sheet.innerHTML = `<h1>AR-стол</h1>
      <p>Стол повиснет перед тобой — наклоняй телефон, чтобы осмотреться. Камера не нужна. Другие режимы сверху: <b>ФОТО</b> — стол ложится на любую вещь с рисунком, <b>КОД</b> — на квадратный код с экрана второго телефона.</p>
      <div class="row"><button id="go">Начать</button></div>`;
    $("go").onclick = async () => { await startSensors(); S.screen = "ready"; setMode(S.mode); };
  } else if (S.screen === "capture") {
    sheet.innerHTML = `<h1>Новая метка</h1>
      <div class="meter"><i></i></div><div class="verdict"></div><div class="nums"></div>
      <div class="row"><button id="shoot">сделать меткой</button>${S.markers.length ? '<button class="ghost" id="back">к меткам</button>' : ""}</div>`;
    $("shoot").onclick = capture;
    if ($("back")) $("back").onclick = () => go("library");
  } else if (S.screen === "compile") {
    sheet.innerHTML = `<h1>Собираю метку…</h1><div class="meter"><i style="background:var(--gold)"></i></div><div class="nums"></div>
      <p>Всё считается на телефоне, в сеть ничего не уходит.</p>`;
  } else if (S.screen === "library") {
    sheet.innerHTML = `<h1>Мои метки</h1><div id="list" style="display:flex;flex-direction:column;gap:8px"></div>
      <div class="row"><button id="add">новая метка</button></div>`;
    const list = $("list");
    for (const m of S.markers) {
      const row = document.createElement("div");
      row.className = `marker${m.id === S.active ? " on" : ""}`;
      row.innerHTML = `<img src="${m.thumb}" alt=""><div><b>${m.name}</b><div class="nums">точек ${m.stats.tracking} · ${m.stats.kb} КБ · ${m.stats.seconds} с · кадр ${m.stats.verdict}</div></div><button class="x" title="удалить">✕</button>`;
      row.onclick = () => { S.active = m.id; startImage(m); };
      row.querySelector(".x").onclick = async (e) => {
        e.stopPropagation();
        await deleteMarker(m.id);
        S.markers = await listMarkers();
        if (S.active === m.id) S.active = null;
        go(S.markers.length ? "library" : "capture");
      };
      list.append(row);
    }
    $("add").onclick = () => { stopTrackers(); go("capture"); };
  } else if (play && S.fitting) {
    sheet.innerHTML = `<h1>Подгонка</h1>
      <p class="nums">один палец — сдвиг · два пальца: крутить — курс, развести — размер, вместе вверх-вниз — наклон</p>
      <div class="nums" id="seatNums"></div>
      <div class="row"><button id="fitDone">готово</button><button class="ghost" id="fitReset">сброс</button><button class="ghost" id="fitCancel">отмена</button></div>`;
    showSeat();
    $("fitDone").onclick = () => { writeSeat(localStorage, S.seatKey, S.seat); toast("посадка запомнена"); fit(false); };
    $("fitReset").onclick = () => { S.seat = { ...SEAT0, flat: S.seat.flat }; setAnchor(); showSeat(); };
    $("fitCancel").onclick = () => { loadSeat(S.seatKey); setAnchor(); fit(false); };
  } else if (play) {
    const m = S.markers.find((x) => x.id === S.active);
    const marked = K.fuse >= 0.5 && S.mode !== "gyro";
    const again = marked ? '<button class="ghost" id="again">поставить заново</button>' : "";
    const lie = marked ? `<button class="ghost" id="lie">стол: ${S.seat.flat ? "плашмя" : "на предмет"}</button>` : "";
    const fitBtn = '<button class="ghost" id="fit">подогнать</button>';
    if (S.mode === "image") {
      sheet.innerHTML = `<div class="row"><button class="ghost" id="lib">метки</button><button class="ghost" id="add">новая</button>${again}${lie}${fitBtn}
        <span class="nums">${m ? `${m.name} · точек ${m.stats.tracking}` : ""}</span></div>`;
      $("lib").onclick = () => { stopTrackers(); go("library"); };
      $("add").onclick = () => { stopTrackers(); go("capture"); };
    } else if (S.mode === "code") {
      sheet.innerHTML = `<div class="row"><button class="ghost" id="show">показать код №${K.arucoId}</button>${again}${lie}${fitBtn}<span class="nums">на экране второго телефона или на бумаге</span></div>`;
      $("show").onclick = showCode;
    } else {
      sheet.innerHTML = `<div class="row"><button class="ghost" id="here">поставить сюда</button><button class="ghost" id="bg">фон: ${S.gyroCam ? "камера" : "сетка"}</button>${fitBtn}</div>`;
      $("here").onclick = () => { aimCamera(); placeGyro(); };
      $("bg").onclick = () => { S.gyroCam = !S.gyroCam; setMode("gyro"); };
    }
    if ($("again")) $("again").onclick = () => { fusion.reset(); camera.position.set(0, 0, 0); };
    if ($("lie")) $("lie").onclick = () => {
      S.seat = { ...S.seat, flat: !S.seat.flat };
      writeSeat(localStorage, S.seatKey, S.seat);
      fusion.reset(); camera.position.set(0, 0, 0);
      render();
    };
    $("fit").onclick = () => fit(true);
    if (!S.hand.length) refill(); else renderHand();
  } else {
    sheet.innerHTML = "";
  }
  placeHand();
}

async function showCode() {
  if (!window.AR) await startCode();
  $("codeSvg").innerHTML = new AR.Dictionary("ARUCO_MIP_36h12").generateSVG(K.arucoId);
  $("code").classList.add("on");
}
$("codeClose").onclick = () => $("code").classList.remove("on");

document.querySelectorAll("#top .chip").forEach((c) => { c.onclick = () => setMode(c.dataset.mode); });

let statusText = "";
function status(text, tone = "") {
  if (text === statusText && statusEl.className === tone) return;
  statusText = text; statusEl.textContent = text; statusEl.className = tone;
}

let toastTimer = 0;
function toast(text) {
  const t = $("toast");
  t.textContent = text; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 1400);
}

function tick() {
  S.frame += 1; S.fpsCount += 1;
  const now = performance.now();
  if (now - S.fpsAt >= 1000) { S.fps = Math.round((S.fpsCount * 1000) / (now - S.fpsAt)); S.fpsCount = 0; S.fpsAt = now; }
}

// ─── панель ручек ─────────────────────────────────────────────────────────────────────────────────
const RESTART = new Set(["filterMinCF", "filterBeta", "warmup", "miss", "fuse", "gyroFov"]);
function buildPanel() {
  const panel = $("panel");
  panel.innerHTML = KNOBS.map(([title, list]) => `<h2>${title}</h2>` + list.map(([k, label, note, , min, max, step]) =>
    `<label class="k"><span>${label}${note ? `<small>${note}</small>` : ""}</span><input type="number" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${K[k]}"></label>`).join("")).join("")
    + `<div class="row"><button class="ghost" id="resetKnobs">сбросить</button></div>`;
  panel.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
    const v = Number(inp.value);
    if (!Number.isFinite(v)) return;
    K[inp.dataset.k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(K)); } catch { /* без памяти */ }
    applyScale();
    layout();
    if (S.mode === "image" && S.screen === "play" && RESTART.has(inp.dataset.k)) setMode("image");
    if (S.mode === "gyro" && S.screen === "play") placeGyro();
    if (S.mode === "code" && S.screen === "play") { if (inp.dataset.k === "fuse") setMode("code"); else render(); }
  }));
  $("resetKnobs").onclick = () => {
    try { localStorage.removeItem(KEY); } catch { /* без памяти */ }
    KNOBS.forEach(([, list]) => list.forEach(([k, , , d]) => { K[k] = d; }));
    buildPanel(); applyScale(); layout();
  };
}
$("knob").onclick = () => $("panel").classList.toggle("open");

// ─── цикл ─────────────────────────────────────────────────────────────────────────────────────────
function loop(now) {
  requestAnimationFrame(loop);
  if (S.screen === "play" && S.mode === "code") detectCode();
  if (S.screen === "play" && fused()) { aimCamera(); placeFused(now); }
  lastFrameAt = now;
  if (S.screen === "play" && S.mode === "gyro") {
    aimCamera();
    if (S.orient && !S.gyroPlaced) { placeGyro(); S.gyroPlaced = true; gyroStatus(); }
  }
  const ringing = S.table.tap && now - S.table.tap.at < 900;
  if (S.dirty || ringing) { drawTable(tg, S.table, now); texture.needsUpdate = true; S.dirty = false; }
  renderer.render(scene, camera);
}

(async () => {
  S.markers = await listMarkers();
  S.active = S.markers[0]?.id ?? null;
  buildPanel();
  setMode(S.mode);
  render();
  layout();
  requestAnimationFrame(loop);
})();
