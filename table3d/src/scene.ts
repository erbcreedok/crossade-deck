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
import { awayOf, BODY_EVERY_MS, gazeOf, HEAD, headOf, leftHandOf, NECK, restHead, shoulders3, type Body, type Point3 } from "../../server/src/table/bodies.js";
import { ringTurned, seatPoint, SEAT_RADIUS, TABLE_RADIUS } from "../../server/src/table/ring.js";
import { artUrl, readLook, type DeckLook } from "../../server/table-client/deckArt.js";
import { mineGeomOf, type PoseBlend } from "../../server/table-client/handGeom.js";
import { BAR_LOOK, T, type Geom } from "../../server/table-client/screenConst.js";
import { drawFingerCard, fingerKind } from "./finger.js";
import type { TableStore } from "../../server/table-client/store.js";

const DEG = Math.PI / 180;
const R = TABLE_RADIUS, RIM = 0.45, THICK = 0.6;
const CARD_W = 1, CARD_H = 1.4;
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

/** Место карты: в мире — или в осях камеры (`onCamera`: своя рука внизу экрана). */
type Place = { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number; onCamera?: true };
/** Где карта сейчас по снимку: откуда её можно взять. */
type From = { in: "felt" } | { in: "pile"; pile: string; top: boolean } | { in: "hand"; chair: string; mine: boolean; i: number };

