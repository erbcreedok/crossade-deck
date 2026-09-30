// СТОЛ В THREE.JS — снимок стола (`TableStore.state`) в объёме, и палец по нему теми же намерениями, что шлёт стол:
//
//   сукно      круг радиуса стола с кромкой и дном; точка сукна (x, y) — в мире (x, 0, y): +y — к своей стороне;
//   стулья     по кругу (`seatPoint`), у каждого — голова цвета хозяина с именем; пустой — серое кольцо;
//   карты      у каждой две стороны (лицо и рубашка) спиной к спине; на сукне лежат, где лежат, повернуты по часовой;
//              в стопке — друг на друге (в круге хода — на своём месте круга); в чужой руке — веером лицом к хозяину,
//              в своей — веером лицом к тебе;
//   камера     за своим стулом над столом; тянешь по пустому — облёт, колесо / два пальца — ближе;
//   палец      тянешь карту (с сукна, верхнюю из стопки, из своей руки) — `grab`, несёшь над сукном, отпустил:
//              над своей рукой — в руку на это место, у стопки — в стопку, иначе — на сукно (`drop`);
//              двойной тап — перевернуть (`turn`; в руке — лицом наружу, к остальным).
//
// Для проверок — `window.__t3d`: где карта на экране, откуда смотрит камера, что в снимке.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import type { PanelWorld, WorldPlace } from "./panel.js";
import type { Chair, Pile, SeenCard, Snapshot, Where } from "../../server/src/table/contract.js";
import { CARRY_EVERY_MS } from "../../server/src/table/contract.js";
import { AWAY_DEG, awayOf, BODY_EVERY_MS, gazeOf, HEAD, headOf, leftHandOf, NECK, NECK_LEN, restHead, SHOULDER_H, sideOf, shoulders3, type Body, type Point3 } from "../../server/src/table/bodies.js";
import { CAM, headAt, neckNew, neckStep, pitchToCentre, TOP, topHeight, wrap, type CamMode } from "./camera.js";
import { ringTurned, seatPoint, SEAT_RADIUS, TABLE_RADIUS } from "../../server/src/table/ring.js";
import { artUrl, readLook, type DeckLook } from "../../server/table-client/deckArt.js";
import { blendOf, handPlanBlend, mineGeomOf, snapPose, tuckOf, type PoseBlend } from "../../server/table-client/handGeom.js";
import { BAR_LOOK, T, type Geom } from "../../server/table-client/screenConst.js";
import { drawFingerCard, fingerKind } from "./finger.js";
import type { TableStore } from "../../server/table-client/store.js";

const DEG = Math.PI / 180;
const R = TABLE_RADIUS, RIM = 0.45, THICK = 0.6;
const CARD_W = 1.3, CARD_H = 1.82;
/** Каждую карту стопки — чуть выше предыдущей; каждую карту сукна — выше лёгшей раньше. */
const FELT_STEP = 0.004;
/** Сколько держать карту без «держу» — меньше `LOCK_TTL_MS` стола. */
const HOLD_MS = 1500;
/** Двойной тап — два тапа по одной карте за столько. */
const DOUBLE_MS = 350;
/**
 * ПРУЖИНА — как карты догоняют свои места: жёсткость и доля затухания от критического (меньше 1 — с лёгким
 * перелётом). Несомая — жёстче и почти без перелёта: она должна быть под пальцем, а не догонять его.
 */
const SPRING = { k: 170, damp: 0.62 }, SPRING_HELD = { k: 900, damp: 0.9 };
/** Над своей рукой несомая карта — выше соседей на эту долю своей высоты, ближе к глазу и чуть крупнее. */
const HOVER = { up: 0.55, near: 0.6, grow: 1.15 };

/** Место карты: в мире (`over` — моя рука: место в мире, но рисуется поверх всего) — или в осях камеры (`onCamera`: над окном HUD). */
type Place = { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number; onCamera?: true; over?: true };
/** Где карта сейчас по снимку: откуда её можно взять. */
type From = { in: "felt" } | { in: "pile"; pile: string; top: boolean } | { in: "hand"; chair: string; mine: boolean; i: number };

// ——— картинки ———
const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");
const textures = new Map<string, THREE.Texture>();
/** Кто ждёт картинку: экранов может быть несколько, и каждый перерисуется, когда она пришла. */
const waiting = new Map<string, Set<() => void>>();
function texture(url: string, ready: () => void): THREE.Texture {
  let t = textures.get(url);
  if (!t) {
    const listeners = new Set<() => void>([ready]);
    waiting.set(url, listeners);
    t = loader.load(url, () => { for (const one of listeners) one(); waiting.delete(url); });
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    textures.set(url, t);
  } else waiting.get(url)?.add(ready);
  return t;
}
function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Лицо скрытой карты, повёрнутой ко мне: рука с пальцем, оттенков несколько — по id карты (`finger.ts`). */
const fingerTextures: THREE.CanvasTexture[] = [];
function fingerTexture(id: string): THREE.CanvasTexture {
  const kind = fingerKind(id);
  let t = fingerTextures[kind];
  if (!t) {
    t = canvasTexture(256, 358, (g) => drawFingerCard(g, 256, 358, kind));
    t.anisotropy = 8;
    fingerTextures[kind] = t;
  }
  return t;
}

/** Карта: лицо (+z) и рубашка (−z) спиной к спине, со скруглёнными углами. */
const cardOutline = (() => {
  const w = CARD_W / 2, h = CARD_H / 2, r = 0.09;
  const s = new THREE.Shape();
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  return s;
})();
const cardShape = (() => {
  const g = new THREE.ShapeGeometry(cardOutline, 4);
  const pos = g.getAttribute("position") as THREE.BufferAttribute, uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5);
  return g;
})();
/**
 * БОК КОЛОДЫ. Карта здесь — плоский лист, и сбоку стопка листов была сплошной белой плитой. Настоящая колода сбоку — не белая:
 * срез бумаги кремовый, серее лица, с тонкой тёмной линией на стыке каждой карты, а у основания темнее (тень между картами).
 * Тело стопки — выдавленный контур карты, без крышек: видны только стенки; листы лежат внутри и чуть выступают кромкой.
 */
const PILE_STEP = 0.012;
const pileSideTexture = (() => {
  const t = canvasTexture(8, 64, (g) => {
    g.fillStyle = "#d1c6ab"; g.fillRect(0, 0, 8, 64);
    g.fillStyle = "#e2d9c1"; g.fillRect(0, 0, 8, 9);
    g.fillStyle = "#978b74"; g.fillRect(0, 55, 8, 9);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1 / PILE_STEP);
  t.anisotropy = 8;
  return t;
})();
const pileBodyMat = [new THREE.MeshBasicMaterial({ visible: false }), new THREE.MeshBasicMaterial({ map: pileSideTexture, vertexColors: true })];
const pileBodyGeoms = new Map<number, THREE.BufferGeometry>();
/** Тело стопки из `n` карт: стенки по контуру карты, темнее к основанию. */
function pileBodyGeom(n: number): THREE.BufferGeometry {
  let g = pileBodyGeoms.get(n);
  if (!g) {
    const depth = (n - 1) * PILE_STEP;
    g = new THREE.ExtrudeGeometry(cardOutline, { depth, bevelEnabled: false, curveSegments: 4 });
    const pos = g.getAttribute("position") as THREE.BufferAttribute, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = 0.45 + 0.45 * Math.min(1, pos.getZ(i) / Math.max(depth, 1e-6)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    pileBodyGeoms.set(n, g);
  }
  return g;
}
interface CardObj { group: THREE.Group; front: THREE.Mesh; back: THREE.Mesh; ring: THREE.LineLoop; target: Place; faceUrl: string; backUrl: string }
const cardEdge = (() => {
  const w = CARD_W / 2 + 0.04, h = CARD_H / 2 + 0.04;
  return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w, -h, 0.003), new THREE.Vector3(w, -h, 0.003), new THREE.Vector3(w, h, 0.003), new THREE.Vector3(-w, h, 0.003)]);
})();

/** Что сцена даёт HUD (`hud.ts`): камеру, руку, стопки и головы на экране, выделение. */
export interface SceneApi {
  home(): void;
  /** Хук проверок этого экрана: `window.__t3d` у того из экранов, что сейчас на виду (`main.ts`). */
  test: unknown;
  /** Повернуть камеру вокруг стола на столько градусов. */
  turnBy(deg: number): void;
  /** Модель камеры: орбита, голова, оптика. Намерения: взгляд (yaw, pitch — градусы) и приближение (> 1 — ближе). */
  camMode(): CamMode;
  setCamMode(m: CamMode): void;
  lookBy(dyaw: number, dpitch: number): void;
  zoomBy(k: number): void;
  opticsBy(k: number): void;
  /** Рамка моей руки на экране (охват карт с полями, не уже 250 пикселей); нет карт или рука положена — `null`. `edge` — высота верхней кромки. */
  handFrame(): { x: number; y: number; w: number; h: number; edge: number } | null;
  /** Рука-стопка: левая рука несёт все карты над столом под пальцем (`screen`); `null` — отпустили: на колоду, новой стопкой на сукно или — над худом руки — всё как было. */
  carryHand(screen: { x: number; y: number } | null): void;
  /** Помещается ли веер моей руки: угол разлёта и подъём краёв в пределах. Нет — рука в ряд, веер выбрать нельзя. */
  fanFits(): boolean;
  /** С какой стороны стола камера (угол места, как у стула) и насколько поднята, градусы. */
  azimuth(): number;
  elevation(): number;
  glass(): { w: number; h: number };
  /** Моя рука на экране — геометрия 2D-стола (`handGeom.ts`); нет стула — `null`. */
  handGeom(): Geom | null;
  /** Поза руки под пальцем, пока тянут ручку позы. */
  setBlend(b: PoseBlend | undefined): void;
  stance(): "sit" | "stand";
  setStance(st: "sit" | "stand"): void;
  setFigures(on: boolean): void;
  setLook(look: DeckLook): void;
  /** Головы сидящих на экране (для строк чата). */
  heads(): { key: string; x: number; y: number; r: number; ink: string; wx: number; wy: number }[];
  pickAt(x: number, y: number): { t: "card"; id: string } | { t: "who"; key: string } | { t: "chair"; id: string } | null;
  /** Стопки на экране: где и сколько; `cardPx` — ширина верхней карты в точках (по ней окно «к стопке» меряет размер). */
  pileSpots(): { pile: string; count: number; x: number; y: number; cardPx: number }[];
  /** Карты, чья середина на экране внутри многоугольника. */
  cardsIn(poly: { x: number; y: number }[]): string[];
  /** Лассо открыто — тап по карте выделяет, выделенные несут вместе; `grab` — как несут. */
  setLasso(on: boolean, grab: "collect" | "keep"): void;
  /** Язычок стопки — на столе, у нижней кромки её верхней карты: тронули — сообщить, чья стопка (окно, переворот, тяга). */
  onTab(fn: (pile: string, e: PointerEvent) => void): void;
  /** Какие язычки горят: у кого открыто окно или кого несут. */
  setTabLit(piles: Set<string>): void;
  /** Точка сукна под пальцем. */
  feltAt(x: number, y: number): { x: number; y: number } | null;
  /** После каждого кадра — HUD переставляет то, что стоит по сцене. */
  onFrame(fn: () => void): void;
  /** Какую карту несут (сдвинулась с места): в окне HUD на её месте пустой контур; никакую — `null`. */
  carrying(): string | null;
  /** Взять карту пальцем из окна HUD (окно стопки, окно стула): дальше её несут, как со стола. */
  carry(id: string, e: PointerEvent): void;
  /** Несут стопку: `screen` — где палец на экране (верх стопки встаёт ровно под него, как несомая карта); `null` — отпустили. */
  carryPile(pile: string, screen: { x: number; y: number } | null): void;
  /** Взялись за язычок стопки в точке экрана: запомнить, где палец относительно стопки — дальше её несут за это же место. */
  grabPile(pile: string, screen: { x: number; y: number }): void;
  /** Где несомая стопка лежит на сукне, если отпустить (в пределах борта); не несут — `null`. */
  pileAt(pile: string): { x: number; y: number } | null;
  /** Куда ляжет то, что отпустят здесь: в мою руку (на место `i`), в стопку, на сукно. */
  aim(x: number, y: number, skipPile?: string): { in: "hand"; chair: string; i: number } | { in: "deck"; pile: string; i?: number } | { in: "felt"; x: number; y: number };
  /**
   * ЗОНА HUD ДЛЯ НЕСОМОЙ КАРТЫ — окно стопки: палец над ним — карта целит в стопку на место `i` и стоит на экране в
   * щели веера (`spot`: середина, ширина, поворот в точках экрана). Спрашивается раньше стола.
   */
  setZone(fn: ((x: number, y: number) => { where: { in: "deck"; pile: string; i: number } | { in: "hand"; chair: string; i: number }; spot: { x: number; y: number; w: number; angle: number } } | null) | null): void;
  /** Куда сейчас целит несомая карта в зоне HUD — окно рисует под неё щель. */
  heldZone(): { pile?: string; chair?: string; i: number; id: string; spot: { x: number; y: number; w: number; angle: number } } | null;
  /** Правая рука без карты — на чём она (остальные видят руку на стопке, пока с ней возятся); `null` — без дела. */
  setRestRight(at: { x: number; y: number } | null): void;
  /** Где левая рука (с веером) сидящего за стулом — туда тянется правая, пока вожусь с его рукой; пустой стул — `null`. */
  handOf(chair: string): { x: number; y: number } | null;
  /** Панели HUD на столе — слой CSS3D (`panel.ts`); и сам слой: нажатия по панелям ловит HUD. */
  panels: Pick<PanelWorld, "place3d" | "local3d">;
  panelLayer(): HTMLElement;
}
/** Сколько точек панели в единице стола, когда она стоит на столе. */
const PANEL_PX = 60;

export function mountScene(host: HTMLElement, store: TableStore): SceneApi {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  // ТЕНИ — от солнца над столом: карты в воздухе, тела и руки ложатся тенью на сукно.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x0a1511);
  host.append(renderer.domElement);
  // ПАНЕЛИ НА СТОЛЕ — слой CSS3D поверх холста: живые окна HUD в пространстве сцены, той же камерой.
  const css = new CSS3DRenderer();
  Object.assign(css.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  host.append(css.domElement);
  const cssScene = new THREE.Scene();
  const panel3d = new Map<HTMLElement, { obj: CSS3DObject; at: WorldPlace }>();
  Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block", touchAction: "none" });
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a1511, 30, 70);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  // Своя рука — в осях камеры: внизу экрана, как бы камеру ни крутили.
  /** Слой моей руки у глаза: рисуется вторым проходом, после сброса глубины. */
  const HAND_LAYER = 1;
  const handRoot = new THREE.Group();
  camera.add(handRoot);
  scene.add(camera);
  let frame = 0;
  const draw = () => { if (!frame) frame = requestAnimationFrame(tick); };
  const frameHeard: (() => void)[] = [];
  /** Поза тела этого экрана; правило стола «играть стоя» сильнее её. */
  let stance: "sit" | "stand" = "sit";
  const stanceNow = () => (store.state.rules.stand ? "stand" : stance);
  let look = readLook();
  let lasso = { on: false, grab: "collect" as "collect" | "keep" };
  /** Стопку несут за грип — где она сейчас под пальцем. */
  let pileCarry: { pile: string; x: number; y: number } | null = null;
  /**
   * ОТПУЩЕННАЯ СТОПКА ЖДЁТ ОТВЕТА НА МЕСТЕ, КУДА ЛЕГЛА: пока стол не подтвердил перенос, её старое место в снимке —
   * это прошлое, и без этого она на миг прыгала бы назад. Держится, пока место в снимке прежнее, но не дольше `until`.
   */
  let pileLanding: { pile: string; x: number; y: number; was: { x: number; y: number }; until: number } | null = null;

  // ——— стол ———
  const feltTex = canvasTexture(1024, 1024, (c) => {
    const full = R + RIM, k = 512 / full;
    c.fillStyle = "#6b4d2c"; c.beginPath(); c.arc(512, 512, 512, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#3a2716"; c.beginPath(); c.arc(512, 512, R * k + 6, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(512, 512, 0, 512, 512, R * k);
    g.addColorStop(0, "#1f6346"); g.addColorStop(1, "#0c2c1f");
    c.fillStyle = g; c.beginPath(); c.arc(512, 512, R * k, 0, Math.PI * 2); c.fill();
  });
  const top = new THREE.Mesh(new THREE.CircleGeometry(R + RIM, 128), new THREE.MeshLambertMaterial({ map: feltTex }));
  top.receiveShadow = true;
  top.rotation.x = -Math.PI / 2;
  const under = new THREE.Mesh(new THREE.CircleGeometry(R + RIM, 96), new THREE.MeshBasicMaterial({ color: 0x0b0704 }));
  under.rotation.x = Math.PI / 2;
  under.position.y = -THICK;
  const side = new THREE.Mesh(new THREE.CylinderGeometry(R + RIM, R + RIM, THICK, 128, 1, true), new THREE.MeshBasicMaterial({ color: 0x3a2716 }));
  side.position.y = -THICK / 2;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshBasicMaterial({ color: 0x08110e }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -7;
  scene.add(top, under, side, floor);
  const feltPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // ——— камера: за своим стулом ———
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0, 0);
  orbit.enablePan = false;
  orbit.minDistance = 5;
  orbit.maxDistance = 40;
  orbit.maxPolarAngle = 85 * DEG;
  orbit.addEventListener("change", draw);
  const myChair = () => { const seat = store.state.people.find((p) => p.key === store.me.key)?.seat; return store.state.chairs.find((c) => c.id === seat); };
  /** Домой — за свой стул, так далеко, чтобы стол с кромкой влез по ширине кадра (на телефоне в портрете — дальше). */
  function homeOrbit(): void {
    const a = (myChair()?.angle ?? 0) * DEG;
    const aspect = host.clientWidth / Math.max(1, host.clientHeight);
    const half = Math.atan(Math.tan((camera.fov * DEG) / 2) * aspect);
    // Стоя голова выше — камера дальше от стола (`STANCE_ZOOM`).
    const d = Math.max(R + 5, ((R + RIM) / Math.tan(half)) * 0.8) * (stanceNow() === "stand" ? 1.25 : 1);
    const pitch = 52 * DEG;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.position.set(Math.sin(a) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(a) * Math.cos(pitch) * d);
    orbit.target.set(0, 0, 1.2 * Math.cos(a)).setX(1.2 * Math.sin(a));
    orbit.update();
  }

  // ——— модели камеры (`camera.ts`): орбита вокруг стола, голова на месте с наклоном, голова на месте с оптикой ———
  let camMode: CamMode = ((m) => (m === "orbit" || m === "top" ? m : "head"))(new URLSearchParams(location.search).get("cam"));
  const rig = { yaw: 0, pitch: -40, lean: 0, fov: CAM.fov.base as number };
  const neck = neckNew();
  /** Рука в кадре (вид «голова») как в FPS: отстаёт от поворота взгляда и чуть поднимается, когда смотришь вниз, опускается, когда вверх. */
  const sway = { x: 0, y: 0, yaw: 0, pitch: 0, home: -40 };
  const SWAY = { lag: 0.018, pitchLift: 0.006, decay: 7, max: 0.3 };
  const swayOffset = () => ({ x: sway.x, y: sway.y - (rig.pitch - sway.home) * SWAY.pitchLift });
  const sideYaw = (ch: Chair) => -ch.angle;
  /** Моя голова: где она, куда смотрит, ушла ли на другую сторону и какой поворот слать остальным. */
  function myHeadNow(ch: Chair): { head: Point3; yaw: number; away: boolean; sent: number; hand: Point3 } {
    const f = camera.getWorldDirection(new THREE.Vector3()), sh = shoulders3(ch.angle, stanceNow());
    if (camMode === "orbit") {
      const yaw = Math.atan2(f.x, -f.z) / DEG, head = headOf(sh, { x: camera.position.x, y: camera.position.z, h: camera.position.y }, 0, yaw);
      return { head, yaw, away: awayOf(sh, yaw), sent: yaw, hand: leftHandOf(head, yaw) };
    }
    // Голова сидит на месте и смотрит куда хочет; остальным шлём поворот в пределах своей стороны: дальше они сочли бы голову ушедшей.
    const yaw = rig.yaw, lim = AWAY_DEG - 1, sent = sideYaw(ch) + Math.max(-lim, Math.min(lim, wrap(yaw - sideYaw(ch))));
    if (camMode === "top") { const head = headAt(sh, rig.lean); return { head, yaw, away: false, sent, hand: leftHandOf(head, yaw) }; }
    // В `head` рука с картами — в кадре внизу: камера едет с головой, и рука с ней, не уплывая при наклоне взгляда.
    const head = { x: camera.position.x, y: camera.position.z, h: camera.position.y };
    return { head, yaw, away: false, sent, hand: camHandPoint(head, yaw, rig.pitch) };
  }
  /** Поставить камеру по состоянию: голова от плеч стула (с наклоном шеи в `head`), взгляд — yaw и pitch. */
  function applyRig(): void {
    const ch = myChair();
    if (!ch || camMode === "orbit") return;
    const sh = shoulders3(ch.angle, stanceNow());
    if (camMode === "top") {
      // Сверху: камера над серединой стола, вверху кадра — куда смотрит `yaw`; выше стоя и в покое, ниже — когда шея наклонена.
      if (Math.abs(camera.fov - TOP.fov) > 1e-3) { camera.fov = TOP.fov; camera.updateProjectionMatrix(); }
      const rest = topHeight(camera.aspect, TOP.fov, (sh.h + NECK_LEN.up) / (SHOULDER_H.sit + NECK_LEN.up));
      const h = rest * (1 - rig.lean * (1 - HEAD.min / (sh.h + NECK_LEN.up))), y = rig.yaw * DEG;
      camera.up.set(Math.sin(y), 0, -Math.cos(y));
      camera.position.set(0, h, 0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      return;
    }
    camera.up.set(0, 1, 0);
    const pos = headAt(sh, rig.lean);
    const fov = rig.fov;
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const y = rig.yaw * DEG, p = rig.pitch * DEG;
    camera.position.set(pos.x, pos.h, pos.y);
    camera.lookAt(pos.x + Math.sin(y) * Math.cos(p), pos.h + Math.sin(p), pos.y - Math.cos(y) * Math.cos(p));
    camera.updateMatrixWorld();
  }
  function rigHome(): void {
    const ch = myChair();
    if (!ch) return;
    rig.yaw = sideYaw(ch);
    rig.lean = 0;
    rig.fov = CAM.fov.base;
    neck.held = neck.back = neck.rest = 0;
    rig.pitch = camMode === "top" ? -90 : pitchToCentre(headAt(shoulders3(ch.angle, stanceNow()), 0));
    sway.home = rig.pitch; sway.yaw = rig.yaw; sway.pitch = rig.pitch; sway.x = sway.y = 0;
    camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
    applyRig();
  }
  function home(): void { if (camMode === "orbit") homeOrbit(); else rigHome(); }
  /** Намерение: повернуть взгляд (в орбите — обойти стол). */
  function lookBy(dyaw: number, dpitch: number): void {
    if (camMode === "orbit") return;
    rig.yaw = wrap(rig.yaw + dyaw);
    if (camMode !== "top") rig.pitch = Math.max(CAM.pitch.min, Math.min(CAM.pitch.max, rig.pitch + dpitch));
    applyRig(); touched = true; draw(); sendBody();
  }
  /** Намерение: приблизить (`k` > 1) или отдалить. В `head` — наклон к столу, в `fov` — поле зрения. */
  function zoomBy(k: number): void {
    if (camMode === "orbit") return;
    rig.lean = Math.max(0, Math.min(1, rig.lean + Math.log(k) * 0.5 * (neck.rest > 0 ? 0 : 1)));
    applyRig(); draw(); sendBody();
  }
  /** Намерение: оптический зум (`k` > 1 — уже поле зрения). Тело не двигается, рука в кадре остаётся того же размера. Вид «голова». */
  function opticsBy(k: number): void {
    if (camMode !== "head") return;
    rig.fov = Math.max(CAM.fov.min, Math.min(CAM.fov.base, rig.fov / k));
    applyRig(); draw();
  }
  function setCamMode(m: CamMode): void {
    camMode = m;
    orbit.enabled = m === "orbit";
    camera.up.set(0, 1, 0);
    camera.fov = m === "orbit" ? 50 : m === "top" ? TOP.fov : CAM.fov.base;
    camera.updateProjectionMatrix();
    home();
    touched = false;
    draw(); sendBody(true);
  }
  const rigPtrs = new Map<number, { x: number; y: number; right: boolean }>();
  // Ввод для головы: один палец или левая кнопка — взгляд; щипок и колесо — приближение (наклон к столу); два пальца вверх-вниз
  // или правая кнопка вверх-вниз — оптический зум (в виде «сверху» оптики нет, там это тоже приближение); стрелки, +/-, `[`/`]`, Home.
  {
    const dom = renderer.domElement, ptrs = rigPtrs;
    const pair = () => { const [a, b] = [...ptrs.values()]; return a && b ? { d: Math.hypot(a.x - b.x, a.y - b.y), y: (a.y + b.y) / 2 } : null; };
    const optics = (k: number) => (camMode === "head" ? opticsBy(k) : zoomBy(k));
    dom.addEventListener("pointerdown", (e) => {
      if (camMode === "orbit" || drag) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, right: e.button === 2 });
      try { dom.setPointerCapture(e.pointerId); } catch { /* нет такого указателя */ }
    });
    dom.addEventListener("pointermove", (e) => {
      const was = ptrs.get(e.pointerId);
      if (!was || camMode === "orbit" || drag) return;
      const before = pair();
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, right: was.right });
      if (ptrs.size === 1) {
        if (was.right) optics(Math.exp(-(e.clientY - was.y) * CAM.scroll));
        else lookBy(-(e.clientX - was.x) * CAM.look, (e.clientY - was.y) * CAM.look);
      } else if (ptrs.size === 2 && before) {
        const now = pair()!;
        if (camMode === "top") zoomBy((now.d / Math.max(1, before.d)) * Math.exp(-(now.y - before.y) * CAM.scroll));
        else { zoomBy(now.d / Math.max(1, before.d)); opticsBy(Math.exp(-(now.y - before.y) * CAM.scroll)); }
      }
    });
    const up = (e: PointerEvent) => { ptrs.delete(e.pointerId); };
    dom.addEventListener("pointerup", up);
    dom.addEventListener("pointercancel", up);
    dom.addEventListener("contextmenu", (e) => { if (camMode !== "orbit") e.preventDefault(); });
    dom.addEventListener("wheel", (e) => { if (camMode === "orbit") return; e.preventDefault(); if (e.shiftKey) optics(Math.exp(-e.deltaY * CAM.wheel * 2)); else zoomBy(Math.exp(-e.deltaY * CAM.wheel * 2)); }, { passive: false });
    addEventListener("keydown", (e) => {
      if (camMode === "orbit" || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]")) return;
      if (host.closest(".screen")?.classList.contains("off")) return;
      const k = e.key;
      if (k === "ArrowLeft") lookBy(-CAM.key, 0);
      else if (k === "ArrowRight") lookBy(CAM.key, 0);
      else if (k === "ArrowUp") lookBy(0, CAM.key);
      else if (k === "ArrowDown") lookBy(0, -CAM.key);
      else if (k === "+" || k === "=") zoomBy(1.15);
      else if (k === "-" || k === "_") zoomBy(1 / 1.15);
      else if (k === "]") optics(1.15);
      else if (k === "[") optics(1 / 1.15);
      else if (k === "Home") { home(); draw(); sendBody(true); }
      else return;
      e.preventDefault();
    });
  }

  // ——— стулья ———
  const heads = new THREE.Group();
  scene.add(heads);
  const headCache = new Map<string, THREE.Texture>();
  const headTex = (name: string, ink: string) => {
    const key = `${name}|${ink}`;
    let t = headCache.get(key);
    if (!t) {
      t = canvasTexture(256, 320, (c) => {
        c.fillStyle = ink; c.beginPath(); c.arc(128, 128, 110, 0, Math.PI * 2); c.fill();
        c.lineWidth = 10; c.strokeStyle = "#0b0704"; c.stroke();
        c.fillStyle = "#0b0704"; c.font = "700 120px system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(name.slice(0, 1).toUpperCase(), 128, 136);
        c.fillStyle = "rgba(11,7,4,.8)"; c.fillRect(8, 262, 240, 50);
        c.fillStyle = "#f5ead0"; c.font = "600 34px system-ui, sans-serif"; c.fillText(name.slice(0, 12), 128, 288);
      });
      headCache.set(key, t);
    }
    return t;
  };
  // ——— тела: палка от пола до плеч, плечи, шея к голове, левая рука с картами, правая — к пальцу ———
  // Свет — так, чтобы освещённое сукно было того же цвета, что и без света: рассеянный плюс солнце ≈ 1.
  const sun = new THREE.DirectionalLight(0xfff6e8, 0.75);
  sun.position.set(5, 22, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 4;
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a3a32, 0.62), sun);
  /** Тело сидящего: пришедшее из комнаты — или в покое: сидит, смотрит в середину стола. */
  const bodyOf = (by: string, angle: number): Body => store.bodies.find((b) => b.by === by) ?? { by, stance: "sit", model: "seat", eye: { x: 0, y: 0, h: restHead("sit") }, stretch: 0, yaw: -angle, right: null };
  interface Pose { by: string; s: Point3; head: Point3; left: Point3; away: boolean; yaw: number; pitch?: number; gaze?: number; right: Point3 | null; ink: string; name: string; strained: boolean }
  /** Где у сидящего за стулом `ch` плечи, голова и руки — общей геометрией стола (`bodies.ts`). Своё тело — нет: своя голова — камера. */
  const poseOf = (ch: Chair, s: Snapshot): Pose | null => {
    const who = s.people.find((p) => p.key === ch.owner);
    if (!who || who.key === store.me.key) return null;
    const b = bodyOf(who.key, ch.angle);
    const sh = shoulders3(ch.angle, b.stance);
    const head = headOf(sh, b.eye, b.stretch, b.yaw);
    const holding = store.carries.some((c) => c.by === who.key);
    return { by: who.key, s: sh, head, left: b.pitch === undefined ? leftHandOf(head, b.yaw) : camHandPoint(head, b.gaze ?? b.yaw, b.pitch), away: awayOf(sh, b.yaw), yaw: b.yaw, pitch: b.pitch, gaze: b.gaze, right: b.right ? { ...b.right, h: holding ? HEAD.lift * head.h : restH(b.right, ch.id) } : null, ink: who.ink, name: who.name, strained: b.stretch > NECK.free };
  };
  const V = (p: Point3) => new THREE.Vector3(p.x, p.h, p.y);
  /** На какой высоте лежит свободная правая рука в точке `at`: на верху стопки, у левой руки сидящего — на её высоте, иначе над сукном. */
  function restH(at: { x: number; y: number }, from?: string): number {
    const pile = store.state.piles.find((p) => Math.hypot(p.x - at.x, p.y - at.y) < 0.6);
    if (pile) return 0.2 + pile.cards.length * PILE_STEP;
    for (const ch of store.state.chairs) {
      if (ch.id === from) continue;
      const l = leftOf(ch);
      if (l && Math.hypot(l.x - at.x, l.y - at.y) < 0.8) return l.h;
    }
    return 0.4;
  }
  /** Левая рука сидящего за стулом (мой — по камере). */
  function leftOf(ch: Chair): Point3 | null {
    const who = store.state.people.find((p) => p.key === ch.owner);
    if (!who) return null;
    if (who.key === store.me.key) return myHeadNow(ch).hand;
    const b = bodyOf(who.key, ch.angle), head = headOf(shoulders3(ch.angle, b.stance), b.eye, b.stretch, b.yaw);
    return b.pitch === undefined ? leftHandOf(head, b.yaw) : camHandPoint(head, b.gaze ?? b.yaw, b.pitch);
  }
  const flatMat = new Map<string, THREE.Material>();
  const inkFlat = (ink: string) => { let m = flatMat.get(ink); if (!m) { m = new THREE.MeshBasicMaterial({ color: ink }); flatMat.set(ink, m); } return m; };
  const inkMat = new Map<string, THREE.Material>();
  const inkOf = (ink: string) => { let m = inkMat.get(ink); if (!m) { m = new THREE.MeshLambertMaterial({ color: ink }); inkMat.set(ink, m); } return m; };
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0b0704, side: THREE.BackSide });
  const unitStick = new THREE.CylinderGeometry(1, 1, 1, 14);
  const unitBall = new THREE.SphereGeometry(1, 20, 14);
  /** Палка от `a` до `b` толщиной `r`, цвета `ink`, с тёмным контуром. */
  const stick = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Group => {
    const g = new THREE.Group(), len = a.distanceTo(b);
    for (const [m, k] of [[mat, 1], [outlineMat, 1.35]] as const) {
      const one = new THREE.Mesh(unitStick, m);
      one.castShadow = k === 1;
      one.scale.set(r * k, len + (k > 1 ? r * 0.5 : 0), r * k);
      g.add(one);
    }
    g.position.copy(a).add(b).multiplyScalar(0.5);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return g;
  };
  const ball = (at: THREE.Vector3, r: number, mat: THREE.Material): THREE.Group => {
    const g = new THREE.Group();
    for (const [m, k] of [[mat, 1], [outlineMat, 1.25]] as const) { const one = new THREE.Mesh(unitBall, m); one.castShadow = k === 1; one.scale.setScalar(r * k); g.add(one); }
    g.position.copy(at);
    return g;
  };
  /** Кукла в единицах стола — как у стола в 2D (`bodyView.ts`): толщина палки, полуширина плеч, руки, досягаемость. */
  const DOLL = { spine: 0.21, bar: 1.4, arm: 0.13, hand: 0.32, reach: 2 * TABLE_RADIUS + 2, ref: 12, max: 4 } as const;
  /** Во сколько раз толще шея, рука и кисть от дальности до камеры: издалека тонкая рука пропадает — дальше камера, шире линия. */
  const farK = (p: THREE.Vector3): number => Math.max(1, Math.min(DOLL.max, camera.position.distanceTo(p) / DOLL.ref));
  const poses = new Map<string, Pose>();
  let bodiesCam = "";
  function drawBodies(s: Snapshot): void {
    heads.clear();
    poses.clear();
    for (const ch of s.chairs) {
      if (ch.owner === store.me.key) continue;
      const pose = poseOf(ch, s);
      if (!pose) continue;
      poses.set(ch.id, pose);
      const body = new THREE.Group();
      body.userData.by = pose.by;
      const mat = inkOf(pose.ink), S = V(pose.s), H = V(pose.head), L = V(handRest(pose.left, ch, ch.pose.tuck ? 1 : 0, ch.hand.length)), base = V({ ...pose.s, h: -7 });
      // Правое плечо — справа от взгляда в середину стола.
      const r = Math.hypot(pose.s.x, pose.s.y) || 1, rightDir = new THREE.Vector3(pose.s.y / r, 0, -pose.s.x / r);
      const shL = S.clone().addScaledVector(rightDir, -DOLL.bar), shR = S.clone().addScaledVector(rightDir, DOLL.bar);
      body.add(stick(base, S, DOLL.spine, mat), stick(shL, shR, DOLL.spine, mat), ball(shL, DOLL.spine, mat), ball(shR, DOLL.spine, mat));
      // Левая рука с картами — всегда: и с головой у тела, и когда голова ушла на ту сторону стола (рука с ней).
      body.add(stick(shL, L, DOLL.arm * farK(L), mat), ball(L, DOLL.hand * farK(L), mat));
      if (pose.away) {
        // Ушёл головой на ту сторону стола — к голове ниточка его цвета, руки ушли с головой.
        const tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([S, H]), new THREE.LineDashedMaterial({ color: pose.ink, dashSize: 0.35, gapSize: 0.3, transparent: true, opacity: 0.6 }));
        tether.computeLineDistances();
        body.add(tether);
      } else {
        body.add(stick(S, H, DOLL.spine * farK(H), pose.strained ? inkOf("#e0413a") : mat));
        if (pose.right && Math.hypot(pose.right.x - (pose.s.x + rightDir.x * DOLL.bar), pose.right.y - (pose.s.y + rightDir.z * DOLL.bar)) <= DOLL.reach) {
          const Rh = V(pose.right);
          body.add(stick(shR, Rh, DOLL.arm * farK(Rh), mat), ball(Rh, DOLL.hand * farK(Rh), mat));
          body.userData.right = Rh;
        }
      }
      // Голова — кружок его цвета с именем, всегда к камере; глубина честная — стол её перекрывает.
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex(pose.name, pose.ink) }));
      head.scale.set(2, 2.5, 1);
      head.center.set(0.5, 1 - 128 / 320);
      head.position.copy(H);
      head.userData.head = pose.by;
      body.add(head);
      heads.add(body);
    }
  }

  // ——— карты ———
  const cards = new Map<string, CardObj>();
  const cardRoot = new THREE.Group();
  scene.add(cardRoot);
  const fromOf = new Map<string, From>();
  function cardObj(id: string): CardObj {
    let o = cards.get(id);
    if (o) return o;
    const group = new THREE.Group();
    const front = new THREE.Mesh(cardShape, new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05 }));
    const back = new THREE.Mesh(cardShape, new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05 }));
    back.rotation.y = Math.PI;
    back.position.z = -0.001;
    front.castShadow = back.castShadow = true;
    front.userData.card = back.userData.card = id;
    // Выделена лассо — рамка цвета выделившего.
    const ring = new THREE.LineLoop(cardEdge, new THREE.LineBasicMaterial({ color: 0xf2c14e, linewidth: 2 }));
    ring.visible = false;
    group.add(front, back, ring);
    o = { group, front, back, ring, target: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 }, faceUrl: "", backUrl: "" };
    cards.set(id, o);
    cardRoot.add(group);
    return o;
  }
  /** Лицо и рубашка по снимку: лица не видно — с обеих сторон рубашка. */
  function dress(o: CardObj, c: SeenCard, s: Snapshot): void {
    // Лицо от меня закрыто, а карта лицом ко мне (моя рука, вывернутая наружу) — не рубашка, а «палец» (`finger.ts`).
    const backUrl = artUrl(s.rules, undefined, look), faceUrl = c.face ? artUrl(s.rules, c.face, look) : `finger:${fingerKind(c.id)}`;
    const by = s.picks[c.id];
    o.ring.visible = !!by;
    if (by) (o.ring.material as THREE.LineBasicMaterial).color.set(s.people.find((p) => p.key === by)?.ink ?? "#f2c14e");
    if (o.faceUrl !== faceUrl) { o.faceUrl = faceUrl; (o.front.material as THREE.MeshBasicMaterial).map = c.face ? texture(faceUrl, draw) : fingerTexture(c.id); (o.front.material as THREE.MeshBasicMaterial).needsUpdate = true; }
    if (o.backUrl !== backUrl) { o.backUrl = backUrl; (o.back.material as THREE.MeshBasicMaterial).map = texture(backUrl, draw); (o.back.material as THREE.MeshBasicMaterial).needsUpdate = true; }
  }
  /** Лежит на сукне: лицом вверх (`up`) или рубашкой, повёрнута по часовой на `angle`. */
  const lying = (x: number, y: number, h: number, angle: number, up: boolean): Place => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, -angle * DEG, 0, "YXZ"));
    if (!up) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    return { pos: new THREE.Vector3(x, h, y), quat: q, scale: 1 };
  };
  /** Веер руки стула под углом `angle`: лицом к хозяину (наружу), наклонён от него; своя — ближе и крупнее. */
  const fanned = (angle: number, k: number, n: number, mine: boolean): Place => {
    const a = angle * DEG, out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const s = k - (n - 1) / 2, step = mine ? Math.min(0.62, 5.2 / Math.max(1, n)) : Math.min(0.32, 3.5 / Math.max(1, n));
    const c = out.clone().multiplyScalar(mine ? R + 0.4 : R + 0.9).add(right.clone().multiplyScalar(s * step)).setY((mine ? 2.1 : 1.3) - s * s * 0.004 + k * 0.002);
    const basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, new THREE.Vector3(0, 1, 0), out));
    const lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (mine ? -40 : -15) * DEG);
    const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -s * (mine ? 3 : 5) * DEG);
    return { pos: c, quat: basis.multiply(lean).multiply(roll), scale: mine ? 1.1 : 0.8 };
  };
  /**
   * СВОЯ РУКА — там же, где у 2D-стола: места карт на экране считает его же раскладка (`mineGeomOf`: веер, ряд,
   * стопка, спрятана — поза стула), а здесь экранная точка переводится в оси камеры на глубине `D`.
   */
  let blend: PoseBlend | undefined;
  const glass = () => ({ w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) });
  /**
   * Моя рука на экране: несомую карту в ней не считают (её место — у пальца), а если её держат над рукой — в руке
   * щель под неё (`drag.gap`): соседи расступаются, как у стола.
   */
  const handCards = () => { const ch = myChair(); return ch ? ch.hand.filter((c) => !(drag?.moved && c.id === drag.id)) : []; };
  const handGeom = (): Geom | null => { const ch = myChair(); return ch ? mineGeomOf(glass(), ch.pose, handCards().length + (drag?.moved && drag.gap !== null ? 1 : 0), ch.id, blend) : null; };
  /** Карта у глаза в точке экрана (середина `x, y`, ширина `w`, поворот) — поверх всего, чуть крупнее: в окне HUD. */
  const screenPlace = (sp: { x: number; y: number; w: number; angle: number }): Place => {
    const g = glass(), D = 3, vh = 2 * D * Math.tan((camera.fov * DEG) / 2), vw = vh * (g.w / g.h);
    return { pos: new THREE.Vector3((sp.x / g.w - 0.5) * vw, -(sp.y / g.h - 0.5) * vh, -D), quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sp.angle * DEG), scale: ((sp.w / g.w) * vw * HOVER.grow) / CARD_W, onCamera: true };
  };
  /**
   * РУКА В МИРЕ — одна на всех: карты держит левая рука тела, лицом к хозяину, а поза стула считается от неё той же
   * раскладкой, что и у 2D (`handPlanBlend`): веер, ряд, стопкой. Два места руки:
   *   в кадре головы (`pitch` прислан: вид «голова») — карты стоят в осях взгляда, внизу кадра, и куда бы голова ни
   *     смотрела, они на том же месте экрана; остальные видят ту же руку там же, где она у головы;
   *   у тела (вид «орбита», старый клиент) — рядом с левой рукой тела, лицом к хозяину.
   * Положена (`tuck`): рука ложится на сукно у своего места, стопка с ней — рубашкой вверх (вывернутая — лицом), и с взглядом
   * она больше не двигается.
   */
  interface HandBody { yaw: number; left: Point3 }
  const HAND = { room: 6, size: 0.85, lean: -22, lift: 0.55, pop: 1.3 } as const;
  /**
   * Рука в кадре: где перед глазом (оси камеры), какой ширины карта (`card`, в единицах стола на этом расстоянии) и насколько наклонена.
   * Размер руки не зависит от размера карты на столе (`CARD_W`): рука привязана к худу и всем рисуется одинаково.
   */
  const CAMHAND = { at: new THREE.Vector3(0, -0.8, -2.3), card: 0.2925, room: 3.1, tilt: -12, pop: 0.5, near: 0.45, others: 1.7 } as const;
  const camBasis = (yaw: number, pitch: number): THREE.Matrix4 => {
    const y = yaw * DEG, p = pitch * DEG, f = new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)), r = new THREE.Vector3(Math.cos(y), 0, Math.sin(y));
    return new THREE.Matrix4().makeBasis(r, r.clone().cross(f), f.clone().negate());
  };
  /** Точка руки в кадре головы `head`, взгляд `yaw`, `pitch`. */
  const camHandPoint = (head: Point3, yaw: number, pitch: number): Point3 => { const at = CAMHAND.at.clone().applyMatrix4(camBasis(yaw, pitch)); return { x: head.x + at.x, y: head.y + at.z, h: head.h + at.y }; };
  /** Помещается ли веер на `n` карт в комнате `room`: угол разлёта и опускание краёв в пределах — иначе рука в ряд, веер выбрать нельзя. */
  const FAN = { maxDeg: 70, maxDrop: 1.6 };
  function fanFitsN(n: number, room: number): boolean {
    if (n <= 1) return true;
    const plan = handPlanBlend({ wide: 1, lift: 0.5 }, true, n, 1, 1.4, room), angles = plan.map((p) => p.angle);
    return Math.max(...angles) - Math.min(...angles) <= FAN.maxDeg && Math.max(...plan.map((p) => p.y)) <= FAN.maxDrop;
  }
  const fanFitsNow = (): boolean => { const ch = myChair(); return !ch || fanFitsN(ch.hand.length, CAMHAND.room); };
  /** Место в осях камеры: карта `k` из `n` руки стула `ch`. `fovK` — во сколько раз поле зрения уже обычного: рука на экране не растёт. */
  const camHandLocal = (ch: Chair, k: number, n: number, up: boolean, b: PoseBlend, fovK: number, sizeK = 1, off = { x: 0, y: 0 }): Place => {
    const plan = handPlanBlend(b, ch.pose.fan && fanFitsN(n, CAMHAND.room), n, 1, 1.4, CAMHAND.room)[k] ?? { x: 0, y: 0, angle: 0 }, s = (CAMHAND.card / CARD_W) * fovK * sizeK, u = CAMHAND.card * fovK * sizeK;
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), CAMHAND.tilt * DEG).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -plan.angle * DEG));
    if (up) quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    return { pos: new THREE.Vector3(CAMHAND.at.x + off.x * fovK + plan.x * u, (CAMHAND.at.y + off.y) * fovK - plan.y * u, CAMHAND.at.z + k * 0.004), quat, scale: s, onCamera: true };
  };
  /** То же место в мире: голова `head` смотрит `yaw`, `pitch`. */
  const camHandWorld = (local: Place, head: Point3, yaw: number, pitch: number): Place => {
    const m = camBasis(yaw, pitch), q = new THREE.Quaternion().setFromRotationMatrix(m);
    return { pos: local.pos.clone().applyMatrix4(m).add(V(head)), quat: q.multiply(local.quat), scale: local.scale };
  };
  /** Где лежит стопка положенной руки: у самого борта у своего места, чуть слева от аватара — не там, где рука у головы: с взглядом она не ходит. */
  function stackSpot(ch: Chair): { x: number; y: number } {
    const s = seatPoint(ch.angle, R - 1.0), r = Math.hypot(s.x, s.y) || 1;
    return seatOnFelt({ x: s.x - (s.y / r) * 1.4, y: s.y + (s.x / r) * 1.4 });
  }
  /** Карта `k` положенной руки на сукне. */
  const stackPlace = (ch: Chair, k: number, up: boolean): Place => { const at = stackSpot(ch); return lying(at.x, at.y, 0.03 + k * PILE_STEP, ((-ch.angle % 360) + 360) % 360, up); };
  /** Между рукой у головы и стопкой на сукне: `down` 0 — в руке, 1 — лежит. */
  const laid = (held: Place, ch: Chair, k: number, up: boolean, down: number): Place => {
    if (down <= 0) return held;
    const lie = stackPlace(ch, k, up);
    return { pos: held.pos.clone().lerp(lie.pos, down), quat: held.quat.clone().slerp(lie.quat, down), scale: held.scale + (1 - held.scale) * down, over: held.over };
  };
  const myHandBody = (ch: Chair): HandBody => { const m = myHeadNow(ch); return { yaw: m.yaw, left: m.hand }; };
  /** Рука у тела: место `k` из `n` на руке стула `ch` рядом с левой рукой тела; `up` — карта вывернута рубашкой к хозяину. */
  const handPlace = (hb: HandBody, ch: Chair, k: number, n: number, up: boolean, b: PoseBlend, over?: true, lean: number = HAND.lean, size: number = HAND.size): Place => {
    const g = gazeOf(hb.yaw), normal = new THREE.Vector3(-g.x, 0, -g.y).normalize(), upv = new THREE.Vector3(0, 1, 0);
    const right = upv.clone().cross(normal).normalize();
    const plan = handPlanBlend(b, ch.pose.fan, n, 1, 1.4, HAND.room)[k] ?? { x: 0, y: 0, angle: 0 };
    const pos = V(hb.left).add(new THREE.Vector3(0, HAND.lift, 0)).addScaledVector(right, plan.x * size * CARD_W).addScaledVector(upv, -plan.y * size * CARD_W).addScaledVector(normal, k * 0.004);
    const basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upv, normal));
    const held = basis.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean * DEG)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -plan.angle * DEG));
    if (up) held.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    return laid({ pos, quat: held, scale: size, over }, ch, k, up, tuckOf(b));
  };
  /** Чужая рука: в кадре его головы, если он прислал взгляд вверх-вниз, иначе — у его тела. */
  const othersHand = (pose: Pose, ch: Chair, k: number, n: number, up: boolean): Place => {
    const b = blendOf(ch.pose);
    if (pose.pitch === undefined) return handPlace({ yaw: pose.yaw, left: pose.left }, ch, k, n, up, b);
    return laid(camHandWorld(camHandLocal(ch, k, n, up, b, 1, CAMHAND.others), pose.head, pose.gaze ?? pose.yaw, pose.pitch), ch, k, up, tuckOf(b));
  };
  /** Где кисть левой руки: у головы — а когда рука положена (`down` 0…1), она на стопке на сукне, сверху. */
  function handRest(left: Point3, ch: Chair, down: number, cards: number): Point3 {
    if (down <= 0) return left;
    const at = stackSpot(ch), h = 0.03 + cards * PILE_STEP + 0.3;
    return { x: left.x + (at.x - left.x) * down, y: left.y + (at.y - left.y) * down, h: left.h + (h - left.h) * down };
  }
  /** Поза моей руки под пальцем (плавная) или ступенью стула. */
  const mineBlend = (ch: Chair): PoseBlend => blend ?? blendOf(ch.pose);
  /** Вид «сверху»: рука у края экрана, как у 2D-стола (`mineGeomOf`), а не на столе — так её удобнее брать. */
  const inHand = (k: number, geom: Geom): Place => {
    const g = glass(), sl = geom.slots[k]!, D = 5, vh = 2 * D * Math.tan((camera.fov * DEG) / 2), vw = vh * (g.w / g.h);
    const pos = new THREE.Vector3((sl.x / g.w - 0.5) * vw, -(sl.y / g.h - 0.5) * vh, -D + k * 0.004);
    return { pos, quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sl.angle * DEG), scale: ((geom.w / g.w) * vw) / CARD_W, onCamera: true };
  };
  // ——— рука-стопка: верхний язычок оттянули вверх — левая рука держит все карты над столом, как колоду ———
  const CARRY_H = 0.6;
  let handCarry: { x: number; y: number; sx: number; sy: number; zoneTop: number } | null = null;
  // ——— моя левая рука в кадре (вид «голова»): перед глазом, снизу, держит карты; отстаёт от взгляда ———
  const fpsArm = new THREE.Group();
  handRoot.add(fpsArm);
  let fpsSig = "";
  function placeFpsArm(show: boolean, fovK: number, off: { x: number; y: number }): void {
    const sig = show ? [fovK.toFixed(2), off.x.toFixed(3), off.y.toFixed(3), store.me.ink].join("|") : "";
    if (sig === fpsSig) return;
    fpsSig = sig;
    fpsArm.clear();
    if (!show) return;
    // Второй проход рисует только свой слой, а свет на нём не горит: рука — безтеневой материал цвета хозяина.
    const mat = inkFlat(store.me.ink), at = new THREE.Vector3(CAMHAND.at.x + off.x * fovK, (CAMHAND.at.y + off.y) * fovK - CAMHAND.card * 0.78 * fovK, CAMHAND.at.z + 0.06);
    const from = new THREE.Vector3(at.x * 0.6 + 0.35 * fovK, at.y - 1.3 * fovK, at.z + 0.7);
    fpsArm.add(stick(from, at, 0.05 * fovK, mat), ball(at, 0.085 * fovK, mat));
    fpsArm.traverse((n) => { n.layers.set(HAND_LAYER); if ((n as THREE.Mesh).isMesh) (n as THREE.Mesh).castShadow = false; });
  }
  /** Места моих карт каждый кадр: несомая над рукой стоит в щели, выше соседей и ближе к глазу. */
  function retargetMine(): void {
    const ch = myChair();
    if (!ch) return;
    const list = handCards(), gap = drag?.moved && !drag.group ? drag.gap : null, n = list.length + (gap !== null ? 1 : 0), b = mineBlend(ch);
    const slotOf = (k: number) => (gap !== null && k >= gap ? k + 1 : k);
    const flip = (p: Place, up: boolean) => { if (up) p.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)); return p; };
    // Левая рука держит всю руку стопкой над столом — её несут, как колоду.
    if (handCarry) {
      list.forEach((c, k) => { const o = cards.get(c.id); if (o) o.target = { ...lying(handCarry!.x, handCarry!.y, CARRY_H + k * PILE_STEP, ((-ch.angle % 360) + 360) % 360, !!c.up), over: true }; });
      placeFpsArm(false, 1, { x: 0, y: 0 });
      return;
    }
    if (camMode === "top") {
      // Рука на худе внизу экрана; положена — карты на столе стопкой (а не пусто), как в виде «голова».
      const geom = mineGeomOf(glass(), ch.pose, n, ch.id, { wide: b.wide, lift: Math.max(0.5, b.lift) }), down = tuckOf(b);
      const world = (p: Place): Place => { camera.updateMatrixWorld(); return { pos: p.pos.clone().applyMatrix4(camera.matrixWorld), quat: camera.quaternion.clone().multiply(p.quat), scale: p.scale }; };
      for (const c of ch.hand) {
        const o = cards.get(c.id), k = list.indexOf(c);
        if (!o || k < 0) continue;
        const hud = flip(inHand(slotOf(k), geom), !!c.up);
        o.target = down <= 0 ? hud : { ...laid(world(hud), ch, k, !!c.up, down), over: true };
      }
      const o = gap !== null && drag ? cards.get(drag.id) : undefined;
      if (o) {
        // Ближе к глазу — не ниже на экране: место по экрану сохраняется (всё ×r), и только потом — выше соседей.
        const t = inHand(gap!, geom), r = (-t.pos.z - HOVER.near) / -t.pos.z;
        t.pos.x *= r; t.pos.y = (t.pos.y + HOVER.up * CARD_H * t.scale) * r; t.pos.z += HOVER.near; t.scale *= r * HOVER.grow;
        o.target = t;
      }
      return;
    }
    if (camMode === "head") {
      const down = tuckOf(b), fovK = Math.tan((rig.fov * DEG) / 2) / Math.tan((CAM.fov.base * DEG) / 2), head = { x: camera.position.x, y: camera.position.z, h: camera.position.y }, off = swayOffset();
      placeFpsArm(down <= 0 && list.length > 0 && !handCarry, fovK, off);
      const place = (k: number, up: boolean): Place => {
        const local = camHandLocal(ch, k, n, up, b, fovK, 1, off);
        return down <= 0 ? local : { ...laid(camHandWorld(local, head, rig.yaw, rig.pitch), ch, k, up, down), over: true };
      };
      for (const c of ch.hand) { const o = cards.get(c.id), k = list.indexOf(c); if (o && k >= 0) o.target = place(slotOf(k), !!c.up); }
      const o = gap !== null && drag ? cards.get(drag.id) : undefined;
      if (o) {
        const t = place(gap!, false);
        if (t.onCamera) { t.pos.y += CAMHAND.pop * fovK; t.pos.z += CAMHAND.near; } else t.pos.y += CAMHAND.pop;
        t.scale *= HOVER.grow;
        o.target = t;
      }
      return;
    }
    // Орбита: рука рядом с левой рукой тела; свой вид — лицом к камере.
    const hb = myHandBody(ch), lean = -Math.max(15, Math.min(80, Math.atan2(camera.position.y - hb.left.h - HAND.lift, Math.hypot(camera.position.x - hb.left.x, camera.position.z - hb.left.y)) / DEG));
    for (const c of ch.hand) { const o = cards.get(c.id), k = list.indexOf(c); if (o && k >= 0) o.target = handPlace(hb, ch, slotOf(k), n, !!c.up, b, true, lean); }
    const o = gap !== null && drag ? cards.get(drag.id) : undefined;
    if (o) {
      const t = handPlace(hb, ch, gap!, n, false, b, true, lean), toEye = camera.position.clone().sub(t.pos).setLength(HOVER.near);
      t.pos.add(toEye).y += HAND.pop;
      t.scale *= HOVER.grow;
      o.target = t;
    }
  }
  const pileAngle = (p: Pile) => (p as Pile & { angle?: number }).angle ?? 0;
  function layout(s: Snapshot): void {
    drawBodies(s);
    const seen = new Set<string>();
    fromOf.clear();
    const mine = myChair()?.id;
    s.felt.forEach((c, i) => {
      const o = cardObj(c.id);
      dress(o, c, s);
      o.target = lying(c.x, c.y, 0.01 + i * FELT_STEP, c.angle, c.up);
      fromOf.set(c.id, { in: "felt" });
      seen.add(c.id);
    });
    for (const p of s.piles) p.cards.forEach((c, i) => {
      const o = cardObj(c.id);
      dress(o, c, s);
      const ring = p.pose === "ring" && c.turn !== undefined ? ringTurned({ x: p.x, y: p.y }, c.turn) : null;
      const landing = pileLanding?.pile === p.id && p.x === pileLanding.was.x && p.y === pileLanding.was.y && performance.now() < pileLanding.until ? pileLanding : null;
      const held = pileCarry?.pile === p.id ? pileCarry : landing;
      o.target = held
        ? lying(held.x, held.y, 0.01 + (held === pileCarry ? 0.6 : 0) + i * PILE_STEP, pileAngle(p), !!c.up)
        : ring ? lying(ring.x, ring.y, 0.01 + i * FELT_STEP, ring.angle, !!c.up) : lying(p.x, p.y, 0.01 + i * PILE_STEP, pileAngle(p), !!c.up);
      fromOf.set(c.id, { in: "pile", pile: p.id, top: i === p.cards.length - 1 || !!ring });
      seen.add(c.id);
    });
    for (const ch of s.chairs) ch.hand.forEach((c, i) => {
      const o = cardObj(c.id);
      dress(o, c, s);
      const pose = poses.get(ch.id);
      if (pose) o.target = othersHand(pose, ch, i, ch.hand.length, !!c.up);
      else if (ch.id !== mine) { o.target = fanned(ch.angle, i, ch.hand.length, false); if (c.up) o.target.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)); }
      fromOf.set(c.id, { in: "hand", chair: ch.id, mine: ch.id === mine, i });
      seen.add(c.id);
    });
    // ЧУЖИЕ КАРТЫ В ВОЗДУХЕ — у них в руке, над тем местом, куда их несут.
    for (const c of store.carries) {
      if (c.by === store.me.key || !cards.has(c.id)) continue;
      const o = cards.get(c.id)!;
      dress(o, c.card, s);
      const over = c.over;
      const at = over.in === "felt" ? { x: over.x, y: over.y } : over.in === "deck" ? s.piles.find((p) => p.id === over.pile) : (() => { const ch = s.chairs.find((x) => x.id === over.chair); return ch ? seatPoint(ch.angle, R - 1.2) : null; })();
      if (at) o.target = lying(at.x, at.y, 1.4, over.in === "felt" ? over.angle : 0, over.in === "felt" ? over.up : !!c.card.up);
    }
    // НЕСОМАЯ МНОЙ — у пальца: над рукой — в щели руки (`retargetMine`); над столом — там, где решил палец.
    retargetMine();
    if (drag?.moved && drag.gap === null) {
      const o = cards.get(drag.id);
      if (o && drag.spot) o.target = screenPlace(drag.spot);
      else if (o && drag.place) o.target = drag.place;
    }
    // Отпущенная — ждёт ответа стола там, куда легла.
    if (landing && performance.now() < landing.until && fromKey(landing.id) === landing.key) { const o = cards.get(landing.id); if (o) o.target = landing.place; }
    for (const [id, o] of cards) if (!seen.has(id)) { cardRoot.remove(o.group); cards.delete(id); }
    draw();
  }
  /** Где карта по снимку — ключом: поменялся — стол ответил, и ждать ответа на месте больше нечего. */
  const fromKey = (id: string) => { const f = store.state.felt.find((c) => c.id === id); return JSON.stringify(fromOf.get(id) ?? null) + (f ? `${f.x},${f.y},${f.up}` : ""); };
  let landing: { id: string; place: Place; key: string; until: number } | null = null;

  // ——— кадр: карты догоняют свои места ———
  let lastTick = performance.now();
  // ——— моя правая рука — пока несу карту над столом: от правого плеча к карте ———
  const myArm = new THREE.Group();
  scene.add(myArm);
  function armPose(): void {
    myArm.clear();
    const ch = myChair();
    if (!ch || !heads.visible) return;
    const sh = shoulders3(ch.angle, stanceNow()), r = Math.hypot(sh.x, sh.y) || 1;
    const shR = V(sh).addScaledVector(new THREE.Vector3(sh.y / r, 0, -sh.x / r), DOLL.bar);
    const o = drag?.moved ? cards.get(drag.id) : undefined;
    let grip: THREE.Vector3;
    if (o && !o.target.onCamera && !o.target.over && o.group.visible) {
      // Кисть — у ближнего ко мне края карты, чуть ниже: держит её, а не лежит на ней.
      const at = o.group.getWorldPosition(new THREE.Vector3());
      grip = at.clone().add(new THREE.Vector3(sh.x - at.x, 0, sh.y - at.z).setLength(CARD_H * 0.45)).add(new THREE.Vector3(0, -0.12, 0));
    } else {
      // Без карты над столом — рука на том, с чем вожусь: та же точка, что видят остальные. Несу в свою руку — она у глаза, рука не нужна.
      const at = drag?.moved ? (drag.gap === null ? rightAt : null) : restRight;
      if (!at) return;
      grip = new THREE.Vector3(at.x, restH(at, ch.id), at.y);
    }
    const mat = inkOf(store.me.ink);
    myArm.add(stick(shR, grip, DOLL.arm * farK(grip), mat), ball(grip, DOLL.hand * farK(grip), mat));
    myArm.userData.grip = grip;
  }
  function tick(): void {
    frame = 0;
    const w = host.clientWidth, h = host.clientHeight;
    if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    let moving = false;
    const now = performance.now(), dt = Math.min(0.05, Math.max(0.001, (now - lastTick) / 1000));
    const sinceMs = Math.min(250, now - lastTick);
    lastTick = now;
    // Камера и моя рука — до пружин: рука едет с головой, и пружины догоняют уже новое место.
    if (camMode === "head" || camMode === "top") { const was = rig.lean; rig.lean = neckStep(neck, rig.lean, sinceMs); if (rig.lean !== was || neck.back > 0 || rig.lean > NECK.free || neck.rest > 0) { applyRig(); sendBody(); moving = true; } }
    if (camMode === "head") {
      // Рука отстаёт от взгляда: повернул — она чуть позади и возвращается; взгляд вниз — рука выше, вверх — ниже.
      const dyaw = wrap(rig.yaw - sway.yaw), dpitch = rig.pitch - sway.pitch, lim = (v: number) => Math.max(-SWAY.max, Math.min(SWAY.max, v)), k = Math.exp((-sinceMs / 1000) * SWAY.decay);
      sway.yaw = rig.yaw; sway.pitch = rig.pitch;
      sway.x = lim(sway.x - dyaw * SWAY.lag) * k; sway.y = lim(sway.y - dpitch * SWAY.lag) * k;
      if (Math.abs(sway.x) > 0.004 || Math.abs(sway.y) > 0.004) moving = true;
    }
    retargetMine();
    for (const [id, o] of cards) {
      const g = o.group, t = o.target;
      // Сменила место между миром и рукой — пересадить, сохранив, где она на экране, и долететь.
      const parent = t.onCamera ? handRoot : cardRoot;
      if (g.parent !== parent) { camera.updateMatrixWorld(); parent.attach(g); g.userData.v = new THREE.Vector3(); g.userData.sv = 0; }
      const layer = t.onCamera || t.over ? HAND_LAYER : 0;
      if (g.userData.layer !== layer) { g.userData.layer = layer; g.traverse((n) => n.layers.set(layer)); }
      // Над окном HUD несомую рисует сам HUD — поверх окна; здесь её нет.
      g.visible = !(drag?.moved && drag.id === id && drag.spot);
      // Своя рука — не отбрасывает тени: она у глаза, её тень легла бы на полстола.
      o.front.castShadow = o.back.castShadow = !t.onCamera && !t.over;
      if (!g.userData.placed) { g.position.copy(t.pos); g.quaternion.copy(t.quat); g.scale.setScalar(t.scale); g.userData.placed = true; g.userData.v = new THREE.Vector3(); g.userData.sv = 0; continue; }
      // ПРУЖИНА: ускорение к месту, затухание скоростью; поворот догоняет плавно.
      // Мелкими шагами: жёсткая пружина на целом кадре разлетается.
      const sp = drag?.id === id ? SPRING_HELD : SPRING, c = 2 * Math.sqrt(sp.k) * sp.damp;
      const v = g.userData.v as THREE.Vector3, steps = Math.ceil(dt * 240), h = dt / steps, d = new THREE.Vector3();
      let sc = g.scale.x, sv = g.userData.sv as number;
      for (let i = 0; i < steps; i++) {
        d.copy(t.pos).sub(g.position);
        v.addScaledVector(d, sp.k * h).addScaledVector(v, -c * h);
        g.position.addScaledVector(v, h);
        // На сукно карта ложится со стуком, а не пружинит сквозь стол.
        if (!t.onCamera && t.pos.y < 0.5 && g.position.y < t.pos.y) { g.position.y = t.pos.y; v.y = 0; }
        sv += ((t.scale - sc) * sp.k - sv * c) * h;
        sc += sv * h;
      }
      g.userData.sv = sv;
      g.scale.setScalar(sc);
      d.copy(t.pos).sub(g.position);
      const ds = t.scale - sc;
      g.quaternion.slerp(t.quat, 1 - Math.exp(-dt * (drag?.id === id ? 30 : 14)));
      if (d.lengthSq() < 1e-6 && v.lengthSq() < 1e-6 && Math.abs(ds) < 1e-4 && g.quaternion.angleTo(t.quat) < 1e-3) { g.position.copy(t.pos); g.quaternion.copy(t.quat); g.scale.setScalar(t.scale); v.set(0, 0, 0); g.userData.sv = 0; }
      else moving = true;
    }
    // Камера сдвинулась — толщина шеи и рук чужих тел пересчитана под новую дальность.
    const camSig = camera.position.toArray().map((v) => v.toFixed(1)).join();
    if (camSig !== bodiesCam) { bodiesCam = camSig; drawBodies(store.state); }
    armPose();
    placeTabs();
    placeBodies();
    if (placeChairs(dt)) moving = true;
    placeMyBody();
    // Своя рука у глаза — вторым проходом поверх всего: борт стола, подошедший к камере вплотную, её не закрывает.
    camera.layers.set(0);
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    camera.layers.set(HAND_LAYER);
    renderer.render(scene, camera);
    renderer.autoClear = true;
    camera.layers.set(0);
    // Панели «лицом к камере» — повёрнуты, как камера; остальные стоят, как поставлены.
    for (const { obj, at } of panel3d.values()) if (at.tilt === "camera") obj.quaternion.copy(camera.quaternion);
    css.setSize(w, h);
    css.render(cssScene, camera);
    for (const f of frameHeard) f();
    host.dataset.cards = String(cards.size);
    host.dataset.felt = String(store.state.felt.length);
    const hand = myChair()?.hand.length ?? 0;
    host.dataset.hand = String(hand);
    if (moving) draw();
  }

  // ——— язычки стопок: лежат на столе у нижней кромки верхней карты, в той же позе ———
  /** Размер язычка в ширинах карты. Нарисован на холсте, лежит плашмя; тапнуть можно и рядом (`hit`). */
  const TAB = { w: 1, l: 0.5, hit: 1.4 };
  let pileGrab: { pile: string; dx: number; dy: number } | null = null;
  /** Ближайшая к точке `q` точка сукна: за борт стопку положить нельзя (как карту, `aim`). */
  const seatOnFelt = (q: { x: number; y: number }) => { const len = Math.hypot(q.x, q.y), max = R - 0.8, k = len > max ? max / len : 1; return { x: q.x * k, y: q.y * k }; };
  interface TabObj { mesh: THREE.Mesh; hit: THREE.Mesh; cv: HTMLCanvasElement; tex: THREE.CanvasTexture; key: string }
  const tabs = new Map<string, TabObj>();
  let litTabs = new Set<string>();
  let tabFn: ((pile: string, e: PointerEvent) => void) | null = null;
  const tabGeom = new THREE.PlaneGeometry(TAB.w, TAB.l), tabHitGeom = new THREE.PlaneGeometry(TAB.w * TAB.hit, TAB.l * 2);
  function drawTab(cv: HTMLCanvasElement, count: number, pin: boolean, lit: boolean): void {
    const c = cv.getContext("2d")!, W = cv.width, H = cv.height, r = H * 0.42, line = H * 0.08;
    c.clearRect(0, 0, W, H);
    // Плоский край — к стопке, скруглённый — наружу: закладка, торчащая из стопки.
    c.beginPath();
    c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, H - r); c.quadraticCurveTo(W, H, W - r, H); c.lineTo(r, H); c.quadraticCurveTo(0, H, 0, H - r); c.closePath();
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, lit ? BAR_LOOK.goldHi : BAR_LOOK.plateHi);
    g.addColorStop(1, lit ? BAR_LOOK.goldLo : BAR_LOOK.plateLo);
    c.fillStyle = g; c.fill();
    c.lineJoin = "round"; c.lineWidth = line; c.strokeStyle = T.black; c.stroke();
    // Две карты веером, число, кнопка-булавка.
    const ink = lit ? T.ink : BAR_LOOK.goldHi, cy = H * 0.5;
    for (const [dx, a] of [[-0.05, -0.28], [0.05, 0.2]] as const) {
      c.save(); c.translate(W * 0.2 + dx * W, cy); c.rotate(a);
      c.fillStyle = ink; c.strokeStyle = T.black; c.lineWidth = line * 0.7;
      c.beginPath(); c.roundRect(-H * 0.17, -H * 0.27, H * 0.34, H * 0.54, H * 0.05); c.fill(); c.stroke(); c.restore();
    }
    c.fillStyle = lit ? T.black : T.ink; c.textBaseline = "middle"; c.textAlign = "left";
    c.font = `${Math.round(H * 0.5)}px Tiny5, monospace`;
    c.fillText(String(count), W * 0.38, cy + H * 0.03);
    if (pin) { c.fillStyle = lit ? T.black : BAR_LOOK.goldHi; c.beginPath(); c.arc(W * 0.9, cy, H * 0.09, 0, Math.PI * 2); c.fill(); }
  }
  function makeTab(): TabObj {
    const cv = document.createElement("canvas");
    cv.width = 340; cv.height = Math.round(340 * (TAB.l / TAB.w));
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(tabGeom, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05 }));
    const hit = new THREE.Mesh(tabHitGeom, new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = -TAB.l * 0.25;
    mesh.add(hit);
    scene.add(mesh);
    return { mesh, hit, cv, tex, key: "" };
  }
  /** Язычок каждой стопки — у нижней (к её хозяину) кромки её нижней карты, плашмя на столе, в той же позе, что стопка: несут стопку — несут и его. */
  function placeTabs(): void {
    const seen = new Set<string>();
    for (const p of store.state.piles) {
      // Язычок — стопки, а не верхней карты: торчит из нижней, лежит на столе; верхнюю потянули — он остался.
      const base = p.pose === "ring" ? undefined : cards.get(p.cards[0]?.id ?? "");
      if (!base || !base.group.visible || (drag?.moved && drag.id === p.cards[0]!.id)) continue;
      seen.add(p.id);
      let t = tabs.get(p.id);
      if (!t) { t = makeTab(); t.hit.userData.pile = p.id; tabs.set(p.id, t); }
      const key = `${p.cards.length}|${p.pin}|${litTabs.has(p.id)}`;
      if (t.key !== key) { t.key = key; drawTab(t.cv, p.cards.length, !!p.pin, litTabs.has(p.id)); t.tex.needsUpdate = true; }
      base.group.updateMatrixWorld(true);
      const at = base.group.getWorldPosition(new THREE.Vector3()), k = base.group.scale.x, a = -pileAngle(p) * DEG, d = k * (CARD_H / 2 + TAB.l / 2);
      t.mesh.position.set(at.x + d * Math.sin(a), at.y + 0.004, at.z + d * Math.cos(a));
      t.mesh.rotation.set(-Math.PI / 2, a, 0, "YXZ");
      t.mesh.scale.setScalar(k);
    }
    for (const [id, t] of tabs) if (!seen.has(id)) { scene.remove(t.mesh); (t.mesh.material as THREE.Material).dispose(); t.tex.dispose(); tabs.delete(id); }
  }

  // ——— моё тело: то же, что видят другие; голова — камера, поэтому кружок с именем только когда камера ушла на другую сторону стола ———
  const myBody = new THREE.Group();
  scene.add(myBody);
  let myBodySig = "", myHead = { shown: false, s: { x: 0, y: 0, h: 0 } }, myHandDrawn: Point3 | null = null;
  /** Тело на моём стуле — плечи, шея, левая рука — от моей камеры; правую рисует `armPose`. Пересобирается, когда что-то сдвинулось. */
  function placeMyBody(): void {
    const ch = myChair(), who = store.state.people.find((p) => p.key === store.me.key);
    myBody.visible = heads.visible;
    if (!ch || !who || !heads.visible) { if (myBodySig) myBody.clear(); myBodySig = ""; return; }
    const f = camera.getWorldDirection(new THREE.Vector3()), yaw = Math.atan2(f.x, -f.z) / DEG, c = camera.position;
    const down = tuckOf(mineBlend(ch)), carry = handCarry ? `${handCarry.x.toFixed(2)},${handCarry.y.toFixed(2)}` : "", sig = [ch.angle, stanceNow(), down.toFixed(2), ch.hand.length, who.ink, who.name, c.x.toFixed(3), c.y.toFixed(3), c.z.toFixed(3), yaw.toFixed(2), camMode, carry].join("|");
    if (sig === myBodySig) return;
    myBodySig = sig;
    myBody.clear();
    const sh = shoulders3(ch.angle, stanceNow()), m = myHeadNow(ch), head = m.head, left = m.hand, away = m.away;
    const mat = inkOf(who.ink), S = V(sh), H = V(head), L = handCarry ? V({ x: handCarry.x, y: handCarry.y, h: CARRY_H - 0.15 }) : V(handRest(left, ch, down, ch.hand.length)), base = V({ ...sh, h: -7 });
    myHandDrawn = { x: L.x, y: L.z, h: L.y };
    const r = Math.hypot(sh.x, sh.y) || 1, rightDir = new THREE.Vector3(sh.y / r, 0, -sh.x / r);
    const shL = S.clone().addScaledVector(rightDir, -DOLL.bar), shR = S.clone().addScaledVector(rightDir, DOLL.bar);
    myBody.add(stick(base, S, DOLL.spine, mat), stick(shL, shR, DOLL.spine, mat), ball(shL, DOLL.spine, mat), ball(shR, DOLL.spine, mat));
    // Рука в кадре (`head`, `fov`) — перед самым глазом: кисть и предплечье там закрыли бы весь вид, рисуются только карты.
    if (camMode === "orbit" || camMode === "top" || down > 0.3 || handCarry) myBody.add(stick(shL, L, DOLL.arm * farK(L), mat), ball(L, DOLL.hand * farK(L), mat));
    if (away) {
      // Камера ушла на другую сторону стола — голова с ней: ниточка к ней и кружок с именем, как у других.
      const tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([S, H]), new THREE.LineDashedMaterial({ color: who.ink, dashSize: 0.35, gapSize: 0.3, transparent: true, opacity: 0.6 }));
      tether.computeLineDistances();
      myBody.add(tether);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex(who.name, who.ink) }));
      sprite.scale.set(2, 2.5, 1);
      sprite.center.set(0.5, 1 - 128 / 320);
      sprite.position.copy(H);
      myBody.add(sprite);
    } else if (camMode === "orbit" || camMode === "top") {
      myBody.add(stick(S, H, DOLL.spine * farK(H), mat));
      // Сверху голова видна: кружок с именем — как у остальных.
      if (camMode === "top") {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex(who.name, who.ink) }));
        sprite.scale.set(2, 2.5, 1);
        sprite.center.set(0.5, 1 - 128 / 320);
        sprite.position.copy(H);
        myBody.add(sprite);
      }
    }
    myHead = { shown: away || camMode === "top", s: sh };
  }

  // ——— стулья: место за столом, цвет — хозяина ———
  /**
   * СТУЛ — место игрока: на нём сидит его аватар, а встал — стоит рядом (стул отодвинут назад). Покинуть стул нельзя, можно
   * пересесть на свободный. Цвет — цвет хозяина, у свободного — серый. У крупье стула нет: он всегда стоит.
   * Размеры — в единицах стола (пол на -7, стол на человеческой высоте: одна единица — примерно 12 см).
   */
  const CHAIR = { seat: 3.4, thick: 0.35, seatY: -3.3, back: 3.8, leg: 0.32, floor: -7, radius: 7.9, pushed: 1.6, free: 0x7d8a86 };
  interface ChairObj { group: THREE.Group; mats: THREE.MeshLambertMaterial[]; ink: string; k: number }
  const chairRoot = new THREE.Group();
  scene.add(chairRoot);
  const chairObjs = new Map<string, ChairObj>();
  function makeChair(id: string): ChairObj {
    const group = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: CHAIR.free });
    const part = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), o = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, d + 0.16), outlineMat);
      m.position.set(x, y, z); o.position.copy(m.position);
      m.castShadow = true; m.userData.chair = id; o.userData.chair = id;
      group.add(o, m);
    };
    const { seat, thick, seatY, back, leg, floor } = CHAIR, half = seat / 2 - leg / 2 - 0.1, legH = seatY - thick / 2 - floor;
    part(seat, thick, seat, 0, seatY, 0);
    part(seat, back, leg, 0, seatY + thick / 2 + back / 2, seat / 2 - leg / 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(leg, legH, leg, sx * half, floor + legH / 2, sz * half);
    chairRoot.add(group);
    return { group, mats: [mat], ink: "", k: 0 };
  }
  /** Стулья на местах: цвет хозяина, у вставшего — отодвинут назад. Возвращает, движется ли ещё что-то. */
  function placeChairs(dt: number): boolean {
    let moving = false;
    const seen = new Set<string>();
    for (const ch of store.state.chairs) {
      if (ch.croupier) continue;
      seen.add(ch.id);
      const one = chairObjs.get(ch.id) ?? (chairObjs.set(ch.id, makeChair(ch.id)), chairObjs.get(ch.id)!);
      const who = ch.owner ? store.state.people.find((p) => p.key === ch.owner) : undefined;
      const ink = who?.ink ?? "";
      if (one.ink !== ink) { one.ink = ink; for (const m of one.mats) m.color.set(ink || CHAIR.free); }
      const stands = ch.owner ? (ch.owner === store.me.key ? stanceNow() : bodyOf(ch.owner, ch.angle).stance) === "stand" : false, want = stands ? 1 : 0;
      const first = one.group.userData.placed !== true;
      one.k = first ? want : one.k + (want - one.k) * Math.min(1, dt * 9);
      if (Math.abs(want - one.k) > 0.002) moving = true; else one.k = want;
      const at = seatPoint(ch.angle, CHAIR.radius + CHAIR.pushed * one.k), dir = seatPoint(ch.angle, 1);
      one.group.position.set(at.x, 0, at.y);
      one.group.rotation.y = Math.atan2(dir.x, dir.y);
      one.group.userData.placed = true;
    }
    for (const [id, one] of chairObjs) if (!seen.has(id)) { chairRoot.remove(one.group); chairObjs.delete(id); }
    return moving;
  }

  // ——— бок колоды: тело стопки под картами ———
  const bodies = new Map<string, THREE.Mesh>();
  /** Тело у каждой стопки из двух и больше карт — от нижней карты вверх на её высоту; несомую сверху карту в него не считают. */
  function placeBodies(): void {
    const seen = new Set<string>();
    for (const p of store.state.piles) {
      const base = p.pose === "ring" ? undefined : cards.get(p.cards[0]?.id ?? "");
      const n = p.cards.length - (drag?.moved && drag.id === p.cards.at(-1)?.id ? 1 : 0);
      if (!base || !base.group.visible || n < 2) continue;
      seen.add(p.id);
      let m = bodies.get(p.id);
      if (!m) { m = new THREE.Mesh(pileBodyGeom(n), pileBodyMat); scene.add(m); bodies.set(p.id, m); }
      const g = pileBodyGeom(n);
      if (m.geometry !== g) m.geometry = g;
      m.userData.layers = n;
      base.group.updateMatrixWorld(true);
      const at = base.group.getWorldPosition(new THREE.Vector3()), k = base.group.scale.x * 0.985;
      m.position.copy(at);
      m.rotation.set(-Math.PI / 2, -pileAngle(p) * DEG, 0, "YXZ");
      m.scale.set(k, k, base.group.scale.x);
    }
    for (const [id, m] of bodies) if (!seen.has(id)) { scene.remove(m); bodies.delete(id); }
  }

  // ——— палец ———
  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  const ndc = (e: { clientX: number; clientY: number }) => { const r = renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  const hitCard = (e: PointerEvent): string | null => {
    ray.setFromCamera(ndc(e), camera);
    const hit = ray.intersectObjects([...cards.values()].flatMap((o) => [o.front, o.back]), false)[0];
    return (hit?.object.userData.card as string | undefined) ?? null;
  };
  const hitTab = (e: PointerEvent): string | null => {
    ray.setFromCamera(ndc(e), camera);
    const hit = ray.intersectObjects([...tabs.values()].map((t) => t.hit), false)[0];
    return (hit?.object.userData.pile as string | undefined) ?? null;
  };
  const onFelt = (e: { clientX: number; clientY: number }): THREE.Vector3 | null => { ray.setFromCamera(ndc(e), camera); return ray.ray.intersectPlane(feltPlane, new THREE.Vector3()); };
  /** Можно ли взять: с сукна, верхнюю из стопки, из своей руки — и не под чужим пальцем. */
  const takeable = (id: string): boolean => {
    const f = fromOf.get(id), lock = store.state.locks[id];
    if (!f || (lock && lock !== store.me.key) || (store.state.picks[id] && !mine(id))) return false;
    if (lasso.on && mine(id)) return true;
    return f.in === "felt" || (f.in === "pile" && f.top) || (f.in === "hand" && f.mine);
  };
  /** `group` — несут выделенное лассо: отпустил — все выделенные туда же (`moveMany`), одним намерением. */
  let drag: { id: string; x: number; y: number; moved: boolean; hold: number; up: boolean; angle: number; group: boolean; gap: number | null; place: Place | null; where: Where | null; spot: { x: number; y: number; w: number; angle: number } | null; zone: { pile?: string; chair?: string; i: number } | null } | null = null;
  let zoneFn: Parameters<SceneApi["setZone"]>[0] = null;
  let restRight: { x: number; y: number } | null = null;
  let carriedAt = 0;
  /** Высота несомой карты над сукном — доля высоты головы (камеры), как у стола: камера выше — и карта выше. */
  const liftH = () => Math.max(0.4, Math.min(8, HEAD.lift * camera.position.y));
  /** Карта под пальцем: на высоте `liftH` там, где луч из глаза через палец её пересекает, — ровно под курсором. */
  const heldAt = (x: number, y: number, angle: number, up: boolean): Place | null => {
    ray.setFromCamera(ndc({ clientX: x, clientY: y }), camera);
    const at = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -liftH()), new THREE.Vector3());
    if (!at) return null;
    const p = lying(at.x, at.z, at.y, angle, up);
    p.scale = 1.06;
    return p;
  };
  /** Моя левая рука (с веером) — куда тянется правая, когда несу карту в свою руку: так это видят остальные. */
  const myLeftHand = (): { x: number; y: number } | null => {
    const ch = myChair();
    if (!ch) return null;
    const l = myHeadNow(ch).hand;
    return { x: l.x, y: l.y };
  };
  const mine = (id: string) => store.state.picks[id] === store.me.key;
  let lastTap = { id: "", at: 0 };
  /**
   * РАМКА РУКИ — видимые границы, за которые можно взяться двумя пальцами, даже если карта одна: охват карт руки с полями и не уже
   * `FRAME.minW`. Нет карт или рука положена — рамки нет.
   */
  const FRAME = { pad: 16, minW: 250, minH: 120, edge: 0 };
  function handFrame(): { x: number; y: number; w: number; h: number; edge: number } | null {
    const ch = myChair();
    if (!ch || camMode === "orbit" || handCarry || !ch.hand.length || tuckOf(mineBlend(ch)) > 0.05) return null;
    const r = renderer.domElement.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, seen = 0;
    const hw = CARD_W / 2, hh = CARD_H / 2;
    for (const c of ch.hand) {
      const o = cards.get(c.id);
      if (!o || (drag?.moved && drag.id === c.id)) continue;
      o.group.updateMatrixWorld(true);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const p = project(o.group.localToWorld(new THREE.Vector3(sx * hw, sy * hh, 0)));
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
      seen++;
    }
    if (!seen) return null;
    const cx = (x0 + x1) / 2, w = Math.max(FRAME.minW, x1 - x0 + 2 * FRAME.pad), h = Math.max(FRAME.minH, y1 - y0 + 2 * FRAME.pad);
    const x = Math.max(r.left + 4, Math.min(r.right - 4 - w, cx - w / 2)), y = (y0 + y1) / 2 - h / 2 - FRAME.edge / 2;
    return { x, y: y - FRAME.edge / 2, w, h: h + FRAME.edge, edge: FRAME.edge };
  }
  // ——— два пальца на руке: шире и уже (щипок), выше и ниже (в ряд, веер, положить) — поза руки под пальцами, отпустил — легла ———
  const POSE_PX = { wide: 100, lift: 120 };
  const live = new Map<number, { x: number; y: number; onHand: boolean }>();
  let poseG: { ids: [number, number]; d0: number; y0: number; b0: PoseBlend } | null = null;
  const onMineHand = (id: string | null): boolean => { const f = id ? fromOf.get(id) : undefined; return !!f && f.in === "hand" && !!f.mine; };
  const poseNow = (g: NonNullable<typeof poseG>): PoseBlend => {
    const a = live.get(g.ids[0])!, b = live.get(g.ids[1])!, clamp = (v: number) => Math.max(0, Math.min(1, v));
    return { wide: clamp(g.b0.wide + (Math.hypot(a.x - b.x, a.y - b.y) - g.d0) / POSE_PX.wide), lift: Math.max(0.5, clamp(g.b0.lift - ((a.y + b.y) / 2 - g.y0) / POSE_PX.lift)) };
  };
  renderer.domElement.addEventListener("pointermove", (e) => {
    const was = live.get(e.pointerId);
    if (!was) return;
    live.set(e.pointerId, { ...was, x: e.clientX, y: e.clientY });
    if (!poseG || !poseG.ids.includes(e.pointerId)) return;
    e.stopImmediatePropagation();
    blend = poseNow(poseG);
    layout(store.state);
  }, { capture: true });
  const liftFinger = (e: PointerEvent) => {
    live.delete(e.pointerId);
    if (!poseG || !poseG.ids.includes(e.pointerId)) return;
    const ch = myChair();
    poseG = null;
    const b = blend;
    blend = undefined;
    if (ch && b) store.send({ t: "pose", chair: ch.id, pose: snapPose(b, ch.pose) });
    layout(store.state);
  };
  renderer.domElement.addEventListener("pointerup", liftFinger, { capture: true });
  renderer.domElement.addEventListener("pointercancel", liftFinger, { capture: true });
  renderer.domElement.addEventListener("pointerdown", (e) => {
    const fr = handFrame();
    live.set(e.pointerId, { x: e.clientX, y: e.clientY, onHand: onMineHand(hitCard(e)) || (!!fr && e.clientX >= fr.x && e.clientX <= fr.x + fr.w && e.clientY >= fr.y && e.clientY <= fr.y + fr.h) });
    if (live.size === 2 && !poseG && !lasso.on && [...live.values()].some((p) => p.onHand)) {
      const ids = [...live.keys()] as [number, number], a = live.get(ids[0])!, b = live.get(ids[1])!, ch = myChair();
      if (ch) {
        // Первый палец мог уже взять карту или крутить взгляд — теперь они оба держат руку.
        if (drag && !drag.moved) { clearInterval(drag.hold); drag = null; orbit.enabled = camMode === "orbit"; }
        rigPtrs.clear();
        poseG = { ids, d0: Math.hypot(a.x - b.x, a.y - b.y), y0: (a.y + b.y) / 2, b0: mineBlend(ch) };
        e.stopImmediatePropagation();
        return;
      }
    }
    // Язычок — первым: он лежит у самой кромки стопки и перекрыл бы её верхнюю карту.
    const pile = tabFn ? hitTab(e) : null;
    if (pile) { e.stopImmediatePropagation(); tabFn!(pile, e); return; }
    const id = hitCard(e);
    if (!id || !takeable(id)) return;
    // Карту — пальцем; облёт — только по пустому.
    e.stopImmediatePropagation();
    startDrag(id, e);
  }, { capture: true });
  function startDrag(id: string, e: PointerEvent): void {
    orbit.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
    const f = fromOf.get(id)!;
    const c = f.in === "felt" ? store.state.felt.find((x) => x.id === id) : undefined;
    const my = myChair()?.angle ?? 0;
    drag = { id, x: e.clientX, y: e.clientY, moved: false, hold: 0, up: c ? c.up : f.in === "hand" ? true : !!store.state.piles.find((p) => p.id === (f as { pile: string }).pile)?.cards.find((x) => x.id === id)?.up, angle: c ? c.angle : ((-my % 360) + 360) % 360, group: lasso.on && mine(id), gap: null, place: null, where: null, spot: null, zone: null };
  }
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      if (!drag.group) store.send({ t: "grab", id: drag.id });
      drag.hold = window.setInterval(() => { if (drag) store.send({ t: "hold", id: drag.id }); }, HOLD_MS);
    }
    // Куда целит палец: над своей рукой — щель в руке и правая рука у левой; иначе — карта под пальцем над столом.
    const where = target(e, drag);
    const z = zoneFn?.(e.clientX, e.clientY) ?? null;
    drag.where = where;
    drag.zone = z && !drag.group ? (z.where.in === "deck" ? { pile: z.where.pile, i: z.where.i } : { chair: z.where.chair, i: z.where.i }) : null;
    drag.spot = drag.zone ? z!.spot : null;
    drag.gap = where.in === "hand" && !drag.group && where.chair === myChair()?.id ? where.i : null;
    const pile = where.in === "deck" ? store.state.piles.find((p) => p.id === where.pile) : undefined;
    // Над стопкой — карта уже над ней, наверху: видно, куда ляжет; рука остальным — на стопке.
    drag.place = drag.gap !== null || drag.spot ? null : pile && pile.pose !== "ring" ? lying(pile.x, pile.y, 0.25 + pile.cards.length * PILE_STEP, pileAngle(pile), drag.up) : heldAt(e.clientX, e.clientY, drag.angle, drag.up);
    const zonePile = drag.zone?.pile ? store.state.piles.find((p) => p.id === drag!.zone!.pile) : undefined;
    const zoneChair = drag.zone?.chair ? store.state.chairs.find((c) => c.id === drag!.zone!.chair) : undefined, zoneHand = zoneChair ? leftOf(zoneChair) : null;
    rightAt = drag.gap !== null ? myLeftHand() : zoneHand ? { x: zoneHand.x, y: zoneHand.y } : zonePile ? { x: zonePile.x, y: zonePile.y } : pile ? { x: pile.x, y: pile.y } : drag.place ? { x: drag.place.pos.x, y: drag.place.pos.z } : null;
    sendBody();
    const now = performance.now();
    if (!drag.group && now - carriedAt >= CARRY_EVERY_MS) { carriedAt = now; store.carry({ id: drag.id, over: where }); }
    layout(store.state);
  });
  const end = (e: PointerEvent) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    orbit.enabled = camMode === "orbit";
    clearInterval(d.hold);
    rightAt = null;
    sendBody(true);
    if (!d.moved && lasso.on) {
      // Лассо: тап выделяет карту или снимает выделение.
      store.send({ t: "pick", ids: [d.id], on: !mine(d.id) });
      draw();
      return;
    }
    if (d.group) {
      layout(store.state);
      store.send({ t: "moveMany", moves: groupMoves(target(e, d), d.id) });
      store.send({ t: "unpick" });
      draw();
      return;
    }
    if (!d.moved) {
      // Тап: второй подряд по той же карте — перевернуть.
      const now = performance.now();
      if (lastTap.id === d.id && now - lastTap.at < DOUBLE_MS) { store.send({ t: "turn", id: d.id }); lastTap = { id: "", at: 0 }; }
      else lastTap = { id: d.id, at: now };
      draw();
      return;
    }
    // Легла — ждёт ответа стола там, куда её положили (над сукном — опускается на сукно, в руку — в щель).
    const o = cards.get(d.id), to = target(e, d);
    if (o && to.in === "felt") landing = { id: d.id, place: lying(to.x, to.y, 0.01 + store.state.felt.length * FELT_STEP, to.angle, to.up), key: fromKey(d.id), until: performance.now() + 1500 };
    store.send({ t: "drop", id: d.id, to });
    layout(store.state);
  };
  renderer.domElement.addEventListener("pointerup", end);
  renderer.domElement.addEventListener("pointercancel", end);
  // Палец отпустили, пока этот экран не на виду (переключились на другой): его карта ложится там, где была, а не виснет до возвращения.
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);

  /**
   * ВЫДЕЛЕННОЕ — ТУДА ЖЕ: на сукно — «как лежат» (все сдвинуты на тот же шаг, что несомая) или «к пальцу» (все в
   * точку, чуть веером); в руку — подряд с этого места; в стопку — все в неё.
   */
  function groupMoves(to: Where, lead: string): { id: string; to: Where }[] {
    const ids = Object.entries(store.state.picks).filter(([, by]) => by === store.me.key).map(([id]) => id);
    if (!ids.includes(lead)) ids.unshift(lead);
    const from = store.state.felt.find((f) => f.id === lead);
    return ids.map((id, k) => {
      if (to.in === "hand") return { id, to: { ...to, i: to.i + k } };
      if (to.in === "deck") return { id, to };
      const f = store.state.felt.find((x) => x.id === id);
      if (lasso.grab === "keep" && f && from) return { id, to: { in: "felt", x: f.x + to.x - from.x, y: f.y + to.y - from.y, up: f.up, angle: f.angle } };
      return { id, to: { ...to, x: to.x + k * 0.12, y: to.y + k * 0.06, up: f ? f.up : to.up } };
    });
  }

  /** Куда кладут: над своей рукой — в руку, на это место; у стопки — в неё; иначе — на сукно, внутри стола. */
  function target(e: PointerEvent, d: { id: string; up: boolean; angle: number }): Where {
    const a = aim(e.clientX, e.clientY, undefined, d.id);
    if (a.in !== "felt") return a;
    const ringPile = store.state.piles.find((p) => p.pose === "ring" && Math.hypot(p.x - a.x, p.y - a.y) < 3.2);
    if (ringPile) return { in: "deck", pile: ringPile.id, turn: ((Math.atan2(a.x - ringPile.x, -(a.y - ringPile.y)) / DEG) + 360) % 360 };
    return { ...a, up: d.up, angle: d.angle };
  }
  /** Верх моей руки на экране: над самой высокой её картой (пустая — над левой рукой тела) — отсюда и ниже карту кладут в руку. */
  const handTop = (chair: Chair, skipCard?: string): number => {
    const rr = renderer.domElement.getBoundingClientRect();
    if (handCarry) return handCarry.zoneTop - rr.top;
    const r = rr, ys = chair.hand.filter((c) => c.id !== skipCard).map((c) => screenOf(c.id)?.y).filter((y): y is number => y !== undefined);
    const hb = myHandBody(chair), at = ys.length ? Math.min(...ys) : project(V(hb.left).add(new THREE.Vector3(0, HAND.lift, 0))).y;
    return Math.min(at - r.top - 55, r.height * 0.8);
  };
  function aim(x: number, y: number, skipPile?: string, skipCard?: string): { in: "hand"; chair: string; i: number } | { in: "deck"; pile: string; i?: number } | { in: "felt"; x: number; y: number } {
    const e = { clientX: x, clientY: y };
    const z = zoneFn?.(x, y);
    if (z) return z.where;
    const chair = myChair();
    const r = renderer.domElement.getBoundingClientRect();
    // Над своей рукой — от верха её карт, как они нарисованы в мире, и ниже.
    if (chair && e.clientY - r.top > handTop(chair, skipCard)) {
      const others = chair.hand.filter((c) => c.id !== skipCard);
      const xs = others.map((c) => screenOf(c.id)?.x ?? 0);
      return { in: "hand", chair: chair.id, i: xs.filter((q) => q < e.clientX).length };
    }
    const at = onFelt(e) ?? new THREE.Vector3();
    // В СТОПКУ — по её месту НА ЭКРАНЕ: палец в пределах карты верха стопки (с запасом), а не в узкой точке сукна.
    const pile = store.state.piles.find((p) => {
      if (p.id === skipPile || p.pose === "ring") return false;
      const topH = 0.02 + p.cards.length * PILE_STEP, c = project(new THREE.Vector3(p.x, topH, p.y)), edge = project(new THREE.Vector3(p.x + CARD_H / 2, topH, p.y));
      return Math.hypot(x - c.x, y - c.y) < Math.max(40, Math.hypot(edge.x - c.x, edge.y - c.y) * 2) || Math.hypot(p.x - at.x, p.y - at.z) < 1.1;
    });
    if (pile) return { in: "deck", pile: pile.id };
    const len = Math.hypot(at.x, at.z), max = R - 0.8, k = len > max ? max / len : 1;
    return { in: "felt", x: Math.round(at.x * k * 100) / 100, y: Math.round(at.z * k * 100) / 100 };
  }

  // ——— своё тело — остальным: голова — камера, взгляд — куда она смотрит, правая рука — где несёшь карту ———
  let sentAt = 0, rightAt: { x: number; y: number } | null = null, lastBody: unknown = null;
  function sendBody(force = false): void {
    const now = performance.now();
    if (!force && now - sentAt < BODY_EVERY_MS) return;
    sentAt = now;
    const ch = myChair(), yaw = ch ? myHeadNow(ch).sent : 0, pitchOut = camMode === "head" ? { pitch: Math.round(rig.pitch * 10) / 10, gaze: Math.round(rig.yaw * 10) / 10 } : {};
    const eye = ch && camMode === "top" ? (() => { const h = myHeadNow(ch).head; return { x: h.x, y: h.y, h: h.h }; })() : { x: camera.position.x, y: camera.position.z, h: Math.max(0, camera.position.y) };
    lastBody = { stance: stanceNow(), model: "seat", eye, stretch: camMode === "head" || camMode === "top" ? rig.lean : 0, yaw, ...pitchOut, right: drag?.moved ? rightAt : restRight };
    store.body({ stance: stanceNow(), model: "seat", eye, stretch: camMode === "head" || camMode === "top" ? rig.lean : 0, yaw, ...pitchOut, right: drag?.moved ? rightAt : restRight });
  }
  orbit.addEventListener("change", () => sendBody());

  function screenOf(id: string): { x: number; y: number } | null {
    const o = cards.get(id);
    if (!o) return null;
    const p = o.group.getWorldPosition(new THREE.Vector3()).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  const pileSpots = () => store.state.piles.filter((p) => p.pose !== "ring" && p.cards.length).map((p) => {
      const h = 0.02 + p.cards.length * PILE_STEP, c = project(new THREE.Vector3(p.x, h, p.y));
      // Ширина карты стопки на экране: по ней окно «к стопке» меряет свой размер.
      const r = camera.matrixWorld.elements, right = new THREE.Vector3(r[0], r[1], r[2]).setLength(CARD_W), e = project(new THREE.Vector3(p.x, h, p.y).add(right));
      return { pile: p.id, count: p.cards.length, ...c, cardPx: Math.hypot(e.x - c.x, e.y - c.y) };
    });
  const test = {
    /** Моё тело: есть ли, где плечи (стул, высота), нарисована ли голова-кружок. */
    myBody: () => ({ hand: myHandDrawn, parts: myBody.children.length, head: myHead.shown, shoulders: myHead.s, visible: myBody.visible }),
    /** Стулья: чей, цвет (0 — серый), где на столе (радиус, угол) и где на экране. */
    chairs: () => [...chairObjs.entries()].map(([id, one]) => { const c = project(one.group.position.clone().setY(CHAIR.seatY)), ch = store.state.chairs.find((x) => x.id === id)!; return { id, owner: ch.owner, ink: one.ink, color: (one.mats[0]!.color.getHexString()), r: Math.hypot(one.group.position.x, one.group.position.z), x: c.x, y: c.y }; }),
    /** Тела стопок (бок колоды): чья стопка и сколько карт в теле. */
    pileBodies: () => [...bodies.entries()].map(([pile, m]) => ({ pile, layers: m.userData.layers as number })),
    /** Чем нарисовано лицо каждой карты: адрес картинки или `finger:<оттенок>` — скрытая лицом ко мне. */
    arts: () => [...cards.entries()].map(([id, o]) => ({ id, face: o.faceUrl })),
    /** Язычки на экране: чья стопка, середина и размер, сколько карт, приколота ли. */
    tabs: () => [...tabs.entries()].map(([pile, t]) => {
      const c = project(t.mesh.position), w = new THREE.Vector3(TAB.w / 2 * t.mesh.scale.x, 0, 0).applyQuaternion(t.mesh.quaternion), e = project(t.mesh.position.clone().add(w));
      const p = store.state.piles.find((x) => x.id === pile);
      return { pile, x: c.x, y: c.y, w: 2 * Math.hypot(e.x - c.x, e.y - c.y), h: (2 * Math.hypot(e.x - c.x, e.y - c.y) * TAB.l) / TAB.w, count: p?.cards.length ?? 0, pin: !!p?.pin, y3: t.mesh.position.y, at: { x: t.mesh.position.x, y: t.mesh.position.z } };
    }),
    screenOf,
    state: () => store.state,
    me: () => store.me.key,
    /** Своя рука: есть ли у карты лицо в снимке и какой стороной она нарисована к камере. */
    handFaces: () => (myChair()?.hand ?? []).map((c) => {
      const o = cards.get(c.id);
      if (!o) return { id: c.id, face: !!c.face, drawn: "none" };
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(o.group.getWorldQuaternion(new THREE.Quaternion()));
      const toCam = camera.position.clone().sub(o.group.getWorldPosition(new THREE.Vector3()));
      return { id: c.id, face: !!c.face, drawn: n.dot(toCam) > 0 ? (o.faceUrl.startsWith("finger:") ? "finger" : "face") : "back" };
    }),
    /** Чужие тела: чьё, где голова на экране, ушёл ли головой, где левая рука и сколько в ней карт. */
    bodies: () => [...poses.entries()].map(([chair, pose]) => {
      const p = V(pose.head).project(camera), r = renderer.domElement.getBoundingClientRect();
      const drawn = heads.children.find((b) => b.userData.by === pose.by)?.userData.right as THREE.Vector3 | undefined;
      return { by: pose.by, chair, away: pose.away, head: { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }, left: pose.left, right: drawn ? { x: drawn.x, y: drawn.z, h: drawn.y } : null };
    }),
    /** Несомая карта: чья, щель в руке, у глаза ли, на какой высоте и какая высота камеры; моя рука видна ли. */
    held: () => { const o = drag?.moved ? cards.get(drag.id) : undefined; if (!drag || !o) return null; const p = o.group.getWorldPosition(new THREE.Vector3()); return { id: drag.id, gap: drag.gap, onCamera: !!o.target.onCamera, h: p.y, lift: liftH(), camY: camera.position.y, arm: myArm.children.length > 0, near: o.group.position.z }; },
    /** Куда целит несомая карта в окне HUD. */
    zone: () => (drag?.moved ? drag.zone : null),
    /** Последнее тело, что я отослал. */
    lastBody: () => lastBody,
    /** Где моя левая рука с веером — туда тянется правая, когда несу карту в руку. */
    leftHand: () => myLeftHand(),
    myArm: () => { const g = myArm.children.length ? (myArm.userData.grip as THREE.Vector3) : null; return g ? { x: g.x, y: g.z, h: g.y } : null; },
    /** Есть ли тени: включены, солнце отбрасывает, сукно принимает. */
    shadows: () => ({ on: renderer.shadowMap.enabled, sun: sun.castShadow, felt: top.receiveShadow }),
    /** Где лежит карта в мире (x, y — сукно, h — высота). */
    world: (id: string) => { const o = cards.get(id); if (!o) return null; const p = o.group.getWorldPosition(new THREE.Vector3()); return { x: p.x, y: p.z, h: p.y }; },
    handFrame: () => handFrame(),
    carrying: () => !!handCarry,
    fanFitsN,
    /** Ширина карты в мире: сколько единиц стола она занимает (рука — в осях камеры, стол — свой размер). */
    cardWidth: (id: string) => { const o = cards.get(id); return o ? o.group.getWorldScale(new THREE.Vector3()).x * CARD_W : null; },
    cam: () => ({ mode: camMode, yaw: rig.yaw, pitch: rig.pitch, lean: rig.lean, fov: camera.fov, pos: camera.position.toArray(), neck: { ...neck } }),
    view: () => { const p = camera.position.clone().sub(orbit.target); return { yaw: Math.atan2(p.x, p.z) / DEG, pitch: Math.asin(p.y / p.length()) / DEG }; },
  };
  // Хук проверок — у последнего смонтированного экрана; когда экранов два, тот, что сейчас перед глазами, выставляет его сам (`test`).
  (window as unknown as { __t3d: unknown }).__t3d = test;
  const project = (v: THREE.Vector3) => { const p = v.clone().project(camera), r = renderer.domElement.getBoundingClientRect(); return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }; };
  const api: SceneApi = {
    test,
    home: () => { home(); draw(); sendBody(true); },
    camMode: () => camMode,
    setCamMode,
    lookBy,
    zoomBy,
    opticsBy,
    handFrame,
    fanFits: () => fanFitsNow(),
    carryHand(screen) {
      const ch = myChair();
      if (!ch) return;
      if (screen) {
        ray.setFromCamera(ndc({ clientX: screen.x, clientY: screen.y }), camera);
        const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -CARRY_H), new THREE.Vector3());
        if (!hit) return;
        const fr = handFrame(), was = handCarry as { zoneTop: number } | null;
        handCarry = { x: hit.x, y: hit.z, sx: screen.x, sy: screen.y, zoneTop: was?.zoneTop ?? (fr ? fr.y - 10 : renderer.domElement.getBoundingClientRect().height * 0.7) };
        layout(store.state);
        return;
      }
      const c = handCarry as { sx: number; sy: number } | null;
      if (!c) return;
      const where = aim(c.sx, c.sy);
      handCarry = null;
      const ids = ch.hand.map((x) => x.id);
      if (where.in === "deck") store.send({ t: "gather", ids, side: "keep", to: { pile: where.pile } });
      else if (where.in === "felt") store.send({ t: "gather", ids, side: "keep", to: { x: where.x, y: where.y, angle: ((-ch.angle % 360) + 360) % 360 } });
      layout(store.state);
    },
    turnBy(deg) {
      if (camMode !== "orbit") { const ch = myChair(); if (ch) { rig.yaw = wrap(rig.yaw + deg); applyRig(); touched = true; draw(); sendBody(); } return; }
      const p = camera.position.clone().sub(orbit.target);
      p.applyAxisAngle(new THREE.Vector3(0, 1, 0), deg * DEG);
      camera.position.copy(orbit.target).add(p);
      orbit.update();
      touched = true;
    },
    azimuth: () => { if (camMode !== "orbit") return sideOf(rig.yaw); const p = camera.position.clone().sub(orbit.target); return Math.atan2(p.x, p.z) / DEG; },
    elevation: () => { if (camMode !== "orbit") return -rig.pitch; const p = camera.position.clone().sub(orbit.target); return Math.asin(p.y / p.length()) / DEG; },
    glass,
    handGeom,
    setBlend(b) { blend = b; layout(store.state); },
    stance: stanceNow,
    setStance(st) { stance = st; home(); sendBody(true); draw(); },
    setFigures(on) { heads.visible = on; chairRoot.visible = on; draw(); },
    setLook(l) { look = l; layout(store.state); },
    heads: () => [...poses.values()].map((pose) => {
      const c = project(V(pose.head)), edge = project(V(pose.head).add(new THREE.Vector3(0, 1, 0)));
      return { key: pose.by, x: c.x, y: c.y, r: Math.hypot(edge.x - c.x, edge.y - c.y), ink: pose.ink, wx: pose.head.x, wy: pose.head.y };
    }),
    pickAt(x, y) {
      // Голова — первой: веер в его руке висит у самого лица и перекрывал бы её.
      const e = { clientX: x, clientY: y } as PointerEvent;
      ray.setFromCamera(ndc(e), camera);
      const head = heads.visible ? ray.intersectObjects(heads.children, true).find((h) => h.object.userData.head) : undefined;
      if (head) return { t: "who", key: head.object.userData.head as string };
      const id = hitCard(e);
      if (id) return { t: "card", id };
      const seat = chairRoot.visible ? ray.intersectObject(chairRoot, true).find((h) => h.object.userData.chair) : undefined;
      return seat ? { t: "chair", id: seat.object.userData.chair as string } : null;
    },
    pileSpots,
    cardsIn(poly) {
      const inside = (q: { x: number; y: number }) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i]!, b = poly[j]!; if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
      return store.state.felt.filter((f) => { const q = screenOf(f.id); return q && inside(q); }).map((f) => f.id);
    },
    setLasso(on, grab) { lasso = { on, grab }; },
    onTab(fn) { tabFn = fn; },
    setTabLit(piles) { litTabs = piles; },
    feltAt: (x, y) => { const at = onFelt({ clientX: x, clientY: y }); return at ? { x: at.x, y: at.z } : null; },
    onFrame: (fn) => void frameHeard.push(fn),
    carry(id, e) { if (fromOf.has(id)) startDrag(id, e); },
    carrying: () => (drag?.moved ? drag.id : null),
    grabPile(pile, screen) {
      const p = store.state.piles.find((x) => x.id === pile), base = p && cards.get(p.cards[0]?.id ?? "");
      if (!p || !base) return;
      ray.setFromCamera(ndc({ clientX: screen.x, clientY: screen.y }), camera);
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(base.group.getWorldPosition(new THREE.Vector3()).y + 0.004)), new THREE.Vector3());
      pileGrab = hit ? { pile, dx: p.x - hit.x, dy: p.y - hit.z } : null;
    },
    pileAt: (pile) => (pileCarry?.pile === pile ? seatOnFelt(pileCarry) : null),
    carryPile(pile, screen) {
      const p = store.state.piles.find((x) => x.id === pile);
      let at: { x: number; y: number } | null = null, finger: { x: number; y: number } | null = null;
      if (screen) {
        // Язычок — на высоте несомой стопки, на луче из глаза через палец: ровно под ним; стопка — на том же расстоянии от него, что и при захвате.
        if (!p) return;
        ray.setFromCamera(ndc({ clientX: screen.x, clientY: screen.y }), camera);
        const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(0.01 + 0.6 + 0.004)), new THREE.Vector3());
        if (!hit) return;
        const g = pileGrab?.pile === pile ? pileGrab : { dx: 0, dy: 0 };
        at = { x: hit.x + g.dx, y: hit.z + g.dy };
        finger = { x: hit.x, y: hit.z };
      }
      // Несут где угодно, хоть за краем; кладут — только на сукно: посадка идёт в ближайшую точку у борта (как у карты, `aim`).
      if (!at && pileCarry && p) pileLanding = { pile, ...seatOnFelt(pileCarry), was: { x: p.x, y: p.y }, until: performance.now() + 1500 };
      pileCarry = at ? { pile, ...at } : null;
      if (!at) pileGrab = null;
      // Несу стопку — рука остальным на язычке, где палец.
      restRight = finger;
      sendBody(!at);
      layout(store.state);
    },
    aim: (x, y, skipPile) => aim(x, y, skipPile),
    setZone(fn) { zoneFn = fn; },
    heldZone: () => (drag?.moved && drag.zone && drag.spot ? { ...drag.zone, id: drag.id, spot: drag.spot } : null),
    panels: {
      place3d(el, at) {
        let one = panel3d.get(el);
        if (!at) { if (one) { cssScene.remove(one.obj); panel3d.delete(el); } draw(); return; }
        if (!one) { one = { obj: new CSS3DObject(el), at }; panel3d.set(el, one); cssScene.add(one.obj); }
        one.at = at;
        const o = one.obj, a = (myChair()?.angle ?? 0) * DEG, hu = (at.h * at.scale) / PANEL_PX;
        o.scale.setScalar(at.scale / PANEL_PX);
        if (at.tilt === "flat") { o.position.set(at.x, 0.05, at.y); o.rotation.set(-Math.PI / 2, a, 0, "YXZ"); }
        else if (at.tilt === "stand") { o.position.set(at.x, hu / 2 + 0.02, at.y); o.rotation.set(0, a, 0, "YXZ"); }
        else { o.position.set(at.x, hu / 2 + 0.6, at.y); o.quaternion.copy(camera.quaternion); }
        draw();
      },
      local3d(el, x, y) {
        const one = panel3d.get(el);
        if (!one) return null;
        const o = one.obj;
        o.updateMatrixWorld();
        const n = new THREE.Vector3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
        ray.setFromCamera(ndc({ clientX: x, clientY: y }), camera);
        const hit = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, o.getWorldPosition(new THREE.Vector3())), new THREE.Vector3());
        if (!hit) return null;
        const l = o.worldToLocal(hit);
        return { x: l.x + one.at.w / 2, y: one.at.h / 2 - l.y };
      },
    },
    panelLayer: () => css.domElement,
    handOf(chair) { const ch = store.state.chairs.find((c) => c.id === chair), l = ch ? leftOf(ch) : null; return l ? { x: l.x, y: l.y } : null; },
    setRestRight(at) {
      if (JSON.stringify(at) === JSON.stringify(restRight)) return;
      restRight = at;
      sendBody(true);
      draw();
    },
  };
  store.onChange(() => layout(store.state));
  // Размер окна сменился (поворот телефона) — домой заново, пока камеру не трогали.
  let touched = false;
  orbit.addEventListener("start", () => { touched = true; });
  new ResizeObserver(() => { if (!touched) home(); draw(); }).observe(host);
  orbit.enabled = camMode === "orbit";
  camera.fov = camMode === "orbit" ? 50 : camMode === "top" ? TOP.fov : CAM.fov.base;
  camera.updateProjectionMatrix();
  home();
  sendBody(true);
  layout(store.state);
  return api;
}