// ——— картинки ———
const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");
const textures = new Map<string, THREE.Texture>();
function texture(url: string, ready: () => void): THREE.Texture {
  let t = textures.get(url);
  if (!t) {
    t = loader.load(url, ready);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    textures.set(url, t);
  }
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
  /** Запомнить, откуда смотрит камера игрока `key` (поза и облёт), — вернуться туда же (dev-переключатель игроков). */
  stashView(key: string): void;
  /** Вернуть камеру игрока `key` туда, где её оставили; не бывал — `false`, и камеру ставят домой. */
  recallView(key: string): boolean;
  /** Повернуть камеру вокруг стола на столько градусов. */
  turnBy(deg: number): void;
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
  /** Где оставили камеру каждого, за кого сидели (`stashView`) — у каждого своя, между ними прыгают. */
  /** Карта в пальце у того, кого оставили (`stashView`): держит ли ещё — узнаётся, когда к нему вернулись. */
  const parked = new Map<string, { drag: NonNullable<typeof drag>; released: boolean }>();
  const views = new Map<string, { pos: THREE.Vector3; target: THREE.Vector3; stance: "sit" | "stand" }>();
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
  function home(): void {
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
  interface Pose { by: string; s: Point3; head: Point3; left: Point3; away: boolean; yaw: number; right: Point3 | null; ink: string; name: string; strained: boolean }
  /** Где у сидящего за стулом `ch` плечи, голова и руки — общей геометрией стола (`bodies.ts`). Своё тело — нет: своя голова — камера. */
  const poseOf = (ch: Chair, s: Snapshot): Pose | null => {
    const who = s.people.find((p) => p.key === ch.owner);
    if (!who || who.key === store.me.key) return null;
    const b = bodyOf(who.key, ch.angle);
    const sh = shoulders3(ch.angle, b.stance);
    const head = headOf(sh, b.eye, b.stretch, b.yaw);
    const holding = store.carries.some((c) => c.by === who.key);
    return { by: who.key, s: sh, head, left: leftHandOf(head, b.yaw), away: awayOf(sh, b.yaw), yaw: b.yaw, right: b.right ? { ...b.right, h: holding ? HEAD.lift * head.h : restH(b.right, ch.id) } : null, ink: who.ink, name: who.name, strained: b.stretch > NECK.free };
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
    if (who.key === store.me.key) {
      const f = camera.getWorldDirection(new THREE.Vector3()), yaw = Math.atan2(f.x, -f.z) / DEG;
      return leftHandOf(headOf(shoulders3(ch.angle, stanceNow()), { x: camera.position.x, y: camera.position.z, h: camera.position.y }, 0, yaw), yaw);
    }
    const b = bodyOf(who.key, ch.angle), head = headOf(shoulders3(ch.angle, b.stance), b.eye, b.stretch, b.yaw);
    return leftHandOf(head, b.yaw);
  }
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
  const DOLL = { spine: 0.21, bar: 1.4, arm: 0.13, hand: 0.32, reach: 2 * TABLE_RADIUS + 2 } as const;
  const poses = new Map<string, Pose>();
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
      const mat = inkOf(pose.ink), S = V(pose.s), H = V(pose.head), L = V(pose.left), base = V({ ...pose.s, h: -7 });
      // Правое плечо — справа от взгляда в середину стола.
      const r = Math.hypot(pose.s.x, pose.s.y) || 1, rightDir = new THREE.Vector3(pose.s.y / r, 0, -pose.s.x / r);
      const shL = S.clone().addScaledVector(rightDir, -DOLL.bar), shR = S.clone().addScaledVector(rightDir, DOLL.bar);
      body.add(stick(base, S, DOLL.spine, mat), stick(shL, shR, DOLL.spine, mat), ball(shL, DOLL.spine, mat), ball(shR, DOLL.spine, mat));
      if (pose.away) {
        // Ушёл головой на ту сторону стола — к голове ниточка его цвета, руки ушли с головой.
        const tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([S, H]), new THREE.LineDashedMaterial({ color: pose.ink, dashSize: 0.35, gapSize: 0.3, transparent: true, opacity: 0.6 }));
        tether.computeLineDistances();
        body.add(tether);
      } else {
        body.add(stick(S, H, DOLL.spine, pose.strained ? inkOf("#e0413a") : mat), stick(shL, L, DOLL.arm, mat), ball(L, DOLL.hand, mat));
        if (pose.right && Math.hypot(pose.right.x - (pose.s.x + rightDir.x * DOLL.bar), pose.right.y - (pose.s.y + rightDir.z * DOLL.bar)) <= DOLL.reach) {
          const Rh = V(pose.right);
          body.add(stick(shR, Rh, DOLL.arm, mat), ball(Rh, DOLL.hand, mat));
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
  const inHand = (k: number, geom: Geom): Place => {
    const g = glass(), sl = geom.slots[k]!, D = 5, vh = 2 * D * Math.tan((camera.fov * DEG) / 2), vw = vh * (g.w / g.h);
    const pos = new THREE.Vector3((sl.x / g.w - 0.5) * vw, -(sl.y / g.h - 0.5) * vh, -D + k * 0.004);
    return { pos, quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sl.angle * DEG), scale: ((geom.w / g.w) * vw) / CARD_W, onCamera: true };
  };
  /** Чужая рука — веером в его левой руке, лицом к нему (нам — рубашками). */
  const held = (pose: Pose, k: number, n: number): Place => {
    const g = gazeOf(pose.yaw), normal = new THREE.Vector3(-g.x, 0, -g.y).normalize(), up = new THREE.Vector3(0, 1, 0);
    const right = up.clone().cross(normal).normalize();
    const s = k - (n - 1) / 2, step = Math.min(0.3, 3 / Math.max(1, n));
    const pos = V(pose.left).add(new THREE.Vector3(0, 0.55 - s * s * 0.004, 0)).addScaledVector(right, s * step).addScaledVector(normal, k * 0.004);
    const basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
    const lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -15 * DEG);
    const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -s * 5 * DEG);
    return { pos, quat: basis.multiply(lean).multiply(roll), scale: 0.8 };
  };
  const pileAngle = (p: Pile) => (p as Pile & { angle?: number }).angle ?? 0;
  function layout(s: Snapshot): void {
    drawBodies(s);
    const seen = new Set<string>();
    fromOf.clear();
    const mine = myChair()?.id;
    const geom = handGeom();
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
    const gap = drag?.moved ? drag.gap : null;
    const mineList = handCards();
    for (const ch of s.chairs) ch.hand.forEach((c, i) => {
      const o = cardObj(c.id);
      dress(o, c, s);
      const pose = poses.get(ch.id);
      const k = ch.id === mine ? mineList.indexOf(c) : -1, slot = k < 0 ? i : gap !== null && k >= gap ? k + 1 : k;
      o.target = ch.id === mine && geom && k >= 0 ? inHand(slot, geom) : pose && !pose.away ? held(pose, i, ch.hand.length) : fanned(ch.angle, i, ch.hand.length, false);
      // Перевёрнутая в руке — лицом наружу, к остальным: хозяину — рубашкой.
      if (c.up) o.target.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
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
    // НЕСОМАЯ МНОЙ — у пальца: над рукой — в щели руки, выше и ближе соседей; над столом — там, где решил палец.
    if (drag?.moved) {
      const o = cards.get(drag.id);
      if (o && drag.gap !== null && geom) {
        // Ближе к глазу — не ниже на экране: место по экрану сохраняется (всё ×r), и только потом — выше соседей.
        const t = inHand(drag.gap, geom), r = (-t.pos.z - HOVER.near) / -t.pos.z;
        t.pos.x *= r;
        t.pos.y = (t.pos.y + HOVER.up * CARD_H * t.scale) * r;
        t.pos.z += HOVER.near;
        t.scale *= r * HOVER.grow;
        o.target = t;
      } else if (o && drag.spot) o.target = screenPlace(drag.spot);
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
    if (o && !o.target.onCamera && o.group.visible) {
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
    myArm.add(stick(shR, grip, DOLL.arm, mat), ball(grip, DOLL.hand, mat));
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
    lastTick = now;
    for (const [id, o] of cards) {
      const g = o.group, t = o.target;
      // Сменила место между миром и рукой — пересадить, сохранив, где она на экране, и долететь.
      const parent = t.onCamera ? handRoot : cardRoot;
      if (g.parent !== parent) { camera.updateMatrixWorld(); parent.attach(g); g.userData.v = new THREE.Vector3(); g.userData.sv = 0; g.traverse((n) => n.layers.set(t.onCamera ? HAND_LAYER : 0)); }
      // Над окном HUD несомую рисует сам HUD — поверх окна; здесь её нет.
      g.visible = !(drag?.moved && drag.id === id && drag.spot);
      // Своя рука — не отбрасывает тени: она у глаза, её тень легла бы на полстола.
      o.front.castShadow = o.back.castShadow = !t.onCamera;
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
  let myBodySig = "", myHead = { shown: false, s: { x: 0, y: 0, h: 0 } };
  /** Тело на моём стуле — плечи, шея, левая рука — от моей камеры; правую рисует `armPose`. Пересобирается, когда что-то сдвинулось. */
  function placeMyBody(): void {
    const ch = myChair(), who = store.state.people.find((p) => p.key === store.me.key);
    myBody.visible = heads.visible;
    if (!ch || !who || !heads.visible) { if (myBodySig) myBody.clear(); myBodySig = ""; return; }
    const f = camera.getWorldDirection(new THREE.Vector3()), yaw = Math.atan2(f.x, -f.z) / DEG, c = camera.position;
    const sig = [ch.angle, stanceNow(), who.ink, who.name, c.x.toFixed(3), c.y.toFixed(3), c.z.toFixed(3), yaw.toFixed(2)].join("|");
    if (sig === myBodySig) return;
    myBodySig = sig;
    myBody.clear();
    const sh = shoulders3(ch.angle, stanceNow()), head = headOf(sh, { x: c.x, y: c.z, h: c.y }, 0, yaw), left = leftHandOf(head, yaw), away = awayOf(sh, yaw);
    const mat = inkOf(who.ink), S = V(sh), H = V(head), L = V(left), base = V({ ...sh, h: -7 });
    const r = Math.hypot(sh.x, sh.y) || 1, rightDir = new THREE.Vector3(sh.y / r, 0, -sh.x / r);
    const shL = S.clone().addScaledVector(rightDir, -DOLL.bar), shR = S.clone().addScaledVector(rightDir, DOLL.bar);
    myBody.add(stick(base, S, DOLL.spine, mat), stick(shL, shR, DOLL.spine, mat), ball(shL, DOLL.spine, mat), ball(shR, DOLL.spine, mat));
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
    } else myBody.add(stick(S, H, DOLL.spine, mat), stick(shL, L, DOLL.arm, mat), ball(L, DOLL.hand, mat));
    myHead = { shown: away, s: sh };
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
    const f = camera.getWorldDirection(new THREE.Vector3()), yaw = Math.atan2(f.x, -f.z) / DEG;
    const head = headOf(shoulders3(ch.angle, stanceNow()), { x: camera.position.x, y: camera.position.z, h: camera.position.y }, 0, yaw);
    const l = leftHandOf(head, yaw);
    return { x: l.x, y: l.y };
  };
  const mine = (id: string) => store.state.picks[id] === store.me.key;
  let lastTap = { id: "", at: 0 };
  renderer.domElement.addEventListener("pointerdown", (e) => {
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
    orbit.enabled = true;
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
  function aim(x: number, y: number, skipPile?: string, skipCard?: string): { in: "hand"; chair: string; i: number } | { in: "deck"; pile: string; i?: number } | { in: "felt"; x: number; y: number } {
    const e = { clientX: x, clientY: y };
    const z = zoneFn?.(x, y);
    if (z) return z.where;
    const chair = myChair();
    const r = renderer.domElement.getBoundingClientRect();
    // Над своей рукой — от верха её карт (раскладка 2D) и ниже.
    const geom = handGeom();
    const handTop = geom && geom.slots.length ? Math.min(...geom.slots.map((sl) => sl.y - geom.h / 2)) - 20 : r.height * 0.8;
    if (chair && e.clientY - r.top > Math.min(handTop, r.height * 0.8)) {
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
    const f = camera.getWorldDirection(new THREE.Vector3());
    lastBody = { stance: stanceNow(), model: "seat", eye: { x: camera.position.x, y: camera.position.z, h: Math.max(0, camera.position.y) }, stretch: 0, yaw: Math.atan2(f.x, -f.z) / DEG, right: drag?.moved ? rightAt : restRight };
    store.body({ stance: stanceNow(), model: "seat", eye: { x: camera.position.x, y: camera.position.z, h: Math.max(0, camera.position.y) }, stretch: 0, yaw: Math.atan2(f.x, -f.z) / DEG, right: drag?.moved ? rightAt : restRight });
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
  (window as unknown as { __t3d: unknown }).__t3d = {
    /** Моё тело: есть ли, где плечи (стул, высота), нарисована ли голова-кружок. */
    myBody: () => ({ parts: myBody.children.length, head: myHead.shown, shoulders: myHead.s, visible: myBody.visible }),
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
    view: () => { const p = camera.position.clone().sub(orbit.target); return { yaw: Math.atan2(p.x, p.z) / DEG, pitch: Math.asin(p.y / p.length()) / DEG }; },
  };
  const project = (v: THREE.Vector3) => { const p = v.clone().project(camera), r = renderer.domElement.getBoundingClientRect(); return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }; };
  const api: SceneApi = {
    home: () => { home(); draw(); sendBody(true); },
    turnBy(deg) {
      const p = camera.position.clone().sub(orbit.target);
      p.applyAxisAngle(new THREE.Vector3(0, 1, 0), deg * DEG);
      camera.position.copy(orbit.target).add(p);
      orbit.update();
      touched = true;
    },
    azimuth: () => { const p = camera.position.clone().sub(orbit.target); return Math.atan2(p.x, p.z) / DEG; },
    elevation: () => { const p = camera.position.clone().sub(orbit.target); return Math.asin(p.y / p.length()) / DEG; },
    glass,
    handGeom,
    setBlend(b) { blend = b; layout(store.state); },
    stance: stanceNow,
    setStance(st) { stance = st; home(); sendBody(true); draw(); },
    stashView(key) {
      sendBody(true);
      // Карта в пальце: уходя, её не роняю — рука с ней остаётся, как была (другим видно, где она), а палец «отпускаю» только отсюда.
      if (drag?.moved) {
        const d = drag, entry = { drag: { ...d }, released: false };
        clearInterval(d.hold);
        orbit.enabled = true;
        parked.set(key, entry);
        const up = () => { entry.released = true; removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
        addEventListener("pointerup", up);
        addEventListener("pointercancel", up);
        drag = null;
        layout(store.state);
      }
      views.set(key, { pos: camera.position.clone(), target: orbit.target.clone(), stance });
    },
    recallView(key) {
      // Вернулся к тому, кто держал карту: держу ещё — беру её обратно там же; отпустил, пока был на другой камере, — стёрлось: карта свободна.
      const pk = parked.get(key);
      parked.delete(key);
      if (pk) {
        const id = pk.drag.id;
        if (pk.released) store.send({ t: "release", id });
        else {
          if (!pk.drag.group) store.send({ t: "grab", id });
          if (pk.drag.group || store.state.locks[id] === store.me.key) {
            drag = { ...pk.drag, hold: window.setInterval(() => { if (drag) store.send({ t: "hold", id: drag.id }); }, HOLD_MS) };
            orbit.enabled = false;
          }
        }
      }
      const v = views.get(key);
      if (!v) { layout(store.state); return false; }
      stance = v.stance;
      camera.position.copy(v.pos);
      orbit.target.copy(v.target);
      orbit.update();
      sendBody(true);
      layout(store.state);
      draw();
      return true;
    },
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
  home();
  sendBody(true);
  layout(store.state);
  return api;
}
