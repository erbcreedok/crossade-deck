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
import type { CardRule, Chair, Pile, SeenCard, Snapshot, Where } from "../../server/src/table/contract.js";
import { CARRY_EVERY_MS, FELT_REACH } from "../../server/src/table/contract.js";
import { SEAT_PULL, AWAY_DEG, awayOf, BODY_EVERY_MS, gazeOf, HEAD, headOf, leftHandOf, NECK, NECK_LEN, restHead, SHOULDER_H, sideOf, shoulders3, type Body, type Point3 } from "../../server/src/table/bodies.js";
import { HAND_CEIL, STRAIN, BACK, PEEK, peekShift, peekTight, CAM, headAt, neckNew, neckStep, pitchToCentre, TOP, topHeight, wrap, type CamMode } from "./camera.js";
import { createGyro } from "./gyro.js";
import { ringArrowFromMiddle, SEAT, turnMark } from "../../server/table-client/felt.js";
import { ringTurnOfSeat } from "../../server/src/table/bots/view.js";
import { RING_SPREAD, ringLanding, ringTurned, seatPoint, SEAT_RADIUS, TABLE_RADIUS } from "../../server/src/table/ring.js";
import { artUrl, readLook, type DeckLook } from "../../server/table-client/deckArt.js";
import { CardFlip } from "../../server/table-client/cardFlip.js";
import { blendOf, handPlanBlend, mineGeomOf, snapPose, tuckOf, type PoseBlend } from "../../server/table-client/handGeom.js";
import { BAR_LOOK, T, type Geom } from "../../server/table-client/screenConst.js";
import { drawFingerCard, fingerKind } from "./finger.js";
import type { TableStore } from "../../server/table-client/store.js";
import { lockTouch } from "./touchLock.js";
import type { FeelEvent, FeelKind } from "../../server/table-client/feel.js";

const DEG = Math.PI / 180;
/** Насколько далеко от середины стола можно увести камеру сверху, долей радиуса стола. */
const PAN_LIMIT = 1;
/** Несу карту и держу палец у края сцены (сверху, слева, справа): камера едет в ту сторону, чем ближе к самому краю — тем быстрее. Над рукой камера стоит (туда кладут карты), ниже самой нижней её карты и без руки — едет как у остальных краёв. */
const EDGE_SCROLL = { band: 44, bottom: 18, panPx: 520, turnDeg: 80 };
const R = TABLE_RADIUS, RIM = 0.45, THICK = 0.6;
const CARD_W = 1.17, CARD_H = 1.638;
/** Каждую карту стопки — чуть выше предыдущей; каждую карту сукна — выше лёгшей раньше. */
const FELT_STEP = 0.004;
/** Сколько держать карту без «держу» — меньше `LOCK_TTL_MS` стола. */
const HOLD_MS = 1500;
/** Двойной тап — два тапа по одной карте за столько. */
const DOUBLE_MS = 350;
/** Сколько держать палец на карте, чтобы она поднялась без движения, мс. */
const HOLD_PICK_MS = 350;
/**
 * ПРУЖИНА — как карты догоняют свои места: жёсткость и доля затухания от критического (меньше 1 — с лёгким
 * перелётом). Несомая — жёстче и почти без перелёта: она должна быть под пальцем, а не догонять его.
 */
/** Несомая в свободном месте карта смотрит на глаз несущего: `face` — доля пути от «лежит плашмя» до «лицом к глазу» (остальное — наклон туда, куда ляжет). */
const CARRY_TILT = { face: 0.65, floor: 0.12 };
const SPRING = { k: 170, damp: 0.62 }, SPRING_HELD = { k: 900, damp: 0.9 }, SPRING_SLAM = { k: 2600, damp: 0.8 };
/** Над своей рукой несомая карта — выше соседей на эту долю своей высоты, ближе к глазу и чуть крупнее. */
/** Размер своих карт в руке относительно обычного: предел ползунка в настройках. */
const HAND_SIZE = { min: 0.5, max: 2 };
const HOVER = { up: 0.55, near: 0.6, grow: 1.05 };
/** Тронутая карта руки: чуть выше соседей и чуть ближе к глазу (единицы кадра руки). */
const TOUCH = { up: 0.07, z: 0.12 };

/** Место карты: в мире (`over` — моя рука: место в мире, но рисуется поверх всего) — или в осях камеры (`onCamera`: над окном HUD). */
/** Раскладка руки: сжатость (0 — стопкой), веер ↔ ряд (0.5 — веер, 1 — ряд), комната в ширинах карты. */
type Shape = { wide: number; lift: number; room: number; base?: number };
type Place = { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number; onCamera?: true; over?: true; /** Куда в мире складывается рука к держащему: чей слой выше, решает, с какой стороны на неё смотрят. */ stagger?: THREE.Vector3; /** Несомая под пальцем: растёт на высоту вдоль луча камеры через палец, а не по прямой из прежнего места. */ held?: true; /** Кривизна самой карты вокруг её вертикали (1/радиус в единицах карты, + к лицу): карта согнута, как в пальцах. */ bend?: number };
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
  const w = CARD_W / 2, h = CARD_H / 2, r = 0.081;
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
/** Карта, которую можно согнуть: та же рамка, но сетка вдоль ширины — изгиб считает вершинный шейдер, углы закруглены отсечением по контуру. */
const cardBendShape = (() => {
  const g = new THREE.PlaneGeometry(CARD_W, CARD_H, 20, 1);
  const pos = g.getAttribute("position") as THREE.BufferAttribute, uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5);
  return g;
})();
const CARD_CORNER = 0.081;
/** Материал карты с изгибом: `userData.bend.value` — кривизна (1/радиус), изгиб — вершинным шейдером по цилиндру вокруг вертикали карты. */
function bendMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05 });
  const bend = { value: 0 };
  m.userData.bend = bend;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBend = bend;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uBend;\nvarying vec2 vFlat;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vFlat = position.xy;
        if (abs(uBend) > 1e-5) { float a = position.x * uBend; transformed.x = sin(a) / uBend; transformed.z = (1.0 - cos(a)) / uBend; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec2 vFlat;`)
      .replace("#include <alphatest_fragment>", `vec2 cq = abs(vFlat) - vec2(${(CARD_W / 2).toFixed(4)}, ${(CARD_H / 2).toFixed(4)}) + ${CARD_CORNER.toFixed(4)};
        if (length(max(cq, 0.0)) > ${CARD_CORNER.toFixed(4)}) discard;
        #include <alphatest_fragment>`);
  };
  return m;
}
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
interface CardObj { group: THREE.Group; front: THREE.Mesh; back: THREE.Mesh; shades: THREE.Mesh[]; ring: THREE.LineLoop; halo: THREE.Mesh; target: Place; faceUrl: string; backUrl: string }
/** Белое свечение вокруг карты (середина вырезана): красится материалом — подсветка стопки при приёмке и карты в чужих руках. */
const cardGlowTexture = (() => {
  let tex: THREE.CanvasTexture | null = null;
  return (): THREE.CanvasTexture => {
    if (tex) return tex;
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 360;
    const c = cv.getContext("2d")!, iw = (CARD_W / (CARD_W + 1)) * 256, ih = (CARD_H / (CARD_H + 1)) * 360, x = (256 - iw) / 2, y = (360 - ih) / 2;
    c.shadowColor = "#fff"; c.shadowBlur = 34; c.fillStyle = "#fff";
    for (let i = 0; i < 3; i++) { c.beginPath(); c.roundRect(x, y, iw, ih, 14); c.fill(); }
    c.shadowBlur = 0; c.globalCompositeOperation = "destination-out"; c.beginPath(); c.roundRect(x, y, iw, ih, 14); c.fill();
    tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
})();
const cardEdge = (() => {
  const w = CARD_W / 2 + 0.04, h = CARD_H / 2 + 0.04;
  return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w, -h, 0.003), new THREE.Vector3(w, -h, 0.003), new THREE.Vector3(w, h, 0.003), new THREE.Vector3(-w, h, 0.003)]);
})();

/** Что сцена даёт HUD (`hud.ts`): камеру, руку, стопки и головы на экране, выделение. */
export interface SceneApi {
  home(): void;
  /** Хук проверок этого экрана: `window.__t3d` у того из экранов, что сейчас на виду (`main.ts`). */
  /** Что нужно модулю приёмки стопки (`pileAccept.ts`): что несут, где карта на экране, повесить карту над стопкой. */
  probe: import("./pileAccept.js").AcceptProbe;
  test: unknown;
  /** Повернуть камеру вокруг стола на столько градусов. */
  turnBy(deg: number): void;
  /** Модель камеры: орбита, голова, оптика. Намерения: взгляд (yaw, pitch — градусы) и приближение (> 1 — ближе). */
  camMode(): CamMode;
  /** Обычное поле зрения головы, градусы по вертикали (настройки). */
  baseFov(): number;
  /** Размер карт в своей руке: 0.5…2 от обычного (настройки). */
  handSize(): number;
  setHandSize(k: number): void;
  setBaseFov(deg: number): void;
  /** Расстояние камеры «вокруг стола» до стола: 0 — дальше всего, 1 — ближе всего. */
  orbitZoom(): number;
  setOrbitZoom(t: number): void;
  /** Оптический зум головы: 0 — обычный обзор, 1 — самый узкий. */
  /** Посадка 0…1: 0 — стул отодвинут до предела, 1 — как сидишь (ближе нельзя). */
  /** Размер людей, множитель (DEV): толщина палок, кисти, плечи, кружок головы. */
  dollScale(): number;
  setDollScale(k: number): void;
  /** Высота обзора 0…1 (DEV): только моя камера, тело и руки у других не меняются. */
  viewHeight(): number;
  setViewHeight(t: number): void;
  viewHeightUnits(): number;
  seat(): number;
  setSeat(t: number): void;
  /** Пересадка своего стула: вид сверху со свободным зумом, только стол, стулья и карты на столе; тянут свой стул по кругу. */
  reseatOn(): boolean;
  /** На сколько px вниз ушла рука из-за потолка (взгляд выше `HAND_CEIL`): худ руки — язычок и счётчик — уезжает на столько же. */
  handShiftPx(): number;
  /** Где на экране верхний край чаши «в руку» (px от верха сцены) и горит ли она; `null` — чаши нет. По нему худ ставит подпись. */
  bowlRim(): { y: number; lit: boolean } | null;
  /** Просмотр прошлого (`store.replay`): включить — вид сверху, стул и жесты за столом выключены; выключить — камера как была. */
  replay(on: boolean): void;
  setReseat(on: boolean): void;
  reseatDone(ok: boolean): void;
  /** Загиб веера в моей руке, 0…1: боковая ручка вверх-вниз. */
  handCurl(): number;
  setHandCurl(c: number): void;
  setCamMode(m: CamMode): void;
  /** Гиро: поворот телефона — поворот головы. `toggle` — из жеста; ответ — что не вышло (датчик не разрешили). */
  gyro: { toggle(): Promise<string | null>; on(): boolean; info(): string };
  lookBy(dyaw: number, dpitch: number): void;
  zoomBy(k: number): void;
  seatBy(d: number): void;
  /** Показ натяжения шеи: виньетка и датчик. */
  neckViz(kind: "vignette" | "gauge"): boolean;
  setNeckViz(kind: "vignette" | "gauge", on: boolean): void;
  /** Сдвинуть голову вбок по кругу вокруг стола: `d` — доля предела, + вправо от взгляда. */
  sideBy(d: number): void;
  /** Рамка моей руки на экране (охват карт с полями, не уже 250 пикселей); нет карт или рука положена — `null`. `edge` — высота верхней кромки. */
  handFrame(): { x: number; y: number; w: number; h: number; edge: number } | null;
  /** Рука-стопка: левая рука несёт все карты над столом под пальцем (`screen`); `null` — отпустили: на колоду, новой стопкой на сукно или — над худом руки — всё как было. */
  /** Несёт ли левая рука стопку над столом; `lines` — линии экрана: несётся, пока палец выше `enter`, выходит ниже `exit`; без них — зона от худа руки. */
  carryHand(screen: { x: number; y: number } | null, lines?: { enter: number; exit: number }): boolean;
  /** Рука в кадре следует за верхней ручкой по высоте, пока её тянут (`px` вверх — минус); `null` — отпустили, вернулась (временно). */
  /** Высота руки в кадре, пиксели (вверх — плюс): верхняя ручка ставит, рука остаётся на ней. */
  handHeight(): number;
  /** Верхний грип влево-вправо: где он стоит по ширине экрана (остаётся там, где оставили; `null` — по центру); вокруг него карты раздвинуты. */
  gripX(): number | null;
  /** Насколько сейчас раздвинуто грипом, 0…1 (0 — не двигали или уже вернулось). */
  gripAmount(): number;
  /** Грип взяли за ход влево-вправо / повели в точку `sx` / отпустили: после отпускания он ползёт назад, пока карты не встанут как были. */
  gripBegin(): void;
  gripMove(sx: number): void;
  gripEnd(): void;
  setHandHeight(px: number): void;
  /** Где на экране лежит моя положенная стопка (охват верхней карты) — ручка у неё привязана к стопке на столе; рука не положена или стопки не видно — `null`. */
  stackScreen(): { x: number; y: number; w: number; h: number } | null;
  /** Несёт ли левая рука всю руку стопкой над столом сейчас. */
  carryingHand(): boolean;
  /** ВЫСОТА РУКИ 0…1 (язычок над рукой): на столе — корешок — веер — в ряд; ставит позу и подъём вместе. */
  handLevel(): number;
  setHandLevel(h: number): void;
  /** Ступень руки по высоте `h`. */
  handPoseAt(h: number): "tuck" | "spine" | "fan" | "row";
  /** Высота, на которую кнопки позы ставят язычок. */
  poseLevels: Record<"tuck" | "spine" | "fan" | "row", number>;
  /** Верх карт моей руки на экране, px (без поднятой карты); нет карт или рука на столе — `null`. */
  handTopPx(): number | null;
  /** Нижняя строка HUD: её верх на экране и на сколько пол руки приподнят над ней (лист вкладки). */
  setDock(top: number, extra: number): void;
  /** Ширина моей руки 0…1 (стопкой → веер → в ряд, предел — экран). */
  handWidth(): number;
  /** Пока тянут левую ручку: ширина `raw` (за пределом — карты натягиваются и не растут); `null` — отпустили, поза легла. */
  setHandWidth(raw: number | null): void;
  /** Помещается ли веер моей руки: угол разлёта и подъём краёв в пределах. Нет — рука в ряд, веер выбрать нельзя. */
  fanFits(): boolean;
  /** С какой стороны стола камера (угол места, как у стула) и насколько поднята, градусы. */
  azimuth(): number;
  elevation(): number;
  glass(): { w: number; h: number };
  /** Системный отступ снизу (полоса «домой»), px. */
  safeBottom(): number;
  /** Пока несут карту (одну): полоса своей руки на экране, px от верха сцены; `over` — карта над ней (упадёт в руку). Иначе `null`. */
  handDropZone(): { top: number; bottom: number; over: boolean } | null;
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
  /** Режим «В стопку»: тап или проведение пальцем выделяет карты и стопки на столе; долгий холд на выделенном стягивает все выделенные под палец в одну стопку. */
  setStackMode(on: boolean): void;
  stackMode(): boolean;
  /** Сколько карт на столе сейчас выделено мной. */
  stackPicked(): number;
  /** Язычок стопки — на столе, у нижней кромки её верхней карты: тронули — сообщить, чья стопка (окно, переворот, тяга). */
  onTab(fn: (pile: string, e: PointerEvent) => void): void;
  /** Какие язычки горят: у кого открыто окно или кого несут. */
  setTabLit(piles: Set<string>): void;
  /** Точка сукна под пальцем. */
  feltAt(x: number, y: number): { x: number; y: number } | null;
  /** После каждого кадра — HUD переставляет то, что стоит по сцене. */
  onFrame(fn: () => void): void;
  /** Точка стола на экране (px сцены) — по ней звук берёт, слева он или справа. */
  feltToScreen(x: number, y: number): { x: number; y: number } | null;
  /** Палец оторвал карту (пошёл тянуть): вибрация «взял». */
  onGrab(fn: () => void): void;
  /** Ощущение от карты в руках (звук и вибрация): событие в момент касания. Стенд подписывает на него `feel.ts`. */
  onFeel(fn: (e: FeelEvent) => void): void;
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
  lockTouch(host.ownerDocument);
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
  /** Окно на столе в пространстве сцены. */
  function placePanel(one: { obj: CSS3DObject; at: WorldPlace }): void {
    const at = one.at;
    // `at.x, at.y` — ЛЕВЫЙ ВЕРХНИЙ УГОЛ окна (а не середина): масштаб растёт вправо и вниз, а не во все стороны; стоящее на столе растёт вправо и вверх от своего низа.
    const o = one.obj, a = (myChair()?.angle ?? 0) * DEG, wu = (at.w * at.scale) / PANEL_PX, hu = (at.h * at.scale) / PANEL_PX, hu0 = (at.h * 0.7) / PANEL_PX;
    o.scale.setScalar(at.scale / PANEL_PX);
    if (at.tilt === "flat") o.rotation.set(-Math.PI / 2, a, 0, "YXZ");
    else if (at.tilt === "stand") o.rotation.set(0, a, 0, "YXZ");
    else o.quaternion.copy(camera.quaternion);
    o.updateMatrixWorld();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion);
    // Середина окна от его угла: на полширины вправо и на полвысоты вниз (в плоскости окна); у стоящего низ на столе, поэтому вверх.
    const corner = at.tilt === "flat" ? new THREE.Vector3(at.x, 0.05, at.y) : at.tilt === "stand" ? new THREE.Vector3(at.x, 0.02, at.y) : new THREE.Vector3(at.x, 0.6 + hu0, at.y);
    o.position.copy(corner).addScaledVector(right, wu / 2);
    if (at.tilt === "stand") o.position.addScaledVector(up, hu / 2); else o.position.addScaledVector(up, -hu / 2);
  }
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
  /** РЕЖИМ «В СТОПКУ» (вместо лассо): выбор — общий с остальными (`picks` стола), сбор — одним намерением `gather` при отпускании. */
  let stackMode = false;
  let grabFn: (() => void) | null = null;
  /** Стопку бесхозного стула несут над моей рукой: её карты — в щели руки (как несомая стопка), а не лежат у пальца. */
  let chairOver: { ids: string[]; gap: number } | null = null;
  /** Стягивание: id карт по порядку, куда тянем (точка на сукне), когда началось, начался ли ход пальцем (тогда карты летят быстро) и до какого мига держим цель после отпускания. */
  let gather: { ids: string[]; at: { x: number; y: number }; t0: number; fast: boolean; from: { x: number; y: number }; until: number } | null = null;
  const GATHER = { holdMs: 450, staggerMs: 40, moveStartPx: 10, settleMs: 900, spring: { k: 120, damp: 0.85 } } as const;
  /** Стопку несут за грип — где она сейчас под пальцем. */
  let pileCarry: { pile: string; x: number; y: number } | null = null;
  /** Несомая стопка над своей рукой (вид «голова»): стоит в щели руки, как одна карта, а карты руки расступаются под неё. */
  const pileOverIds = new Map<string, number>();
  let pileOver: { pile: string; gap: number } | null = null;
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
  /** Обычное поле зрения головы; для разработки его двигает ползунок (`setBaseFov`). */
  let baseFov: number = innerWidth < 500 ? 85 : CAM.fov.base;
  /** Размер карт в своей руке от обычного (настройки): 1 — как есть, от половины до вдвое. */
  /** Размер карт моей руки: на телефоне по умолчанию 85% — крупнее они загораживают стол; в настройках меняется (и запоминается). */
  let handSize = innerWidth < 500 ? 0.7 : 1;
  const rig = { yaw: 0, pitch: -40, lean: 0, side: 0, fov: baseFov, panX: 0, panZ: 0 };
  const neck = neckNew();
  /** Стенд дизайна: шея не устаёт и не возвращается сама — камера стоит там, где её оставили (в игре шея работает как задумано). */
  let neckFree = false;
  /**
   * Рука с картами едет за камерой с запозданием, как в FPS: повернул взгляд — вся рука целиком (карты и кисть — один слой `handRoot`) чуть позади и догоняет.
   * Это только отрисовка на клиенте: на сервер уходит одна точка камеры, и остальные собирают руку из неё же.
   */
  const lag = { yaw: 0, pitch: 0, prevYaw: 0, prevPitch: 0 };
  const LAG = { gain: 0.9, decay: 6, max: 0.2 };
  /** Высота руки в кадре, пиксели (вверх — плюс): её ставит верхняя ручка, и она остаётся; рука едет с камерой жёстко, как одна точка. */
  let heightPx = 0;
  /** Карта моей руки, которую тронули: приподнята над остальными (сразу, не дожидаясь движения; после тапа так и остаётся, пока не тронут другое). */
  let liftedId: string | null = null;
  /** Где стоит верхний грип по ширине экрана (его двигают влево-вправо и он остаётся); `null` — по центру. Вокруг него карты раздвинуты (`peekShift`). */
  let gripSx: number | null = null;
  /** Раздвижка включается движением грипа, а не его наличием: `gripAmt` 0…1 растёт, пока грип ведут влево-вправо, и после отпускания плавно сходит на нет за `peekReturnMs`,
   *  пока сам грип ползёт обратно в центр. */
  let gripAmt = 0, gripDrag = false, gripRelAt = 0, gripRelX = 0, gripAmt0 = 0, peekReturnMs: number = PEEK.returnMs;
  const HEIGHT = { min: -400, max: 150 };
  /** Пиксель экрана в единицах кадра руки: рука идёт за язычком один к одному. */
  const pxUnit = (): number => (2 * -CAMHAND.at.z * Math.tan((camera.fov * DEG) / 2)) / Math.max(1, renderer.domElement.getBoundingClientRect().height);
  const handOffset = () => ({ x: 0, y: (heightPx * pxUnit()) / (Math.tan((baseFov * DEG) / 2) / Math.tan((CAMHAND.refFov * DEG) / 2)) });
  const sideYaw = (ch: Chair) => -ch.angle;
  /** Моя голова: где она, куда смотрит, ушла ли на другую сторону и какой поворот слать остальным. */
  function myHeadNow(ch: Chair): { head: Point3; yaw: number; away: boolean; sent: number; hand: Point3 } {
    const f = camera.getWorldDirection(new THREE.Vector3()), sh = shoulders3(ch.angle, stanceNow(), seatPull);
    if (camMode === "orbit") {
      const yaw = Math.atan2(f.x, -f.z) / DEG, head = headOf(sh, { x: camera.position.x, y: camera.position.z, h: camera.position.y }, 0, yaw);
      return { head, yaw, away: awayOf(sh, yaw), sent: yaw, hand: leftHandOf(head, yaw) };
    }
    // Голова сидит на месте и смотрит куда хочет; остальным шлём поворот в пределах своей стороны: дальше они сочли бы голову ушедшей.
    const yaw = rig.yaw + rig.side * BACK.max, lim = AWAY_DEG - 1, sent = sideYaw(ch) + Math.max(-lim, Math.min(lim, wrap(yaw - sideYaw(ch))));
    if (camMode === "top") { const head = headAt(sh, rig.lean, rig.side); return { head, yaw, away: false, sent, hand: leftHandOf(head, yaw) }; }
    // В `head` рука с картами — в кадре внизу: камера едет с головой, и рука с ней, не уплывая при наклоне взгляда.
    const head = { x: camera.position.x, y: camera.position.z, h: eyeY() };
    return { head, yaw, away: false, sent, hand: camHandPoint(head, yaw, rig.pitch, heightPx * pxUnit()) };
  }
  /** Поставить камеру по состоянию: голова от плеч стула (с наклоном шеи в `head`), взгляд — yaw и pitch. */
  function applyRig(): void {
    const ch = myChair();
    if (!ch || camMode === "orbit") return;
    const sh = shoulders3(ch.angle, stanceNow(), seatPull);
    if (camMode === "top") {
      // Сверху: камера над серединой стола, вверху кадра — куда смотрит `yaw`; выше стоя и в покое, ниже — когда шея наклонена.
      if (Math.abs(camera.fov - TOP.fov) > 1e-3) { camera.fov = TOP.fov; camera.updateProjectionMatrix(); }
      const rest = topHeight(camera.aspect, TOP.fov, (sh.h + NECK_LEN.up) / (SHOULDER_H.sit + NECK_LEN.up));
      const h = rest * (1 - rig.lean * (1 - HEAD.min / (sh.h + NECK_LEN.up))), y = rig.yaw * DEG;
      camera.up.set(Math.sin(y), 0, -Math.cos(y));
      camera.position.set(rig.panX, h, rig.panZ);
      camera.lookAt(rig.panX, 0, rig.panZ);
      camera.updateMatrixWorld();
      return;
    }
    camera.up.set(0, 1, 0);
    if (!viewHManual) viewH = autoViewH(rig.fov, camera.aspect);
    else viewH = clampViewH(viewH);
    const pos = headAt(sh, rig.lean, rig.side);
    const fov = rig.fov;
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // Голова идёт по кругу вокруг стола — и взгляд поворачивается вместе с ней: стол остаётся там же в кадре, а не уплывает вбок.
    const y = (rig.yaw + rig.side * BACK.max) * DEG, p = rig.pitch * DEG;
    camera.position.set(pos.x, pos.h + viewH, pos.y);
    camera.lookAt(pos.x + Math.sin(y) * Math.cos(p), pos.h + viewH + Math.sin(p), pos.y - Math.cos(y) * Math.cos(p));
    camera.updateMatrixWorld();
  }
  /**
   * СТУЛ ПЕРЕСЕЛИ — ВЗГЛЯД ОСТАЁТСЯ ТЕМ ЖЕ: свой стул встал на другой угол (пересадка, возвращение в комнату), голова едет к новому месту, а взгляд поворачивается ровно на
   * этот угол — смотрел в центр стола, так и смотришь; будто стол провернулся перед тобой, а ты не сдвинулся.
   */
  let seatAngleSeen: number | null = null;
  function syncSeatAngle(): void {
    const ch = myChair();
    if (!ch) return;
    if (seatAngleSeen !== null && seatAngleSeen !== ch.angle) {
      const d = wrap(seatAngleSeen - ch.angle);
      rig.yaw = wrap(rig.yaw + d);
      if (gyroOff !== null) gyroOff = wrap(gyroOff + d);
      lag.prevYaw = rig.yaw;
      if (camMode !== "orbit") applyRig();
    }
    seatAngleSeen = ch.angle;
  }
  function rigHome(): void {
    const ch = myChair();
    if (!ch) return;
    gyroOff = null; gyroTilt = 0;
    rig.yaw = sideYaw(ch);
    rig.lean = 0;
    rig.side = 0;
    rig.panX = rig.panZ = 0;
    rig.fov = baseFov;
    Object.assign(neck, neckNew());
    rig.pitch = camMode === "top" ? -90 : pitchToCentre(headAt(shoulders3(ch.angle, stanceNow(), seatPull), 0));
    lag.yaw = lag.pitch = 0; lag.prevYaw = rig.yaw; lag.prevPitch = rig.pitch;
    camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
    applyRig();
  }
  function home(): void { if (camMode === "orbit") homeOrbit(); else rigHome(); }
  /** Сверху: сдвинуть камеру по столу так, чтобы точка сукна под пальцем осталась под ним (из `from` в `to`, экранные точки). */
  function panBy(from: { x: number; y: number }, to: { clientX: number; clientY: number }): void {
    if (camMode !== "top") return;
    const a = onFelt({ clientX: from.x, clientY: from.y }), b = onFelt(to);
    if (!a || !b) return;
    const px = rig.panX + a.x - b.x, pz = rig.panZ + a.z - b.z, m = Math.hypot(px, pz), lim = R * PAN_LIMIT;
    rig.panX = m > lim ? (px / m) * lim : px; rig.panZ = m > lim ? (pz / m) * lim : pz;
    applyRig(); draw(); sendBody();
  }
  /** Намерение: повернуть взгляд (в орбите — обойти стол). */
  function lookBy(dyaw: number, dpitch: number): void {
    neck.idle = 0;
    if (camMode === "orbit") return;
    headGoal = null;
    // С гиро палец поправляет курс (телефон сам взгляд держит): сдвигаем «ноль» датчика, а не сам взгляд.
    if (gyro.on() && camMode === "head") { gyroOff = wrap((gyroOff ?? 0) + dyaw); gyroTilt = Math.max(-60, Math.min(60, gyroTilt + dpitch)); applyGyro(); draw(); return; }
    rig.yaw = wrap(rig.yaw + dyaw);
    if (camMode !== "top") rig.pitch = Math.max(CAM.pitch.min, Math.min(CAM.pitch.max, rig.pitch + dpitch));
    applyRig(); touched = true; draw(); sendBody();
  }
  /** Посадка: на сколько стул придвинут к столу, единицы стола. Не шея: сама не возвращается, плечи едут вместе с головой. */
  let seatPull = 0;
  /** ВЫСОТА ОБЗОРА (DEV): камера выше или ниже головы, только для моего экрана. Тело, рука и то, что видят остальные, не меняются; карты в кадре стоят как стояли. */
  let viewH = 0, viewHManual = false;
  /** Пределы высоты обзора: сидя — −3…+10; стоя — 7.5…12 (ниже стоя уже не «стоя»). */
  const viewHRange = (): { min: number; max: number } => (stanceNow() === "stand" ? { min: 7.5, max: 12 } : { min: -3, max: 10 });
  const clampViewH = (v: number): number => { const r = viewHRange(); return Math.max(r.min, Math.min(r.max, v)); };
  const setViewHNorm = (t: number): void => { const r = viewHRange(); viewHManual = true; viewH = r.min + Math.max(0, Math.min(1, t)) * (r.max - r.min); applyRig(); layout(store.state); draw(); };
  /**
   * ВЫСОТА ОБЗОРА САМА — от того, сколько стола видно по ширине: широкий обзор (десктоп, ≥ 100° по горизонтали) — 0; узкий (телефон в портрете, ≈ 39°) — +3,
   * между ними плавно; стоя — ещё на 6 выше (десктоп 6, телефон 9). От устройства не зависит: окно сузили, повернули или поменяли обзор в настройках — высота пересчитывается, пока ползунок не трогали.
   */
  const autoViewH = (vfovDeg: number, aspect: number): number => {
    const hfov = (2 * Math.atan(Math.tan((vfovDeg * DEG) / 2) * aspect)) / DEG;
    // Стоя обзор выше ещё на 6: десктоп 0 → 6, телефон +3 → +9.
    const sit = 3 * Math.max(0, Math.min(1, (100 - hfov) / 54));
    return stanceNow() === "stand" ? clampViewH(sit + 6) : sit;
  };
  const eyeY = (): number => camera.position.y - (camMode === "head" ? viewH : 0);
  /** ПЕРЕСАДКА: вид сверху без тел, рук и голов; свой стул тянут по кругу (`angle` — куда, `null` — пока не тронут), потом «Готово» или «Отмена». */
  let reseat: { was: CamMode; angle: number | null; pull: number | null; pid: number | null } | null = null;
  let figuresOn = true;
  /** Пунктирный след старого места своего стула — пока его пересаживают, видно, откуда начал. */
  let reseatGhost: THREE.Group | null = null;
  function makeReseatGhost(): void {
    const ch = myChair();
    if (!ch) return;
    const mat = new THREE.LineDashedMaterial({ color: store.me.ink, dashSize: 0.28, gapSize: 0.2, transparent: true, opacity: 0.95, depthTest: false });
    const half = CHAIR.seat / 2, y = CHAIR.seatY + CHAIR.thick / 2 + 0.08;
    // Сиденье квадратом и спинка отрезком — как стоял стул.
    const line = (pts: number[][]) => { const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, y, z))), mat); l.computeLineDistances(); l.renderOrder = 8; return l; };
    const g = new THREE.Group();
    g.add(line([[-half, -half], [half, -half], [half, half], [-half, half]]), line([[-half, half], [half, half], [half, half + 0.05], [-half, half + 0.05]]));
    const one = chairObjs.get(ch.id), at = seatPoint(ch.angle, CHAIR.radius + CHAIR.pushed * (one?.k ?? 0) - seatPull), dir = seatPoint(ch.angle, 1);
    g.position.set(at.x, 0, at.y);
    g.rotation.y = Math.atan2(dir.x, dir.y);
    scene.add(g);
    reseatGhost = g;
  }
  function setReseat(on: boolean): void {
    if (on === (reseat !== null)) return;
    if (on) {
      reseat = { was: camMode, angle: null, pull: null, pid: null };
      makeReseatGhost();
      setCamMode("orbit");
      camera.fov = 50; camera.updateProjectionMatrix();
      orbit.enablePan = true;
      orbit.minDistance = 3;
      orbit.minPolarAngle = orbit.maxPolarAngle = 0.0001;
      // Стол вместе со стульями влезает и в ширину, и в высоту кадра (с запасом под верх и низ худа).
      const fit = CHAIR.radius + CHAIR.seat / 2 + CHAIR.pushed * 0.5, aspect = host.clientWidth / Math.max(1, host.clientHeight), dist = (fit * 1.12) / (Math.tan((camera.fov * DEG) / 2) * Math.min(1, aspect));
      orbit.maxDistance = Math.max(60, dist * 1.4);
      // Свой стул — внизу кадра, на шести часах: камера чуть смещена в сторону своего стула, и «вверх» экрана идёт от него к середине стола.
      const side = (myChair()?.angle ?? 0) * DEG, off = dist * 0.0001;
      camera.position.set(Math.sin(side) * off, dist, Math.cos(side) * off);
      orbit.target.set(0, 0, 0);
      orbit.update();
    } else {
      const was = reseat!.was;
      reseat = null;
      if (reseatGhost) { scene.remove(reseatGhost); reseatGhost = null; }
      orbit.enablePan = false;
      orbit.minDistance = 5; orbit.maxDistance = 40;
      orbit.minPolarAngle = 0; orbit.maxPolarAngle = 85 * DEG;
      setCamMode(was);
    }
    reseatSync();
    layout(store.state); draw();
  }
  /** Что видно при пересадке: стол, стулья, карты на столе — и всё; тела, руки, головы и карты в руках скрыты. */
  function reseatSync(): void {
    const on = reseat !== null;
    heads.visible = figuresOn && !on;
    chairRoot.visible = figuresOn || on;
    myBody.visible = heads.visible; myArm.visible = heads.visible;
    for (const [id, o] of cards) o.group.visible = !(on && (fromOf.get(id)?.in === "hand" || o.target.onCamera));
  }
  function reseatDone(ok: boolean): void {
    const r = reseat, ch = myChair();
    if (ok && r && r.angle !== null && ch && r.angle !== ch.angle) store.send({ t: "reseat", angle: r.angle });
    if (ok && r && r.pull !== null) setSeatPull(r.pull);
    setReseat(false);
  }
  function setSeatPull(next: number): void {
    next = Math.max(SEAT_PULL.min, Math.min(SEAT_PULL.max, next));
    if (next === seatPull) return;
    headGoal = null;
    seatPull = next;
    applyRig(); layout(store.state); draw(); sendBody();
  }
  function seatBy(d: number): void {
    neck.idle = 0;
    if (camMode !== "head" && camMode !== "top") return;
    setSeatPull(seatPull + d);
  }
  /** Намерение: приблизить (`k` > 1) или отдалить. В `head` — наклон к столу, в `fov` — поле зрения. */
  function zoomBy(k: number): void {
    neck.idle = 0;
    if (camMode === "orbit") return;
    headGoal = null;
    const dl = Math.log(k) * 0.5 * (neck.back > 0 ? 0 : 1);
    if (camMode === "head") {
      // ЗУМ ИДЁТ ТУДА, КУДА СМОТРИТ КАМЕРА: приближение двигает голову по взгляду, отдаление — от него. Взгляд раскладывается на «к середине стола» (наклон)
      // и «вдоль круга стола» (сдвиг к соседу); смотрел в центр — всё по-старому, повернул влево и зумишь — голова уходит по диагонали к соседу.
      const ch = myChair();
      if (ch) {
        const p = headAt(shoulders3(ch.angle, stanceNow(), seatPull), rig.lean, rig.side), r = Math.hypot(p.x, p.y) || 1, y = (rig.yaw + rig.side * BACK.max) * DEG;
        const gx = Math.sin(y), gz = -Math.cos(y), inward = gx * (-p.x / r) + gz * (-p.y / r), along = gx * (-p.y / r) + gz * (p.x / r);
        rig.lean += dl * inward;
        rig.side += (dl * NECK_LEN.reach * along) / (r * BACK.max * DEG);
      }
    } else rig.lean += dl;
    rig.lean = Math.max(-1, Math.min(1, rig.lean));
    rig.side = Math.max(-1, Math.min(1, rig.side));
    const m = Math.hypot(rig.lean, rig.side);
    if (m > 1) { rig.lean /= m; rig.side /= m; }
    applyRig(); draw(); sendBody();
  }
  /**
   * ДВОЙНОЙ ТАП ПО СТОЛУ — голова едет в ту сторону и смотрит туда: зум не оптикой, а шеей. Место берётся из пары (наклон, сдвиг), ближайшей
   * к точке «на `HEAD_STEP` пути до тапа»; дальше всё по обычной шее: натянулась — подержалась и сама вернулась.
   */
  const HEAD_STEP = 0.6;
  let headGoal: { lean: number; side: number; yaw: number | null; pitch: number | null } | null = null;
  function headToward(px: number, py: number): void {
    neck.idle = 0;
    const ch = myChair();
    if (!ch || camMode !== "head" || neck.back > 0) return;
    const sh = shoulders3(ch.angle, stanceNow(), seatPull), now = headAt(sh, rig.lean, rig.side);
    const tx = now.x + (px - now.x) * HEAD_STEP, ty = now.y + (py - now.y) * HEAD_STEP;
    let best = { lean: rig.lean, side: rig.side, d: Infinity };
    for (let i = -20; i <= 20; i += 1) for (let j = -20; j <= 20; j += 1) {
      const lean = i / 20, side = j / 20;
      if (Math.hypot(lean, side) > 1) continue;
      const h = headAt(sh, lean, side), d = Math.hypot(h.x - tx, h.y - ty);
      if (d < best.d) best = { lean, side, d };
    }
    const head = headAt(sh, best.lean, best.side);
    // Смотрит на точку тапа из новой головы — если телефон взгляд не ведёт сам (гиро).
    const look = !gyro.on();
    const yawTo = (Math.atan2(px - head.x, -(py - head.y)) / DEG) - best.side * BACK.max;
    const pitchTo = -Math.atan2(head.h, Math.hypot(px - head.x, py - head.y) || 1) / DEG;
    headGoal = { lean: best.lean, side: best.side, yaw: look ? wrap(yawTo) : null, pitch: look ? Math.max(CAM.pitch.min, Math.min(CAM.pitch.max, pitchTo)) : null };
    draw();
  }
  /** Шаг к цели двойного тапа за кадр: плавно, а не прыжком. Шея вернулась или человек взялся сам — цель снимается. */
  function headGoalStep(dt: number): boolean {
    const g = headGoal;
    if (!g) return false;
    if (neck.back > 0) { headGoal = null; return false; }
    const k = 1 - Math.exp(-dt * 9);
    rig.lean += (g.lean - rig.lean) * k;
    rig.side += (g.side - rig.side) * k;
    let near = Math.abs(g.lean - rig.lean) < 2e-3 && Math.abs(g.side - rig.side) < 2e-3;
    if (g.yaw !== null) { rig.yaw = wrap(rig.yaw + wrap(g.yaw - rig.yaw) * k); near = near && Math.abs(wrap(g.yaw - rig.yaw)) < 0.05; }
    if (g.pitch !== null) { rig.pitch += (g.pitch - rig.pitch) * k; near = near && Math.abs(g.pitch - rig.pitch) < 0.05; }
    if (near) headGoal = null;
    return true;
  }
  /** Намерение: сдвинуть голову вбок, по кругу вокруг стола (`d` — доля предела, + вправо от взгляда). Шея — та же. */
  function sideBy(d: number): void {
    neck.idle = 0;
    if (camMode !== "head") return;
    headGoal = null;
    const ch = myChair();
    if (!ch) return;
    // Вправо от взгляда — в какую сторону по кругу: считаем по тому, где голова и куда она смотрит.
    const p = headAt(shoulders3(ch.angle, stanceNow(), seatPull), rig.lean, rig.side), y = (rig.yaw + rig.side * BACK.max) * DEG;
    const along = -p.y * Math.cos(y) + p.x * Math.sin(y);
    rig.side = Math.max(-1, Math.min(1, rig.side + d * (along >= 0 ? 1 : -1) * (neck.back > 0 ? 0 : 1)));
    applyRig(); draw(); sendBody();
  }
  // ——— ГИРО: поворот телефона — поворот головы (`gyro.ts`) ———
  const gyro = createGyro(() => draw());
  /** Курс сцены минус курс телефона: первое слово датчика (или «домой») ставит его так, что взгляд остаётся там, где был. */
  let gyroOff: number | null = null;
  /** Поправка наклона пальцем поверх датчика, градусы: как `gyroOff` для курса. */
  let gyroTilt = 0;
  function applyGyro(): void {
    if (!gyro.on() || camMode !== "head") return;
    const l = gyro.look();
    if (!l) return;
    if (gyroOff === null) gyroOff = wrap(rig.yaw - l.yaw);
    const yaw = wrap(l.yaw + gyroOff), pitch = Math.max(CAM.pitch.min, Math.min(CAM.pitch.max, l.pitch + gyroTilt));
    if (Math.abs(wrap(yaw - rig.yaw)) < 1e-3 && Math.abs(pitch - rig.pitch) < 1e-3) return;
    rig.yaw = yaw;
    rig.pitch = pitch;
    applyRig(); touched = true; sendBody();
  }
  /** Вкл/выкл гиро. Включать — из жеста пальца (iOS даёт датчик только так). Ответ — что не вышло. */
  // Свернул и открыл снова: датчик начинает счёт заново, и курс гиро мог уехать — первое новое слово «обнуляется» под нынешний взгляд, голова не теряется в пространстве.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) gyroOff = null; });
  addEventListener("pageshow", () => { gyroOff = null; });
  async function gyroToggle(): Promise<string | null> {
    if (gyro.on()) { gyro.stop(); gyroOff = null; gyroTilt = 0; return null; }
    const asked = gyro.start();
    if (camMode !== "head") setCamMode("head");
    gyroOff = null; gyroTilt = 0;
    const note = await asked;
    draw();
    return note;
  }
  function setCamMode(m: CamMode): void {
    camMode = m;
    orbit.enabled = m === "orbit";
    camera.up.set(0, 1, 0);
    camera.fov = m === "orbit" ? 50 : m === "top" ? TOP.fov : baseFov;
    camera.updateProjectionMatrix();
    home();
    touched = false;
    draw(); sendBody(true);
  }
  const rigPtrs = new Map<number, { x: number; y: number; right: boolean; turn: boolean }>();
  // Ввод для головы: один палец или левая кнопка — взгляд; щипок и колесо — приближение (наклон к столу); правая кнопка вверх-вниз и Shift+колесо — посадка (стул
  // ближе-дальше от стола; пальцами её не тянут, чтобы не мешать щипку); оптический зум — только ползунок; стрелки, +/-, `[`/`]`, Home.
  {
    const dom = renderer.domElement, ptrs = rigPtrs;
    const pair = () => { const [a, b] = [...ptrs.values()]; return a && b ? { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ang: Math.atan2(b.y - a.y, b.x - a.x) / DEG } : null; };
    dom.addEventListener("pointerdown", (e) => {
      if (camMode === "orbit" || drag || camLocked) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, right: e.button === 2, turn: e.button === 2 || e.ctrlKey || e.metaKey });
      try { dom.setPointerCapture(e.pointerId); } catch { /* нет такого указателя */ }
    });
    dom.addEventListener("pointermove", (e) => {
      const was = ptrs.get(e.pointerId);
      if (!was || camMode === "orbit" || drag || camLocked) return;
      const before = pair();
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, right: was.right, turn: was.turn });
      if (ptrs.size === 1) {
        // Сверху: палец (левая кнопка) двигает камеру по столу; поворот — правая кнопка или Ctrl/Cmd + левая.
        if (camMode === "top") { if (was.turn) lookBy(-(e.clientX - was.x) * CAM.look, 0); else panBy(was, e); }
        else if (was.right) seatBy((e.clientY - was.y) * CAM.seat);
        else lookBy(-(e.clientX - was.x) * CAM.look, (e.clientY - was.y) * CAM.look);
      } else if (ptrs.size === 2 && before) {
        const now = pair()!;
        // Сверху двумя пальцами: щипок — масштаб, поворот пальцев — поворот камеры, сдвиг середины — движение.
        if (camMode === "top") {
          zoomBy(now.d / Math.max(1, before.d));
          lookBy(-((((now.ang - before.ang) % 360) + 540) % 360 - 180), 0);
          panBy({ x: before.x, y: before.y }, { clientX: now.x, clientY: now.y });
        }
        else { zoomBy(now.d / Math.max(1, before.d)); sideBy((now.x - before.x) * CAM.side); }
      }
    });
    // Двойной тап по пустому месту (не по карте, не по кнопке): голова едет туда.
    const taps = new Map<number, { x: number; y: number; at: number }>();
    let lastEmpty = { x: 0, y: 0, at: 0 };
    dom.addEventListener("pointerdown", (e) => { if (ptrs.has(e.pointerId) && ptrs.size === 1) taps.set(e.pointerId, { x: e.clientX, y: e.clientY, at: performance.now() }); else taps.clear(); });
    const up = (e: PointerEvent) => {
      const t = taps.get(e.pointerId), one = ptrs.size === 1;
      taps.delete(e.pointerId);
      ptrs.delete(e.pointerId);
      if (!t || !one || e.type !== "pointerup" || camMode !== "head") return;
      const now = performance.now();
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10 || now - t.at > 300) return;
      if (now - lastEmpty.at < DOUBLE_MS && Math.hypot(e.clientX - lastEmpty.x, e.clientY - lastEmpty.y) < 40) {
        lastEmpty = { x: 0, y: 0, at: 0 };
        const at = onFelt(e);
        if (at) headToward(at.x, at.z);
      } else lastEmpty = { x: e.clientX, y: e.clientY, at: now };
    };
    dom.addEventListener("pointerup", up);
    dom.addEventListener("pointercancel", up);
    // iOS решает про лупу, выноску и зум по двойному тапу уже на `touchstart`: одного CSS мало, жест у стола отменяется тут (pointer-события это не трогает).
    dom.addEventListener("touchstart", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    dom.addEventListener("contextmenu", (e) => { if (camMode !== "orbit") e.preventDefault(); });
    dom.addEventListener("wheel", (e) => { if (camMode === "orbit" || camLocked) return; e.preventDefault(); if (e.shiftKey) seatBy(e.deltaY * CAM.seat); else zoomBy(Math.exp(-e.deltaY * CAM.wheel * 2)); }, { passive: false });
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
      else if (k === "]") seatBy(0.3);
      else if (k === "[") seatBy(-0.3);
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
  interface Pose { by: string; s: Point3; head: Point3; left: Point3; away: boolean; yaw: number; pitch?: number; gaze?: number; curl?: number; handY?: number; right: Point3 | null; ink: string; name: string; strained: boolean; stretch: number }
  /** Где у сидящего за стулом `ch` плечи, голова и руки — общей геометрией стола (`bodies.ts`). Своё тело — нет: своя голова — камера. */
  const poseOf = (ch: Chair, s: Snapshot): Pose | null => {
    const who = s.people.find((p) => p.key === ch.owner);
    if (!who || who.key === store.me.key) return null;
    const b = bodyOf(who.key, ch.angle);
    const sh = shoulders3(ch.angle, b.stance, b.seat ?? 0);
    const head = headOf(sh, b.eye, b.stretch, b.yaw);
    const holding = store.carries.some((c) => c.by === who.key);
    return { by: who.key, s: sh, head, left: b.pitch === undefined ? leftHandOf(head, b.yaw) : camHandPoint(head, b.gaze ?? b.yaw, b.pitch, b.handY ?? 0), away: awayOf(sh, b.yaw), yaw: b.yaw, pitch: b.pitch, gaze: b.gaze, curl: b.curl, handY: b.handY, right: b.right ? { ...b.right, h: holding ? HEAD.lift * head.h : restH(b.right, ch.id) } : null, ink: who.ink, name: who.name, strained: b.stretch > NECK.free, stretch: b.stretch };
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
    const b = bodyOf(who.key, ch.angle), head = headOf(shoulders3(ch.angle, b.stance, b.seat ?? 0), b.eye, b.stretch, b.yaw);
    return b.pitch === undefined ? leftHandOf(head, b.yaw) : camHandPoint(head, b.gaze ?? b.yaw, b.pitch, b.handY ?? 0);
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
  /**
   * РУКА С ЛОКТЕМ: от плеча к локтю и от локтя к кисти, а не одной палкой. Локоть уведён от тела наружу и вниз — плечо чуть наклонено, а не вдоль туловища;
   * сегменты равны и чуть длиннее половины расстояния, поэтому рука никогда не вытягивается в струну. `side`: −1 левая, +1 правая; `out` — вправо от тела.
   */
  const armParts = (shoulder: THREE.Vector3, hand: THREE.Vector3, side: -1 | 1, out: THREE.Vector3, r: number, mat: THREE.Material): THREE.Object3D[] => {
    const d = Math.max(1e-3, shoulder.distanceTo(hand)), seg = Math.max(d * 0.505, 1.1 * dollK), axis = hand.clone().sub(shoulder).divideScalar(d);
    const pole = out.clone().multiplyScalar(side).add(new THREE.Vector3(0, -0.7, 0));
    pole.addScaledVector(axis, -pole.dot(axis));
    if (pole.lengthSq() < 1e-6) pole.set(side * out.x, -1, side * out.z);
    pole.normalize();
    const bend = Math.sqrt(Math.max(0, seg * seg - (d / 2) * (d / 2)));
    const elbow = shoulder.clone().addScaledVector(axis, d / 2).addScaledVector(pole, bend);
    return [stick(shoulder, elbow, r, mat), stick(elbow, hand, r, mat), ball(elbow, r * 1.25, mat)];
  };
  /** Где правая рука отдыхает на столе, когда ничего не делает: на сукне перед своим плечом, чуть вправо. */
  const restRightOf = (sh: Point3): Point3 => {
    const r = Math.hypot(sh.x, sh.y) || 1, k = DOLL.bar * 1.15;
    const f = 2.4 * dollK;
    return { x: sh.x - (sh.x / r) * f + (sh.y / r) * k, y: sh.y - (sh.y / r) * f - (sh.x / r) * k, h: 0.3 };
  };
  /** Кукла в единицах стола — как у стола в 2D (`bodyView.ts`): толщина палки, полуширина плеч, руки, досягаемость. */
  const DOLL0 = { spine: 0.21, bar: 1.4, arm: 0.13, hand: 0.32 };
  const DOLL = { ...DOLL0, reach: 2 * TABLE_RADIUS + 2, ref: 12, max: 4 };
  /** РАЗМЕР ЛЮДЕЙ (толщина палок, кисти, ширина плеч, кружок головы) — множитель; DEV-ползунок в настройках (только локально). */
  let dollK = 0.8;
  DOLL.spine = DOLL0.spine * dollK; DOLL.bar = DOLL0.bar * dollK; DOLL.arm = DOLL0.arm * dollK; DOLL.hand = DOLL0.hand * dollK;
  const headW = (): number => 2 * dollK, headH = (): number => 2.5 * dollK;
  /**
   * ТЕЛО ЦЕЛИКОМ УМЕНЬШАЕТСЯ (не только толщина палок): плечи, шея, голова и низ позвоночника — от точки, где тело привязано к столу (у плеча, на уровне сукна). Центр остаётся на
   * месте, голова и плечи опускаются; руки тянутся к тем же картам (их места — на столе), поэтому локти сами подстраиваются.
   */
  function dollBody(sh: Point3, head: Point3): { S: THREE.Vector3; H: THREE.Vector3; base: THREE.Vector3 } {
    const A = new THREE.Vector3(sh.x, 0, sh.y), sc = (p: Point3) => A.clone().add(new THREE.Vector3(p.x, p.h, p.y).sub(A).multiplyScalar(dollK));
    return { S: sc(sh), H: sc(head), base: sc({ ...sh, h: -7 }) };
  }
  function setDollScale(k: number): void {
    dollK = Math.max(0.4, Math.min(1.4, k));
    DOLL.spine = DOLL0.spine * dollK; DOLL.bar = DOLL0.bar * dollK; DOLL.arm = DOLL0.arm * dollK; DOLL.hand = DOLL0.hand * dollK;
    bodiesCam = ""; myBodySig = "";
    layout(store.state); draw();
  }
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
      body.userData.chair = ch.id;
      const mat = inkOf(pose.ink), { S, H, base } = dollBody(pose.s, pose.head), L = V(handRest(pose.left, ch, ch.pose.tuck || ch.croupier ? 1 : 0, ch.hand.length));
      // Правое плечо — справа от взгляда в середину стола.
      const r = Math.hypot(pose.s.x, pose.s.y) || 1, rightDir = new THREE.Vector3(pose.s.y / r, 0, -pose.s.x / r);
      const shL = S.clone().addScaledVector(rightDir, -DOLL.bar), shR = S.clone().addScaledVector(rightDir, DOLL.bar);
      body.add(stick(base, S, DOLL.spine, mat), stick(shL, shR, DOLL.spine, mat), ball(shL, DOLL.spine, mat), ball(shR, DOLL.spine, mat));
      // Левая рука с картами — всегда: и с головой у тела, и когда голова ушла на ту сторону стола (рука с ней).
      body.add(...armParts(shL, L, -1, rightDir, DOLL.arm * farK(L), mat), ball(L, DOLL.hand * farK(L), mat));
      body.userData.left = L;
      if (pose.away) {
        // Ушёл головой на ту сторону стола — к голове ниточка его цвета, руки ушли с головой.
        const tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([S, H]), new THREE.LineDashedMaterial({ color: pose.ink, dashSize: 0.35, gapSize: 0.3, transparent: true, opacity: 0.6 }));
        tether.computeLineDistances();
        body.add(tether);
      } else {
        for (const part of neckParts(S, H, DOLL.spine * farK(H), pose.stretch, mat)) body.add(part);
        // Правая рука в покое лежит на столе перед плечом (`restRightOf`); ведёт карту — идёт к ней.
        const rightAt = pose.right ?? restRightOf(pose.s);
        if (Math.hypot(rightAt.x - (pose.s.x + rightDir.x * DOLL.bar), rightAt.y - (pose.s.y + rightDir.z * DOLL.bar)) <= DOLL.reach) {
          const Rh = V(pose.right ? pose.right : { x: rightAt.x, y: rightAt.y, h: restH(rightAt, ch.id) });
          body.add(...armParts(shR, Rh, 1, rightDir, DOLL.arm * farK(Rh), mat), ball(Rh, DOLL.hand * farK(Rh), mat));
          body.userData.right = Rh;
        }
      }
      // Голова — кружок его цвета с именем, всегда к камере; глубина честная — стол её перекрывает.
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex(pose.name, pose.ink) }));
      head.scale.set(headW(), headH(), 1);
      head.center.set(0.5, 1 - 128 / 320);
      head.position.copy(H);
      head.userData.head = pose.by;
      head.userData.base = H.clone(); head.userData.shoulder = S.clone(); head.userData.shift = DOLL.spine * farK(H) * 1.6 + 0.2;
      body.add(head);
      heads.add(body);
    }
    headsFront();
  }

  /**
   * ГОЛОВА СПЕРЕДИ ТЕЛА ПЕРЕКРЫВАЕТ ШЕЮ: когда камера видит голову ближе, чем плечи, кружок выдвинут к камере на толщину шеи — шея не торчит из него «пикселем».
   * Размер на экране тот же (кружок во столько же раз мельче, во сколько ближе). Голова за телом стоит на месте — тело её закрывает по глубине.
   */
  function headsFront(): void {
    if (!heads.visible) return;
    for (const body of heads.children) for (const sprite of body.children) {
      const base = sprite.userData.base as THREE.Vector3 | undefined, shoulder = sprite.userData.shoulder as THREE.Vector3 | undefined;
      if (!base || !shoulder) continue;
      const d = camera.position.distanceTo(base), front = d < camera.position.distanceTo(shoulder), shift = front ? Math.min(sprite.userData.shift as number, d * 0.4) : 0;
      sprite.position.copy(base);
      if (shift > 0) sprite.position.addScaledVector(camera.position.clone().sub(base).normalize(), shift);
      const k = d > 0 ? (d - shift) / d : 1;
      sprite.scale.set(headW() * k, headH() * k, 1);
    }
  }

  // ——— карты ———
  const cards = new Map<string, CardObj>();
  const cardRoot = new THREE.Group();
  scene.add(cardRoot);
  /**
   * ПОЛЕ КРУГА ХОДА — тёмный диск на сукне, как у обычного стола: поле очерчено заливкой, а не линией. Он под картами и на месте
   * всегда, с картами и без: меняется только то, что в нём лежит.
   */
  /**
   * ПОЛЕ ДВУХ СТРЕЛОК на нём — тех же, что рисует обычный стол (`felt.ts`): луч из середины на первую вошедшую карту и знак «ждут
   * его» на кромке, в секторе того, чей ход, и в его цвете. Рисуются теми же функциями на прозрачной текстуре и лежат на сукне
   * над диском, под картами.
   */
  interface RingField { field: THREE.Mesh; marks: THREE.Mesh; zone: THREE.Line; glow: THREE.Mesh; slot: THREE.LineLoop; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; key: string }
  const ringFields = new Map<string, RingField>();
  /** Радиус приёмки круга: карта, брошенная в него, ложится в круг. Тот же круг рисуется пунктиром, пока карту несут. */
  const RING_CATCH = 3.2;
  const RING_FIELD = { alpha: 0.28, lift: 0.003, markLift: 0.006, px: 110 };
  /** Сторона текстуры стрелок в единицах стола: круг, его знак «ждут» снаружи и поля. */
  const MARKS_SIDE = 2 * (RING_SPREAD + 1.6);
  function ringFieldFor(p: Pile, s: Snapshot): void {
    let f = ringFields.get(p.id);
    if (!f) {
      const field = new THREE.Mesh(new THREE.CircleGeometry(RING_SPREAD, 96), new THREE.MeshBasicMaterial({ color: 0x0b0704, transparent: true, opacity: RING_FIELD.alpha, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      field.rotation.x = -Math.PI / 2;
      field.renderOrder = 1;
      const side = Math.round(MARKS_SIDE * RING_FIELD.px), canvas = document.createElement("canvas");
      canvas.width = canvas.height = side;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const marks = new THREE.Mesh(new THREE.PlaneGeometry(MARKS_SIDE, MARKS_SIDE), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      marks.rotation.x = -Math.PI / 2;
      marks.renderOrder = 2;
      // Под прицелом: пунктир приёмки, подсвеченный круг и контур места, куда карта ляжет, — как в обычном столе.
      const zone = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.sin((i / 96) * Math.PI * 2) * RING_CATCH, 0, -Math.cos((i / 96) * Math.PI * 2) * RING_CATCH))), new THREE.LineDashedMaterial({ color: 0xf2c14e, dashSize: 0.22, gapSize: 0.16, transparent: true, depthWrite: false }));
      zone.computeLineDistances();
      zone.renderOrder = 3; zone.visible = false;
      const glow = new THREE.Mesh(new THREE.CircleGeometry(RING_CATCH, 96), new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      glow.rotation.x = -Math.PI / 2; glow.renderOrder = 1; glow.visible = false;
      const slot = new THREE.LineLoop(cardEdge, new THREE.LineBasicMaterial({ color: 0xf2c14e, transparent: true, depthWrite: false }));
      slot.renderOrder = 4; slot.visible = false;
      scene.add(field, marks, zone, glow, slot);
      f = { field, marks, zone, glow, slot, ctx: canvas.getContext("2d")!, tex, key: "" };
      ringFields.set(p.id, f);
    }
    f.zone.position.set(p.x, RING_FIELD.markLift + 0.002, p.y);
    f.glow.position.set(p.x, RING_FIELD.lift + 0.001, p.y);
    f.field.position.set(p.x, RING_FIELD.lift, p.y);
    f.marks.position.set(p.x, RING_FIELD.markLift, p.y);
    // Первая вошедшая карта и тот, кого ждут: перерисовка — только когда одно из двух поменялось.
    const first = p.cards[0]?.turn;
    const awaited = s.rules.turnMark && s.play?.turn ? s.people.find((x) => x.key === s.play!.turn) : undefined;
    const seat = awaited?.seat ? s.chairs.find((c) => c.id === awaited.seat) : undefined;
    const waiting = seat && !seat.croupier ? { turn: ringTurnOfSeat(seat.angle), ink: awaited!.ink } : null;
    const key = JSON.stringify([first ?? null, waiting]);
    if (key === f.key) return;
    f.key = key;
    const g = f.ctx, side = g.canvas.width;
    g.clearRect(0, 0, side, side);
    g.save();
    g.translate(side / 2, side / 2);
    g.scale(RING_FIELD.px, RING_FIELD.px);
    if (first !== undefined) ringArrowFromMiddle(g, first);
    if (waiting) { g.rotate((waiting.turn * Math.PI) / 180); turnMark(g, waiting.ink ?? SEAT.ink, RING_SPREAD); }
    g.restore();
    f.tex.needsUpdate = true;
  }
  const fromOf = new Map<string, From>();
  function cardObj(id: string): CardObj {
    let o = cards.get(id);
    if (o) return o;
    const group = new THREE.Group();
    const front = new THREE.Mesh(cardShape, bendMaterial());
    const back = new THREE.Mesh(cardShape, bendMaterial());
    back.rotation.y = Math.PI;
    back.position.z = -0.001;
    front.castShadow = back.castShadow = true;
    front.userData.card = back.userData.card = id;
    // Выделена лассо — рамка цвета выделившего.
    const ring = new THREE.LineLoop(cardEdge, new THREE.LineBasicMaterial({ color: 0xf2c14e, linewidth: 2 }));
    ring.visible = false;
    // Тень на карте: прозрачный слой над каждой стороной — рисует только тень от несомых карт и рук (сама карта без света, поэтому тень принимать не может).
    const shades = [0, 1].map((side) => {
      const m = new THREE.Mesh(cardShape, new THREE.ShadowMaterial({ opacity: 0.34, depthWrite: false }));
      m.receiveShadow = true; m.raycast = () => {};
      if (side) { m.rotation.y = Math.PI; m.position.z = -0.0035; } else m.position.z = 0.0025;
      return m;
    });
    // Свечение цвета несущего у карты, которую держит чужой палец: лежит в плоскости карты и живёт в её группе — крутится, переворачивается и растёт вместе с ней, с обеих сторон.
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W + 1, CARD_H + 1), new THREE.MeshBasicMaterial({ map: cardGlowTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.9 }));
    halo.visible = false; halo.raycast = () => {}; halo.renderOrder = 5; halo.position.z = -0.0005;
    group.add(front, back, ring, halo, ...shades);
    o = { group, front, back, shades, ring, halo, target: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 }, faceUrl: "", backUrl: "" };
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
  /**
   * Лежащую позу `p` наклоняет к глазу `eye` вокруг центра карты (кратчайшим поворотом, поэтому «верх» карты остаётся к несущему) на долю
   * `CARRY_TILT.face`; низ карты не уходит под сукно — центр приподнимается.
   */
  function faceEye(p: Place, eye: THREE.Vector3): Place {
    const to = eye.clone().sub(p.pos);
    if (to.lengthSq() < 1e-6) return p;
    to.normalize();
    const full = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to).multiply(p.quat);
    p.quat = p.quat.clone().slerp(full, CARRY_TILT.face);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(p.quat), flatness = Math.abs(n.y);
    const low = (CARD_H / 2) * Math.sqrt(Math.max(0, 1 - flatness * flatness)) * p.scale + CARRY_TILT.floor;
    p.pos.y = Math.max(p.pos.y, low);
    return p;
  }
  /** Лежащую позу `p` наклоняет к точке `at` (по сукну) на `deg` градусов вокруг центра карты; низ не уходит под сукно. */
  function tiltToward(p: Place, at: THREE.Vector3, deg: number): Place {
    const to = at.clone().sub(p.pos).setY(0);
    if (to.lengthSq() < 1e-6) return p;
    to.normalize();
    p.quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0).cross(to).normalize(), deg * DEG).multiply(p.quat);
    const flat = Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(p.quat).y);
    p.pos.y = Math.max(p.pos.y, (CARD_H / 2) * Math.sqrt(Math.max(0, 1 - flat * flat)) * p.scale + CARRY_TILT.floor);
    return p;
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
   * СИСТЕМНЫЙ ОТСТУП СНИЗУ — полоса «домой» айфона: сколько скажет устройство или Telegram, и ни пикселя сверх.
   * Меряется живым элементом: CSS знает, JS — нет. Нижняя панель и рука встают выше него.
   */
  const safeProbe = document.createElement("div");
  safeProbe.style.cssText = "position:fixed;left:0;bottom:0;width:0;visibility:hidden;pointer-events:none;height:max(env(safe-area-inset-bottom,0px),var(--tg-safe-area-inset-bottom,0px))";
  document.body.append(safeProbe);
  const safeBottom = (): number => safeProbe.offsetHeight;
  /**
   * Моя рука на экране: несомую карту в ней не считают (её место — у пальца), а если её держат над рукой — в руке
   * щель под неё (`drag.gap`): соседи расступаются, как у стола.
   */
  /**
   * ОТПУЩЕННАЯ В СВОЮ РУКУ карта стоит в щели, куда её положили, пока стол не ответил: порядок руки по снимку тянул бы её обратно —
   * в старую щель или туда, откуда взяли (с сукна, из стопки), и она летела бы дважды.
   */
  let incoming: { id: string; i: number; key: string; until: number; card: SeenCard } | null = null;
  const incomingNow = () => (incoming && performance.now() < incoming.until && fromKey(incoming.id) === incoming.key ? incoming : null);
  /** Моя рука со всем, что в неё уже положили, а стол ещё не подтвердил. */
  const handAll = (ch: Chair): SeenCard[] => {
    const r = incomingNow();
    return r && !ch.hand.some((c) => c.id === r.id) ? [...ch.hand, r.card] : ch.hand;
  };
  const handCards = () => {
    const ch = myChair();
    if (!ch) return [];
    const list = handAll(ch).filter((c) => !(drag?.moved && c.id === drag.id));
    const r = incomingNow();
    const c = r ? list.find((x) => x.id === r.id) : undefined;
    if (!r || !c) return list;
    const rest = list.filter((x) => x !== c);
    rest.splice(Math.min(r.i, rest.length), 0, c);
    return rest;
  };
  /**
   * ГЕОМЕТРИЯ РУКИ ВИДА «СВЕРХУ» с учётом высоты руки (язычок): пол — верх нижней строки (и лист вкладки над ней), низ средней карты — так,
   * чтобы над полкой торчала нужная доля карты (`visFrac`); на столе — обычная раскладка.
   */
  const topGeom = (ch: Chair, n: number, bl: PoseBlend | undefined): Geom => {
    const g0 = mineGeomOf(glass(), ch.pose, n, ch.id, bl, safeBottom());
    if (!levelOn || n === 0 || levelPose(handLevel) === "tuck") return g0;
    const k = Math.floor((n - 1) / 2), bottom0 = g0.slots[k]!.y + g0.h / 2, target = trayTopPx() + g0.h * (1 - visFrac(handLevel));
    return mineGeomOf(glass(), ch.pose, n, ch.id, bl, safeBottom() - (target - bottom0));
  };
  const handGeom = (): Geom | null => { const ch = myChair(); return ch ? topGeom(ch, handCards().length + (drag?.moved && drag.gap !== null ? 1 : 0), blend) : null; };
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
  const CAMHAND = { at: new THREE.Vector3(0, -0.92, -2.3), card: 0.486, room: 3.1, tilt: -12, pop: 0.5, near: 0.45, others: 1.15, curl: 1, tiltLow: 20, refFov: 65 } as const;
  const camBasis = (yaw: number, pitch: number): THREE.Matrix4 => {
    const y = yaw * DEG, p = pitch * DEG, f = new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)), r = new THREE.Vector3(Math.cos(y), 0, Math.sin(y));
    return new THREE.Matrix4().makeBasis(r, r.clone().cross(f), f.clone().negate());
  };
  /** Точка руки в кадре головы `head`, взгляд `yaw`, `pitch`. */
  const camHandPoint = (head: Point3, yaw: number, pitch: number, handY = 0): Point3 => { const at = CAMHAND.at.clone().add(new THREE.Vector3(0, handY, 0)).applyMatrix4(camBasis(yaw, pitch)); return { x: head.x + at.x, y: head.y + at.z, h: head.h + at.y }; };
  /**
   * ШИРИНА МОЕЙ РУКИ — одна непрерывная ось `handWidth` (0…1), её тянет левая ручка и щипок двух пальцев; свой предел — экран:
   *   до `stack` — стопкой (карты сходятся в одну), дальше — веер, и он держится до `fanTo`; выше — рука встаёт в ряд и просто расширяется,
   *   пока карты не перестанут сжиматься (или не кончится экран). Высота тоже влияет на веер: поднял руку ручкой — веер выпрямляется в ряд.
   * Остальным уходят только флаги позы (стопкой, веер, в ряд): ширину они видят стандартную для позы.
   */
  const WIDTH = { stack: 0.12, rowFrom: 0.7, fanTo: 0.75, max: 1.5, px: 220, rise: 150, defaults: { shrink: 0.05, fan: 0.68, row: 1 }, othersRow: 4.2 };
  /** Загиб веера по умолчанию, 0…1. */
  /** Самый крутой наклон края веера на широком экране, рад (≈ 26°). */
  const FAN_EDGE = 0.45;
  /** Размах (в ширинах карты от середины до крайней), до которого край веера наклонён на `FAN_EDGE`; шире рука — край кладётся положе (веер выпрямляется), чтобы уголок крайней карты оставался над нижней строкой. */
  const FAN_REACH = 2.4;
  /** Размах, при котором на широком экране веер распрямлён наполовину; шире — ещё положе. */
  const FAN_FLAT_REACH = 2.7;
  const CURL = { rest: 0.7 };
  let handCurl: number = CURL.rest;
  /** Загиб в МОЁМ виде растёт с числом карт: мало карт — рука почти прямая (свои карты у самых глаз сильно искажаются), много — загиб нужен, чтобы уместить веер. Остальным уходит выбранный загиб. */
  /** Загиб моего веера мягче, чем видят остальные: им шлётся прежний `handCurl`, у меня он умножен на `MINE_CURL`. */
  const MINE_CURL = 0.55;
  /** Чем ниже рука, тем сильнее загиб — слегка (до +40% у самого корешка); корешок и ниже — всегда ровно. */
  const mineCurl = (n: number): number => {
    const t = Math.max(0, Math.min(1, (handLevel - LEVEL.spine) / (LEVEL.fan - LEVEL.spine))), flat = Math.max(0, Math.min(1, (handLevel - LEVEL.spine) / 0.06));
    return handCurl * mineCurlK(n) * (levelOn ? (1 + 0.4 * (1 - t)) * flat : 1);
  };
  /** Загиб от числа карт: мало карт — почти прямая рука, много — загиб полный. Так же — у чужих рук (иначе две-три карты у соседа кривятся). */
  const curlOfCount = (n: number): number => Math.max(0.15, Math.min(1, (n - 2) / 8));
  const mineCurlK = (n: number): number => MINE_CURL * curlOfCount(n);
  let handWidth = 0.68, widthLive: number | null = null, widthOver = 0, widthPendingUntil = 0;
  /** Насколько обзор «широкий» (0 — телефон в портрете, 1 — десктоп): по горизонтальному полю зрения 60…90°. На узком ничего не меняется. */
  const wideK = (): number => { const hfov = (2 * Math.atan(Math.tan((baseFov * DEG) / 2) * camera.aspect)) / DEG; return Math.max(0, Math.min(1, (hfov - 60) / 30)); };
  const roomMax = (): number => { const hfov = 2 * Math.atan(Math.tan((CAMHAND.refFov * DEG) / 2) * camera.aspect); return Math.max(1.8, (2 * -CAMHAND.at.z * Math.tan(hfov / 2) * (0.94 - 0.14 * wideK())) / (CAMHAND.card * handSize)); };
  const roomOf = (f: number): number => 1.2 + (roomMax() - 1.2) * Math.max(0, Math.min(1, (f - WIDTH.stack) / (1 - WIDTH.stack)));
  const smooth = (a: number, b: number, x: number): number => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  /** Раскладка моей руки из ширины `f` и подъёма `rise` (0…1): сжатость, веер ↔ ряд, комната в ширинах карты. */
  /**
   * ШИРИНА 0…`WIDTH.max`: до 1 — рука по центру и умещается в экран; ЗА единицу (игрок сам тянет шире) предел растёт дальше экрана: рука
   * не от центра в обе стороны, а от левого края вправо — до тех пор, пока у самой правой карты виден хотя бы край (центр карты у правого
   * края). Мало карт — разлёт не упирается в предел, и рука по центру; карт стало меньше — смещение само убывает (`handOverhang`).
   */
  const OVERHANG = 0.55;
  function shapeOfWidth(f: number, n: number, rise: number, over = 0): Shape {
    const base = roomOf(Math.min(1, f)) * (1 + 0.07 * (1 - Math.exp(-over * 6))), room = base + OVERHANG * Math.max(0, Math.min(1, (f - 1) / (WIDTH.max - 1)));
    let lift = 0.5 + 0.5 * smooth(WIDTH.rowFrom, WIDTH.fanTo + 0.05, Math.min(1, f));
    if (!fanFitsN(n, room)) lift = 1;
    return { wide: Math.min(1, f / WIDTH.stack), lift: lift + (1 - lift) * rise, room, base };
  }
  /** Сдвиг руки вправо в ширинах карты: настолько, насколько её разлёт вышел за то, что умещается по центру. Нет выхода за единицу — нет сдвига. */
  function handOverhang(shape: Shape, n: number): number {
    if (n < 2 || shape.base === undefined || shape.room <= shape.base) return 0;
    const span = (room: number): number => { const xs = handPlanBlend({ wide: shape.wide, lift: shape.lift }, true, n, 1, 1.4, room).map((p) => p.x); return Math.max(...xs) - Math.min(...xs); };
    return Math.max(0, span(shape.room) - span(shape.base)) / 2;
  }
  /** Флаги позы, в которые ложится ширина `f` (их и шлём остальным). */
  function flagsOfWidth(f: number, n: number, was: { fan: boolean }): { shrink: boolean; fan: boolean } {
    if (f < WIDTH.stack) return { shrink: true, fan: was.fan };
    return { shrink: false, fan: f < WIDTH.fanTo && fanFitsN(n, roomOf(f)) };
  }
  /** Раскладка чужой руки по флагам позы. */
  const shapeOfPose = (p: { fan: boolean; shrink: boolean }, n: number): Shape => ({ wide: p.shrink ? 0 : 1, lift: p.fan && fanFitsN(n, CAMHAND.room) ? 0.5 : 1, room: p.fan ? CAMHAND.room : WIDTH.othersRow });
  /** Ширину поменяли не мы (кнопки «поза», другой экран) — встаёт в обычную для позы; своё решение ждёт ответа стола. */
  function syncWidth(ch: Chair): void {
    if (widthLive !== null || levelOn) return;
    const d = flagsOfWidth(handWidth, ch.hand.length, ch.pose);
    if (d.shrink === ch.pose.shrink && (d.shrink || d.fan === ch.pose.fan)) { widthPendingUntil = 0; return; }
    if (performance.now() < widthPendingUntil) return;
    handWidth = ch.pose.shrink ? WIDTH.defaults.shrink : ch.pose.fan ? WIDTH.defaults.fan : WIDTH.defaults.row;
  }
  /** Отпустили ручку или пальцы: ширина осталась, поза ушла столу. */
  function commitWidth(): void {
    const ch = myChair();
    if (widthLive === null) return;
    handWidth = widthLive; widthLive = null; widthOver = 0;
    if (!ch) return;
    if (levelOn) {
      // С язычком руки поза идёт по высоте (веер / в ряд / на столе), а ширина — только «стопкой» (левый край) или нет.
      const pose = levelPose(handLevel), flags = { fan: pose === "fan", shrink: handWidth < WIDTH.stack, tuck: pose === "tuck" };
      if (flags.fan !== ch.pose.fan || flags.shrink !== ch.pose.shrink || flags.tuck !== ch.pose.tuck) store.send({ t: "pose", chair: ch.id, pose: flags });
      layout(store.state);
      return;
    }
    const flags = flagsOfWidth(handWidth, ch.hand.length, ch.pose);
    widthPendingUntil = performance.now() + 2000;
    if (flags.shrink !== ch.pose.shrink || flags.fan !== ch.pose.fan || ch.pose.tuck) store.send({ t: "pose", chair: ch.id, pose: { ...ch.pose, ...flags, tuck: false } });
    layout(store.state);
  }
  /** Помещается ли веер на `n` карт в комнате `room`: угол разлёта и опускание краёв в пределах — иначе рука в ряд, веер выбрать нельзя. */
  const FAN = { maxDeg: 70, maxDrop: 1.6 };
  function fanFitsN(n: number, room: number): boolean {
    if (n <= 1) return true;
    const plan = handPlanBlend({ wide: 1, lift: 0.5 }, true, n, 1, 1.4, room), angles = plan.map((p) => p.angle);
    return Math.max(...angles) - Math.min(...angles) <= FAN.maxDeg && Math.max(...plan.map((p) => p.y)) <= FAN.maxDrop;
  }
  const fanFitsNow = (): boolean => { const ch = myChair(); return !ch || fanFitsN(ch.hand.length, CAMHAND.room); };
  /** Место в осях камеры: карта `k` из `n` руки стула `ch`. `fovK` — масштаб руки в кадре: с обзором шире `refFov` рука больше в тот же раз, и на экране выглядит, как при `refFov`; оптический зум её увеличивает вместе со столом, как взгляд. */
  const camHandLocal = (k: number, n: number, up: boolean, shape: Shape, fovK: number, sizeK = 1, off = { x: 0, y: 0 }, curl = CURL.rest, tilt: number = CAMHAND.tilt): Place => {
    const plans = handPlanBlend({ wide: shape.wide, lift: shape.lift }, true, n, 1, 1.4, shape.room), plan = plans[k] ?? { x: 0, y: 0, angle: 0 }, s = (CAMHAND.card / CARD_W) * fovK * sizeK, u = CAMHAND.card * fovK * sizeK;
    // Веер ещё и загнут вокруг вертикали, как карты в пальцах: края ближе к держащему, карты смотрят в центр дуги. Кривизна растёт с загибом `curl` (0…1; 1 — радиус `CAMHAND.curl` ширин карты); в ряду и стопкой загиба нет.
    const bend = Math.max(0, Math.min(1, 2 * (1 - shape.lift))) * Math.max(0, Math.min(1, curl)), arc0 = bend > 1e-3 ? CAMHAND.curl / bend : 0;
    // ШИРОКИЙ ЭКРАН (обзор шире ~60° по горизонтали; телефон в портрете — нет, там всё как было): края веера не заворачиваются круче `FAN_EDGE` — иначе в широкую комнату
    // они ложатся почти боком и уходят под нижнюю строку. Плавно по ширине обзора.
    const wk = wideK(), reach = plans.reduce((m, q) => Math.max(m, Math.abs(q.x)), 0), edge = FAN_EDGE * Math.min(1, FAN_REACH / Math.max(1e-3, reach)), arc = arc0 && wk > 0 ? arc0 + wk * (Math.max(arc0, reach / edge) - arc0) : arc0, theta = arc ? plan.x / arc : 0;
    // Рука расставлена шире, чем крайние карты влезают в кадр, — веер ВЫПРЯМЛЯЕТСЯ: крайние карты ложатся положе и не уходят под нижнюю строку; шире рука — прямее.
    // Только на широком обзоре; на телефоне `wk` = 0 и всё как было.
    const ff = 1 - wk * (1 - Math.max(0.2, 0.5 * Math.min(1, FAN_FLAT_REACH / Math.max(1e-3, reach)))), planY = plan.y * ff, planAngle = plan.angle * ff;
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -theta).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt * DEG)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -planAngle * DEG));
    if (up) quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    const along = arc ? arc * Math.sin(theta) : plan.x, toward = arc ? arc * (1 - Math.cos(theta)) : 0;
    return { pos: new THREE.Vector3(CAMHAND.at.x + off.x * fovK + along * u, (CAMHAND.at.y + off.y) * fovK - planY * u, CAMHAND.at.z + toward * u + k * 0.004), quat, scale: s, onCamera: true, bend: arc ? (up ? -1 : 1) / (arc * CARD_W) : 0 };
  };
  /** То же место в мире: голова `head` смотрит `yaw`, `pitch`. */
  const camHandWorld = (local: Place, head: Point3, yaw: number, pitch: number): Place => {
    const m = camBasis(yaw, pitch), q = new THREE.Quaternion().setFromRotationMatrix(m);
    const stagger = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    return { pos: local.pos.clone().applyMatrix4(m).add(V(head)), quat: q.multiply(local.quat), scale: local.scale, bend: local.bend, stagger };
  };
  /**
   * ЗОНА СТОПКИ БЕСХОЗНОГО СТУЛА — маленький «ноготок», срезанный краем стола: круг радиуса `r` с центром чуть внутри кромки на месте стула, обрезанный кромкой. Карта (1 × 1.4,
   * длинной стороной от стула к середине) лежит в нём впритык: углы карты внутри круга, внешний край — внутри стола.
   */
  const ZONE = { inset: 0.78, r: 1.02, y: 0.012 };
  const zoneCentre = (angle: number): { x: number; y: number } => seatPoint(angle, R - ZONE.inset);
  function zonePolygon(angle: number): { x: number; y: number }[] {
    const c = zoneCentre(angle), pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, x = c.x + Math.cos(a) * ZONE.r, y = c.y + Math.sin(a) * ZONE.r, len = Math.hypot(x, y), k = len > R ? R / len : 1;
      pts.push({ x: x * k, y: y * k });
    }
    return pts;
  }
  /** Принимает ли рука этого стула карту от чужого: не «не принимает» и не под замком (у пустого стула замок не держит). */
  const handTakes = (ch: Chair): boolean => !ch.croupier && !ch.reject && (!ch.lock || !ch.owner);
  const zones = new Map<string, { fill: THREE.Mesh; line: THREE.LineLoop; angle: number }>();
  /** Зоны есть у всех стульев без хозяина (и пустых, и с картами): видны только пока там никто не сидит; сел человек — зона гаснет, карты в ней — его рука. */
  function placeZones(): void {
    const seen = new Set<string>();
    for (const ch of store.state.chairs) {
      if (ch.croupier) continue;
      seen.add(ch.id);
      let z = zones.get(ch.id);
      if (z && z.angle !== ch.angle) { chairRoot.remove(z.fill, z.line); zones.delete(ch.id); z = undefined; }
      if (!z) {
        const poly = zonePolygon(ch.angle), c = zoneCentre(ch.angle), pos: number[] = [];
        for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; pos.push(c.x, ZONE.y, c.y, a.x, ZONE.y, a.y, b.x, ZONE.y, b.y); }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xcdb98f, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
        fill.userData.chair = ch.id; fill.renderOrder = 1;
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly.map((q) => new THREE.Vector3(q.x, ZONE.y + 0.002, q.y))), new THREE.LineDashedMaterial({ color: 0xcdb98f, dashSize: 0.16, gapSize: 0.12, transparent: true, opacity: 0.7, depthWrite: false }));
        line.computeLineDistances(); line.renderOrder = 2;
        chairRoot.add(fill, line);
        z = { fill, line, angle: ch.angle };
        zones.set(ch.id, z);
      }
      // Видна: пока стул пуст и карт в зоне нет (место ждёт), и пока я несу карту, которую в эту руку можно положить (хоть бы там и сидели, если нет замка).
      const h = held(), carrying = !!h && h.takeable && h.kind !== "hand" && ch.id !== myChair()?.id, free = !reseat && ((!ch.owner && ch.hand.length === 0) || (carrying && handTakes(ch)));
      const lit = free && carrying && h!.where?.in === "hand" && h!.where.chair === ch.id;
      z.fill.visible = z.line.visible = free;
      (z.fill.material as THREE.MeshBasicMaterial).opacity = lit ? 0.3 : 0.08;
      (z.line.material as THREE.LineDashedMaterial).opacity = lit ? 1 : 0.7;
    }
    for (const [id, z] of zones) if (!seen.has(id)) { chairRoot.remove(z.fill, z.line); zones.delete(id); }
  }
  /** Где лежит стопка положенной руки: у самого борта у своего места, чуть слева от аватара — не там, где рука у головы: с взглядом она не ходит. */
  function stackSpot(ch: Chair): { x: number; y: number } { return zoneCentre(ch.angle); }
  /** Карта `k` положенной руки на сукне. */
  const stackPlace = (ch: Chair, k: number, up: boolean): Place => { const at = stackSpot(ch); return lying(at.x, at.y, 0.03 + k * PILE_STEP, ((-ch.angle % 360) + 360) % 360, up); };
  /** Между рукой у головы и стопкой на сукне: `down` 0 — в руке, 1 — лежит. */
  const laid = (held: Place, ch: Chair, k: number, up: boolean, down: number): Place => {
    if (down <= 0) return held;
    const lie = stackPlace(ch, k, up);
    return { pos: held.pos.clone().lerp(lie.pos, down), quat: held.quat.clone().slerp(lie.quat, down), scale: held.scale + (1 - held.scale) * down, over: held.over, bend: (held.bend ?? 0) * (1 - down) };
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
    return laid(camHandWorld(camHandLocal(k, n, up, shapeOfPose(ch.pose, n), 1, CAMHAND.others, { x: 0, y: pose.handY ?? 0 }, (pose.curl ?? CURL.rest) * curlOfCount(n), CAMHAND.tilt + Math.max(0, Math.min(1, -(pose.handY ?? 0) / 0.7)) * CAMHAND.tiltLow), pose.head, pose.gaze ?? pose.yaw, pose.pitch), ch, k, up, tuckOf(b));
  };
  /** Где кисть левой руки: у головы — а когда рука положена (`down` 0…1), она на стопке на сукне, сверху. */
  function handRest(left: Point3, ch: Chair, down: number, cards: number): Point3 {
    if (down <= 0) return left;
    const at = stackSpot(ch), h = 0.03 + cards * PILE_STEP + 0.3;
    return { x: left.x + (at.x - left.x) * down, y: left.y + (at.y - left.y) * down, h: left.h + (h - left.h) * down };
  }
  /** Поза моей руки под пальцем (плавная) или ступенью стула. */
  const mineBlend = (ch: Chair): PoseBlend => blend ?? (levelOn ? levelBlend() : blendOf(ch.pose));
  /** Вид «сверху»: рука у края экрана, как у 2D-стола (`mineGeomOf`), а не на столе — так её удобнее брать. */
  const inHand = (k: number, geom: Geom): Place => {
    const g = glass(), sl = geom.slots[k]!, D = 5, vh = 2 * D * Math.tan((camera.fov * DEG) / 2), vw = vh * (g.w / g.h);
    const pos = new THREE.Vector3((sl.x / g.w - 0.5) * vw, -(sl.y / g.h - 0.5) * vh, -D + k * 0.004);
    return { pos, quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sl.angle * DEG), scale: ((geom.w / g.w) * vw) / CARD_W, onCamera: true };
  };
  /**
   * ЧАША «В РУКУ» — зона руки от первого лица: пока несут карту или стопку, вокруг руки стоит чаша из пунктира (часть эллипсоида, дно ниже веера), а не полоса на экране.
   * Она в осях камеры, как сама рука. Край чаши лежит по верху веера, КАК ЕГО ВИДНО С КАМЕРЫ: высоту среза подбираем так, чтобы самая высокая на экране точка края
   * легла на самую высокую точку карт. Над зоной (палец над рукой) чаша золотая. Вид «вокруг» и «сверху» чашу не рисуют.
   */
  const BOWL = { R: 1.8, sq: 0.85, ink: 0x7fd1b9, lit: 0xf2c14e, gap: 0.5 } as const;
  const bowlG = new THREE.Group();
  bowlG.visible = false;
  handRoot.add(bowlG);
  let bowlSig = "";
  /** На сколько руку опустил потолок (рад): отрицательное — вниз. */
  let handCeilRot = 0;
  let handZone: (() => { over: boolean } | null) | null = null;
  const bowlNow = { visible: false, lit: false, cut: 0, fitTop: 0, ringTop: 0, cardsTop: 0, parts: 0 };
  /**
   * ГДЕ СТОИТ ЧАША: центр, срез и верх края на экране (NDC). Считается не только для рисования: верх её края — и есть БАУНД ПРИЁМКИ В РУКУ (`handTop`): палец внутри чаши —
   * карта или стопка встают в руку (щель, горит чаша), снаружи — на стол. Несомую карту `skip` в расчёт не берём: край — по самому ряду.
   */
  function bowlFit(skip?: string): { center: THREE.Vector3; cut: number; lat: number; ringTop: number; fitTop: number; want: number; empty: boolean; ring: (lat: number, n?: number) => THREE.Vector3[]; R: number; Ry: number } | null {
    const ch = myChair();
    if (!ch) return null;
    const places: Place[] = [];
    for (const c of ch.hand) { if (c.id === skip) continue; const t = cards.get(c.id)?.target; if (t?.onCamera) places.push(t); }
    // РУКА ПУСТА (нет карт, или их уже несут из неё): считаем так же, как для карт, — по виртуальной карте, у которой над нижней строкой выглядывает лишь полоска, как у корешка.
    // Отдельного правила для пустой руки нет: край — всегда «верх силуэта руки + запас».
    const empty = places.length === 0;
    if (empty) {
      const shape = shapeOfWidth(handWidth, 1, 0, 0); shape.lift = 1;
      const one = camHandLocal(0, 1, false, shape, Math.tan((baseFov * DEG) / 2) / Math.tan((CAMHAND.refFov * DEG) / 2), handSize, { x: 0, y: 0 }, 0);
      one.pos.y -= (1 - SPINE_VIS) * CARD_H * one.scale;
      places.push(one);
    }
    const center = new THREE.Vector3(), corners: THREE.Vector3[] = [];
    for (const p of places) {
      center.add(p.pos);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) corners.push(new THREE.Vector3((sx * CARD_W * p.scale) / 2, (sy * CARD_H * p.scale) / 2, 0).applyQuaternion(p.quat).add(p.pos));
    }
    center.divideScalar(places.length);
    const top = (pts: THREE.Vector3[]): number => { let best = -Infinity; for (const v of pts) if (v.z < -0.05) best = Math.max(best, v.clone().applyMatrix4(camera.projectionMatrix).y); return best; };
    const R = BOWL.R, Ry = BOWL.R * BOWL.sq, want = top(corners);
    const latOf = (cut: number): number => -Math.asin(Math.max(-1, Math.min(1, 1 - 2 * (cut / 100))));
    const ring = (lat: number, n = 48): THREE.Vector3[] => Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return new THREE.Vector3(center.x + Math.cos(lat) * R * Math.sin(a), center.y + Math.sin(lat) * Ry, center.z + Math.cos(lat) * R * Math.cos(a)); });
    const ringTop = (cut: number): number => top(ring(latOf(cut)));
    let lo = 2, hi = 98;
    if (ringTop(lo) >= want) hi = lo; else if (ringTop(hi) <= want) lo = hi; else for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (ringTop(mid) < want) lo = mid; else hi = mid; }
    // Чуть пространства над картами: край поднят на `BOWL.gap` (единицы камеры) над их силуэтом.
    const fit = (lo + hi) / 2, cut = Math.min(99, Math.max(2, 50 * (1 + Math.min(0.98, Math.sin(latOf(fit)) + BOWL.gap / Ry)))), lat = latOf(cut);
    return { center, cut, lat, ringTop: ringTop(cut), fitTop: ringTop(fit), want, empty, ring, R, Ry };
  }
  /** Верх края чаши на экране, px от верха сцены — граница, с которой начинается приёмка в руку. */
  const bowlRimPx = (skip?: string): number | null => { const f = bowlFit(skip); return f ? ((1 - f.ringTop) * renderer.domElement.getBoundingClientRect().height) / 2 : null; };
  function handBowl(): void {
    const z = camMode === "head" && !store.replay?.on ? handZone?.() ?? null : null;
    if (!z) { bowlNow.visible = false; if (bowlG.visible) bowlG.visible = false; return; }
    const f = bowlFit(drag?.moved ? drag.id : undefined);
    if (!f) { bowlNow.visible = false; if (bowlG.visible) bowlG.visible = false; return; }
    const { center, cut, lat, ring, R, Ry } = f;
    Object.assign(bowlNow, { visible: true, lit: z.over, cut, fitTop: f.fitTop, ringTop: f.ringTop, cardsTop: f.want, parts: bowlG.children.length });
    const sig = [center.x, center.y, center.z, cut, z.over ? 1 : 0].map((v) => Math.round(v * 100)).join();
    bowlG.visible = true;
    if (sig === bowlSig) return;
    bowlSig = sig;
    for (const c of [...bowlG.children]) { bowlG.remove(c); (c as THREE.Line).geometry?.dispose(); }
    const col = z.over ? BOWL.lit : BOWL.ink, bottom = -Math.PI / 2;
    const at = (l: number, a: number) => new THREE.Vector3(center.x + Math.cos(l) * R * Math.sin(a), center.y + Math.sin(l) * Ry, center.z + Math.cos(l) * R * Math.cos(a));
    const dashed = (pts: THREE.Vector3[], dash: number, gap: number): THREE.Line => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: col, dashSize: dash, gapSize: gap, transparent: true, opacity: z.over ? 1 : 0.85, depthWrite: false }));
      l.computeLineDistances(); l.layers.set(HAND_LAYER); return l;
    };
    // Контурная граница по верху и лёгкая заливка под ней; меридианов нет.
    bowlG.add(dashed(ring(lat, 72), 0.24, 0.16));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R * Math.cos(lat), 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: z.over ? 0.12 : 0.06, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(center.x, center.y + Math.sin(lat) * Ry, center.z); disc.layers.set(HAND_LAYER);
    bowlG.add(disc);
  }
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
  /** Несомая над рукой: ближе к глазу (выше соседей по глубине), но на экране — того же размера и места, что в руке (всё ×r), плюс подъём. */
  const hoverNear = (t: Place, up: number): void => { const d = -t.pos.z, r = (d - CAMHAND.near) / d; t.pos.x *= r; t.pos.y = (t.pos.y + up) * r; t.pos.z += CAMHAND.near; t.scale *= r; };
  /** Места моих карт каждый кадр: несомая над рукой стоит в щели, выше соседей и ближе к глазу. */
  // ——— ВЫСОТА РУКИ — ОДНА РУЧКА (язычок над рукой, `design/hud3d`): поза и подъём вместе ———
  //   0 …5%    рука на столе: карт не видно, они легли стопкой перед стулом (`tuck`);
  //   5 …12%   корешок: одна неподвижная высота (по высоте не регулируется) — рука опущена за нижнюю строку, торчит лишь верх карт; чуть
  //            ниже — карты ложатся на стол, чуть выше — сразу веер;
  //   12…75%   веер — всегда веером, и по высоте регулируется: от «видно меньше половины» до целых карт;
  //   75…100%  в ряд; на самом верху нижняя кромка карт лишь чуть выглядывает над нижней строкой.
  // Кнопки позы ставят ту же ручку в своё место. Остальным уходят только флаги позы (веер, на столе); высота руки идёт телом (`handY`).
  type LevelPose = "tuck" | "spine" | "fan" | "row";
  const LEVEL = { tuck: 0.05, spine: 0.12, fan: 0.75 };
  const POSE_LEVEL: Record<LevelPose, number> = { row: 0.88, fan: 0.45, spine: 0.085, tuck: 0 };
  const levelPose = (h: number): LevelPose => (h < LEVEL.tuck ? "tuck" : h < LEVEL.spine ? "spine" : h < LEVEL.fan ? "fan" : "row");
  /** Какая доля высоты карты видна над нижней строкой на высоте руки `h`. Корешок — одна и та же (низкая), веер растёт, ряд — до целой карты. */
  const SPINE_VIS = 0.14;
  const visFrac = (h: number): number => {
    const pose = levelPose(h);
    if (pose === "tuck") return 0;
    if (pose === "spine") return SPINE_VIS;
    if (pose === "fan") return 0.4 + ((h - LEVEL.spine) / (LEVEL.fan - LEVEL.spine)) * 0.45;
    return 0.85 + ((h - LEVEL.fan) / (1 - LEVEL.fan)) * 0.19;
  };
  let handLevel = POSE_LEVEL.row, levelOn = false;
  /** Нижняя строка HUD: где её верх на экране и на сколько приподнят над ней пол руки (лист вкладки). `null` — по умолчанию. */
  let dockTopPx: number | null = null, dockExtraPx = 0;
  const trayTopPx = (): number => (dockTopPx ?? host.clientHeight - safeBottom() - 80) - dockExtraPx - 4;
  const levelBlend = (): PoseBlend => ({ wide: 1, lift: levelPose(handLevel) === "tuck" ? 0 : levelPose(handLevel) === "fan" ? 0.5 : 1 });
  /** Верх и низ средней карты руки на экране, px, при высоте руки `hp` пикселей — для подгонки руки под нижнюю строку. */
  function handCardBox(n: number, shape: Shape, fovK: number, curl: number, hp: number): { top: number; bottom: number } {
    const rect = renderer.domElement.getBoundingClientRect();
    const off = { x: 0, y: (hp * pxUnit()) / (Math.tan((baseFov * DEG) / 2) / Math.tan((CAMHAND.refFov * DEG) / 2)) };
    const pl = camHandLocal(Math.floor((n - 1) / 2), n, false, shape, fovK, handSize, off, curl);
    const half = new THREE.Vector3(0, (CARD_H / 2) * pl.scale, 0).applyQuaternion(pl.quat);
    const y = (v: THREE.Vector3) => ((1 - v.clone().applyMatrix4(camera.projectionMatrix).y) * rect.height) / 2;
    return { top: y(pl.pos.clone().add(half)), bottom: y(pl.pos.clone().sub(half)) };
  }
  /** Высота руки в кадре (px вверх), при которой видна нужная доля карт над нижней строкой. */
  function levelHeightPx(n: number, fovK: number, curl: number): number {
    if (n <= 0 || levelPose(handLevel) === "tuck") return 0;
    const shape = shapeOfWidth(widthLive ?? handWidth, n, 0, 0);
    shape.lift = levelPose(handLevel) === "fan" ? 0.5 : 1;
    const box = handCardBox(n, shape, fovK, curl, 0), cardPx = Math.abs(box.bottom - box.top);
    return box.bottom - (trayTopPx() + cardPx * (1 - visFrac(handLevel)));
  }
  /** Поставить высоту руки (и вместе с ней позу): `commit` — отдать флаги позы столу (при смене ступени всегда). */
  function setHandLevel(h: number): void {
    const was = levelPose(handLevel), next = Math.max(0, Math.min(1, h)), pose = levelPose(next), ch = myChair();
    levelOn = true;
    handLevel = next;
    if (pose !== was && ch) {
      const flags = { fan: pose === "fan", shrink: handWidth < WIDTH.stack, tuck: pose === "tuck" };
      if (flags.fan !== ch.pose.fan || flags.shrink !== ch.pose.shrink || flags.tuck !== ch.pose.tuck) store.send({ t: "pose", chair: ch.id, pose: flags });
    }
    layout(store.state); sendBody(); draw();
  }
  /** Ручка по позе стула — при входе (и пока стула нет, пробуем снова). */
  function levelFromPose(): void {
    const ch = myChair();
    if (!ch) return;
    levelOn = true;
    handLevel = ch.pose.tuck ? POSE_LEVEL.tuck : ch.pose.fan ? POSE_LEVEL.fan : POSE_LEVEL.row;
    handWidth = ch.pose.shrink ? WIDTH.defaults.shrink : ch.pose.fan && !ch.pose.tuck ? WIDTH.defaults.fan : WIDTH.defaults.row;
  }
  function retargetMine(): void {
    const ch = myChair();
    if (!ch) return;
    const hd = held(), list = handCards(), gap = hd?.gap ?? null, b = mineBlend(ch);
    const overCards: { id: string }[] | undefined = hd && hd.kind !== "card" && gap !== null ? hd.ids.map((id) => ({ id })) : undefined, overGap = gap ?? 0, m = overCards ? overCards.length : 0;
    // ЧУЖАЯ КАРТА НАД МОЕЙ РУКОЙ: сосед несёт карту мне в руку — на моём худе она в щели, куда он целится, и двигается влево-вправо вместе с его прицелом.
    const fc = store.carries.find((c) => c.by !== store.me.key && c.over.in === "hand" && c.over.chair === ch.id && cards.has(c.id));
    const fgap = fc ? Math.max(0, Math.min(list.length, (fc.over as { i: number }).i)) : null;
    const foreign = fgap !== null && gap === null && !overCards ? cards.get(fc!.id) : undefined;
    const ins = gap !== null ? gap : overCards ? overGap : foreign ? fgap : null, wide = 1, n = list.length + (ins !== null ? wide : 0);
    const slotOf = (k: number) => (ins !== null && k >= ins ? k + wide : k);
    const flip = (p: Place, up: boolean) => { if (up) p.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)); return p; };
    // Левая рука держит всю руку стопкой над столом — её несут, как колоду.
    if (handCarry) {
      list.forEach((c, k) => { const o = cards.get(c.id); if (o) o.target = { ...lying(handCarry!.x, handCarry!.y, CARRY_H + k * PILE_STEP, ((-ch.angle % 360) + 360) % 360, !!c.up), over: true }; });
      placeFpsArm(false, 1, { x: 0, y: 0 });
      return;
    }
    if (camMode === "top") {
      // Рука на худе внизу экрана; положена — карты на столе стопкой (а не пусто), как в виде «голова».
      const geom = topGeom(ch, n, { wide: b.wide, lift: Math.max(0.5, b.lift) }), down = tuckOf(b);
      const world = (p: Place): Place => { camera.updateMatrixWorld(); return { pos: p.pos.clone().applyMatrix4(camera.matrixWorld), quat: camera.quaternion.clone().multiply(p.quat), scale: p.scale }; };
      for (const c of handAll(ch)) {
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
      if (foreign) {
        const t = inHand(fgap!, geom), r = (-t.pos.z - HOVER.near) / -t.pos.z;
        t.pos.x *= r; t.pos.y = (t.pos.y + HOVER.up * CARD_H * t.scale) * r; t.pos.z += HOVER.near; t.scale *= r * HOVER.grow;
        foreign.target = t;
      }
      return;
    }
    if (camMode === "head") {
      const down = tuckOf(b), fovK = Math.tan((baseFov * DEG) / 2) / Math.tan((CAMHAND.refFov * DEG) / 2), head = { x: camera.position.x, y: camera.position.z, h: eyeY() };
      if (levelOn) heightPx = levelHeightPx(n, fovK, mineCurl(n));
      const off = handOffset();
      syncWidth(ch);
      const shape = shapeOfWidth(widthLive ?? handWidth, n, Math.max(0, Math.min(1, heightPx / WIDTH.rise)), widthOver);
      if (levelOn) shape.lift = levelPose(handLevel) === "fan" ? 0.5 : 1;
      off.x = handOverhang(shape, n) * CAMHAND.card * handSize;
      placeFpsArm(down <= 0 && list.length > 0 && !handCarry, fovK, off);
      // Раздвижка: места карт по ширине руки (в ширинах карты) и сдвиг от пальца на верхней ручке.
      const u = CAMHAND.card * fovK * handSize, curlMine = mineCurl(n);
      const xsPlan = Array.from({ length: n }, (_, i) => (camHandLocal(i, n, false, shape, fovK, handSize, off, curlMine).pos.x - CAMHAND.at.x - off.x * fovK) / u);
      const rectW = renderer.domElement.getBoundingClientRect(), fPeek = ((gripSx ?? rectW.left + rectW.width / 2) - (rectW.left + rectW.width / 2)) * (pxUnit() / u);
      // Ужатая рука не раскидывается, не тесно — тоже: грип тогда сразу в центре. Само наличие грипа карты не двигает: только его ход влево-вправо (`gripAmt`).
      const tight = shape.wide >= 1 && peekTight(xsPlan);
      if (!tight && !gripDrag && (gripSx !== null || gripAmt > 0)) { gripSx = null; gripAmt = 0; gripRelAt = 0; }
      const peek = tight && gripAmt > 0 ? peekShift(xsPlan, fPeek).map((v) => v * gripAmt) : xsPlan.map(() => 0);
      const place = (k: number, up: boolean): Place => {
        const local = camHandLocal(k, n, up, shape, fovK, handSize, off, curlMine);
        local.pos.x += (peek[k] ?? 0) * u;
        return down <= 0 ? local : { ...laid(camHandWorld(local, head, rig.yaw, rig.pitch), ch, k, up, down), over: true };
      };
      if (liftedId && !ch.hand.some((c) => c.id === liftedId)) liftedId = null;
      for (const c of handAll(ch)) {
        const o = cards.get(c.id), k = list.indexOf(c);
        if (o && k >= 0) o.target = place(slotOf(k), !!c.up);
      }
      // Тронутая карта: чуть выше остальных и ближе к глазу, чем ЛЮБАЯ соседка (включая правых, что ближе из-за загиба), — пересекает их по глубине;
      // размер и место на экране те же (ближе — меньше в тот же раз).
      const lo = liftedId ? cards.get(liftedId) : undefined;
      if (lo && !(drag?.moved && drag.id === liftedId)) {
        const t = lo.target;
        if (t.onCamera) {
          let zNear = -Infinity;
          for (const c of ch.hand) { const q = cards.get(c.id)?.target; if (q && q.onCamera) zNear = Math.max(zNear, q.pos.z); }
          const d = -t.pos.z, dz = Math.max(TOUCH.z, zNear + TOUCH.z - t.pos.z), kk = (d - dz) / d;
          t.pos.y = (t.pos.y + TOUCH.up * fovK) * kk; t.pos.x *= kk; t.pos.z += dz; t.scale *= kk;
        } else t.pos.y += TOUCH.up;
      }
      const o = gap !== null && drag ? cards.get(drag.id) : undefined;
      if (o) {
        const t = place(gap!, false);
        if (t.onCamera) hoverNear(t, CAMHAND.pop * fovK * handSize); else t.pos.y += CAMHAND.pop;
        t.scale *= HOVER.grow;
        o.target = t;
      }
      if (foreign) {
        const t = place(fgap!, false);
        if (t.onCamera) hoverNear(t, CAMHAND.pop * fovK * handSize); else t.pos.y += CAMHAND.pop;
        t.scale *= HOVER.grow;
        foreign.target = t;
      }
      overCards?.forEach((c, j) => {
        const q = cards.get(c.id);
        if (!q) return;
        const t = place(ins!, false), thick = Math.min(1, j / Math.max(1, m - 1)) * 0.05;
        if (t.onCamera) hoverNear(t, (CAMHAND.pop + thick) * fovK * handSize); else t.pos.y += CAMHAND.pop + thick;
        t.scale *= HOVER.grow;
        q.target = t;
      });
      return;
    }
    // СВОБОДНАЯ КАМЕРА: рука не привязана к экрану и не висит в воздухе — левая рука кладёт её стопкой на стол у стула, как у остальных.
    // Несомая в руку карта (и чужая, нацеленная в мою руку) повисает над этой стопкой.
    for (const c of handAll(ch)) { const o = cards.get(c.id), k = list.indexOf(c); if (o && k >= 0) o.target = stackPlace(ch, slotOf(k), !!c.up); }
    const above = (slot: number): Place => { const t = stackPlace(ch, slot, false); t.pos.y += HAND.pop + 0.6; t.scale *= HOVER.grow; return t; };
    const o = gap !== null && drag ? cards.get(drag.id) : undefined;
    if (o) o.target = above(gap!);
    if (foreign) foreign.target = above(fgap!);
  }
  const pileAngle = (p: Pile) => (p as Pile & { angle?: number }).angle ?? 0;
  function layout(s: Snapshot): void {
    syncSeatAngle();
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
    for (const [id, f] of ringFields) {
      if (s.piles.some((p) => p.id === id && p.pose === "ring")) continue;
      for (const m of [f.field, f.marks]) { scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      f.tex.dispose();
      ringFields.delete(id);
    }
    for (const p of s.piles) if (p.pose === "ring") ringFieldFor(p, s);
    for (const p of s.piles) p.cards.forEach((c, i) => {
      const o = cardObj(c.id);
      dress(o, c, s);
      const ring = p.pose === "ring" && c.turn !== undefined ? ringTurned({ x: p.x, y: p.y }, c.turn) : null;
      const landing = pileLanding?.pile === p.id && p.x === pileLanding.was.x && p.y === pileLanding.was.y && performance.now() < pileLanding.until ? pileLanding : null;
      const held = pileCarry?.pile === p.id ? pileCarry : landing;
      o.target = held
        ? lying(held.x, held.y, 0.01 + (held === pileCarry ? 0.6 : 0) + i * PILE_STEP, held === pileCarry ? ((-(myChair()?.angle ?? 0) % 360) + 360) % 360 : pileAngle(p), !!c.up)
        : ring ? lying(ring.x, ring.y, 0.01 + i * FELT_STEP, ring.angle, !!c.up) : lying(p.x, p.y, 0.01 + i * PILE_STEP, pileAngle(p), !!c.up);
      fromOf.set(c.id, { in: "pile", pile: p.id, top: i === p.cards.length - 1 || !!ring });
      seen.add(c.id);
    });
    for (const ch of s.chairs) ch.hand.forEach((c, i) => {
      const o = cardObj(c.id);
      dress(o, c, s);
      const pose = poses.get(ch.id), owner = s.people.find((p) => p.key === ch.owner);
      // Пустой стул и стул крупье — рука сложена стопкой на стол; у бота — всегда веером; у остальных — как они её держат.
      if (ch.id !== mine && (!owner || ch.croupier)) o.target = stackPlace(ch, i, !!c.up);
      else if (pose) o.target = othersHand(pose, owner && (owner.bot || owner.brain) ? { ...ch, pose: { ...ch.pose, fan: true, shrink: false, tuck: false } } : ch, i, ch.hand.length, !!c.up);
      else if (ch.id !== mine) { o.target = fanned(ch.angle, i, ch.hand.length, false); if (c.up) o.target.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)); }
      fromOf.set(c.id, { in: "hand", chair: ch.id, mine: ch.id === mine, i });
      seen.add(c.id);
    });
    // ЧУЖИЕ КАРТЫ В ВОЗДУХЕ — у них в руке, над тем местом, куда их несут.
    const glowing = new Map<string, string>();
    carriedForeign = glowing;
    const inkOf = (by: string) => s.people.find((p) => p.key === by)?.ink ?? "#f2c14e";
    for (const c of store.carries) {
      if ((c.by === store.me.key && !store.replay?.on) || !cards.has(c.id)) continue;
      const o = cards.get(c.id)!;
      glowing.set(c.id, inkOf(c.by));
      dress(o, c.card, s);
      const over = c.over;
      const at = over.in === "felt" ? { x: over.x, y: over.y } : over.in === "deck" ? s.piles.find((p) => p.id === over.pile) : (() => { const ch = s.chairs.find((x) => x.id === over.chair); return ch ? seatPoint(ch.angle, R - 1.2) : null; })();
      if (at) {
        o.target = lying(at.x, at.y, 1.4, over.in === "felt" ? over.angle : 0, over.in === "felt" ? over.up : !!c.card.up);
        // Наклон — тот же, что у несущего (он его прислал): к его голове, а не к моему глазу.
        const carrier = s.chairs.find((x) => x.owner === c.by), head = poses.get(carrier?.id ?? "")?.head, seatAt = carrier ? seatPoint(carrier.angle, R) : null;
        const from = head ? { x: head.x, y: head.y } : seatAt;
        if (over.in === "felt" && c.tilt && from) tiltToward(o.target, new THREE.Vector3(from.x, 0, from.y), c.tilt);
        if (c.flip) o.target.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.flip * DEG));
      }
    }
    // ЧУЖИЕ СТОПКИ В ВОЗДУХЕ ЦЕЛИКОМ (со стола и бесхозные) — у пальца несущего, лицом к нему, как их видит он сам: все карты по порядку, снизу вверх.
    for (const c of store.stacks) {
      if ((c.by === store.me.key && !store.replay?.on) || c.over.in !== "felt") continue;
      const over = c.over, order = [...(c.with ?? []).map((w) => w.card), c.card];
      order.forEach((card, i) => {
        const o = cards.get(card.id);
        if (!o) return;
        dress(o, card, s);
        glowing.set(card.id, inkOf(c.by));
        o.target = lying(over.x, over.y, 0.01 + 0.6 + i * PILE_STEP, over.angle, !!card.up);
      });
    }
    for (const [id, o] of cards) {
      const ink = glowing.get(id);
      o.halo.visible = ink !== undefined;
      if (ink) (o.halo.material as THREE.MeshBasicMaterial).color.set(ink);
    }
    // НЕСОМАЯ МНОЙ — у пальца: над рукой — в щели руки (`retargetMine`); над столом — там, где решил палец.
    retargetMine();
    if (drag?.moved && drag.gap === null) {
      const o = cards.get(drag.id);
      if (o && drag.spot) o.target = screenPlace(drag.spot);
      else if (o && drag.place) o.target = flipped(drag.place);
    }
    // Отпущенная — ждёт ответа стола там, куда легла.
    holdLanding();
    // Правой кнопкой ведут угол лежащей карты — она вращается на месте, пока не отпустили.
    if (spin?.moved) { const o = cards.get(spin.id), f = store.state.felt.find((c) => c.id === spin!.id); if (o && f) o.target = { ...o.target, quat: lying(f.x, f.y, o.target.pos.y, spin.angle, f.up).quat }; }
    applyFloats(performance.now());
    ringHover();
    if (reseat) reseatSync();
    applyGather();
    for (const [id, o] of cards) if (!seen.has(id)) { cardRoot.remove(o.group); cards.delete(id); }
    draw();
  }
  /** Стенд дизайна: карта, что ждёт ответа стопки, висит над ней и чуть покачивается (`test.floatCard`); в игре таких нет. */
  const floats = new Map<string, { pile: string; dx: number; dy: number; lift: number; da: number; up: boolean; phase: number }>();
  function applyFloats(now: number): void {
    for (const [id, f] of floats) {
      const o = cards.get(id), pile = store.state.piles.find((p) => p.id === f.pile);
      if (!o || !pile) continue;
      // Как в «Балатро»: карта плавает на месте — покачивается вверх-вниз, дрейфует по сукну и клонится в две стороны разными медленными волнами.
      const t = now / 1000 + f.phase, place = lying(pile.x + f.dx + Math.sin(t * 0.9) * 0.07, pile.y + f.dy + Math.cos(t * 0.7) * 0.07, 0.4 + pile.cards.length * PILE_STEP + f.lift + Math.sin(t * 1.6) * 0.07, pileAngle(pile) + f.da + Math.sin(t * 0.6) * 3, f.up);
      place.quat.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * 1.3) * 0.13, 0, Math.cos(t * 1.1) * 0.1)));
      place.scale = 1 + Math.sin(t * 1.6) * 0.025;
      o.target = place;
    }
  }
  /** Где карта по снимку — ключом: поменялся — стол ответил, и ждать ответа на месте больше нечего. */
  const fromKey = (id: string) => { const f = store.state.felt.find((c) => c.id === id); return JSON.stringify(fromOf.get(id) ?? null) + (f ? `${f.x},${f.y},${f.up}` : ""); };
  let landing: { id: string; place: Place; key: string; until: number } | null = null;
  /** Отпущенная карта стоит там, куда её положили, пока стол не ответил (или не вышло время). Зовётся и после раскладки, и после руки каждый кадр: рука карту по снимку тянула бы обратно в щель. */
  function holdLanding(): void {
    if (!landing || floats.has(landing.id) || (drag?.moved && drag.id === landing.id) || performance.now() >= landing.until || fromKey(landing.id) !== landing.key) return;
    const o = cards.get(landing.id);
    if (o) o.target = landing.place;
  }

  // ——— кадр: карты догоняют свои места ———
  let lastTick = performance.now();
  function updateGrip(dt: number, now: number): void {
    if (gripDrag) { gripAmt = Math.min(1, gripAmt + dt * 6); return; }
    if (!gripRelAt) return;
    const r = Math.min(1, (now - gripRelAt) / peekReturnMs), e = r * r * (3 - 2 * r), rect = renderer.domElement.getBoundingClientRect(), centre = rect.left + rect.width / 2;
    gripAmt = gripAmt0 * (1 - e);
    gripSx = gripRelX + (centre - gripRelX) * e;
    if (r >= 1) { gripRelAt = 0; gripAmt = 0; gripSx = null; }
  }
  // ——— моя правая рука — пока несу карту над столом: от правого плеча к карте ———
  const myArm = new THREE.Group();
  scene.add(myArm);
  function armPose(): void {
    myArm.clear();
    const ch = myChair();
    if (!ch || !heads.visible) return;
    const sh = shoulders3(ch.angle, stanceNow(), seatPull), r = Math.hypot(sh.x, sh.y) || 1;
    // Плечо — там же, где у тела (`dollBody`): уменьшенное к столу, а не на прежней высоте, иначе правое плечо торчит над телом.
    const shR = V({ x: sh.x, y: sh.y, h: sh.h * dollK }).addScaledVector(new THREE.Vector3(sh.y / r, 0, -sh.x / r), DOLL.bar);
    myArm.userData.shoulder = shR;
    const o = drag?.moved ? cards.get(drag.id) : undefined;
    let grip: THREE.Vector3;
    if (o && !o.target.onCamera && !o.target.over && o.group.visible) {
      // Кисть — у ближнего ко мне края карты, чуть ниже: держит её, а не лежит на ней.
      const at = o.group.getWorldPosition(new THREE.Vector3());
      grip = at.clone().add(new THREE.Vector3(sh.x - at.x, 0, sh.y - at.z).setLength(CARD_H * 0.45)).add(new THREE.Vector3(0, -0.12, 0));
    } else {
      // Без карты над столом — рука на том, с чем вожусь: та же точка, что видят остальные. Несу в свою руку — она у глаза, рука не нужна.
      // Правая рука в покое — на столе перед плечом.
      const at = (drag?.moved ? (drag.gap === null ? rightAt : null) : restRight) ?? restRightOf(sh);
      grip = new THREE.Vector3(at.x, restH(at, ch.id), at.y);
    }
    const mat = inkOf(store.me.ink);
    myArm.add(...armParts(shR, grip, 1, new THREE.Vector3(sh.y / r, 0, -sh.x / r), DOLL.arm * farK(grip), mat), ball(grip, DOLL.hand * farK(grip), mat));
    myArm.userData.grip = grip;
  }
  /** ШЕЯ ПРИ НАТЯГЕ — у этой модели она рвётся пунктиром (чем сильнее натяг, тем реже штрихи) и тончает. Цвет не меняется. Другая модель по тому же `stretch` решит сама. */
  function neckParts(S: THREE.Vector3, H: THREE.Vector3, r: number, stretch: number, mat: THREE.Material): THREE.Object3D[] {
    if (stretch <= NECK.free) return [stick(S, H, r, mat)];
    const k = Math.min(1, (stretch - NECK.free) / (1 - NECK.free)), n = 7, gap = 0.12 + 0.6 * k, out: THREE.Object3D[] = [];
    for (let i = 0; i < n; i++) {
      const a = i / n, b = a + (1 - gap) / n;
      out.push(stick(S.clone().lerp(H, a), S.clone().lerp(H, b), r * (1 - 0.45 * k), mat));
    }
    return out;
  }
  // ——— ЧТО ИГРОК ВИДИТ О НАТЯГЕ: виньетка по краям и датчик у рейки (оба выключаются в настройках) ———
  const viz = { vignette: true, gauge: true };
  let vigEl: HTMLDivElement | null = null, gaugeEl: HTMLDivElement | null = null;
  function neckViz(m: number): void {
    const show = m > NECK.free + 1e-3 || neck.back > 0;
    if (!vigEl) {
      const css = document.createElement("style");
      css.textContent = "@keyframes neckpulse{0%,100%{opacity:1}50%{opacity:.55}}";
      document.head.appendChild(css);
      vigEl = document.createElement("div");
      vigEl.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:2;opacity:0;transition:opacity .25s";
      gaugeEl = document.createElement("div");
      gaugeEl.style.cssText = "position:absolute;right:3px;top:calc(var(--safe-top,0px) + 103px);width:12px;height:150px;pointer-events:none;z-index:2;display:none";
      gaugeEl.innerHTML = `<div data-g=track style="position:absolute;right:0;top:0;bottom:0;width:8px;background:linear-gradient(to top,#3f8f4a 0 ${NECK.free * 100}%,#c9a227 ${NECK.free * 100}% ${STRAIN.yellow * 100}%,#b3322c ${STRAIN.yellow * 100}% 100%);opacity:.35;box-shadow:0 0 0 2px #0b0704"></div>`
        + `<div data-g=fill style="position:absolute;right:0;bottom:0;width:8px;height:0"></div><div data-g=mark style="position:absolute;right:-2px;width:12px;height:3px;background:#f5ead0;box-shadow:0 0 0 1px #0b0704"></div>`
        + `<div data-g=left style="position:absolute;left:0;bottom:0;width:3px;height:0;background:#f5ead0;box-shadow:0 0 0 1px #0b0704"></div>`;
      host.append(vigEl, gaugeEl);
    }
    const idleMode = stanceNow() === "sit", worn = idleMode ? 0 : neck.spent;
    // Жёлтая — еле заметна; красная заметнее и растёт к самому пределу: сильный вид только на крайней дальности.
    const k = Math.min(1, Math.max(0, (m - NECK.free) / (1 - NECK.free))), red = m > STRAIN.yellow, kr = red ? (m - STRAIN.yellow) / (1 - STRAIN.yellow) : 0;
    const alpha = red ? 0.12 + 0.5 * kr * kr : 0.04 * k / STRAIN.yellow, size = red ? 30 + 70 * kr : 30, spread = red ? 4 + 36 * kr : 4;
    // Сидя виньетки нет совсем: там возврат по простою, и спешить некуда.
    const vig = viz.vignette && show && !idleMode;
    vigEl.style.opacity = vig ? "1" : "0";
    if (vig) {
      vigEl.style.boxShadow = `inset 0 0 ${size}px ${spread}px rgba(${red ? "224,65,58" : "240,190,60"},${alpha.toFixed(3)})`;
      vigEl.style.animation = `neckpulse ${(2.4 * (1 - worn) + 0.3).toFixed(2)}s ease-in-out infinite`;
    }
    gaugeEl!.style.display = viz.gauge && show ? "block" : "none";
    if (viz.gauge && show) {
      const fill = gaugeEl!.querySelector<HTMLElement>("[data-g=fill]")!, mark = gaugeEl!.querySelector<HTMLElement>("[data-g=mark]")!, left = gaugeEl!.querySelector<HTMLElement>("[data-g=left]")!;
      fill.style.height = `${m * 100}%`; fill.style.background = m > STRAIN.yellow ? "#e0413a" : "#f2c14e";
      mark.style.bottom = `calc(${m * 100}% - 1px)`;
      left.style.height = idleMode ? "0" : `${(1 - worn) * 100}%`;
    }
  }
  /** Круг под прицелом, пока несут карту: пунктир приёмки; карта над кругом — круг горит и показан контур места, куда она ляжет. */
  function ringHover(): void {
    const d = drag, carrying = !!d?.moved;
    for (const [id, f] of ringFields) {
      const p = store.state.piles.find((x) => x.id === id), here = carrying && d!.where?.in === "deck" && d!.where.pile === id && d!.where.turn !== undefined;
      f.zone.visible = carrying && !!p;
      f.glow.visible = here;
      f.slot.visible = here;
      if (!carrying || !p) continue;
      const ink = store.me.ink;
      (f.zone.material as THREE.LineDashedMaterial).color.set(ink); (f.zone.material as THREE.LineDashedMaterial).opacity = here ? 1 : 0.55;
      (f.glow.material as THREE.MeshBasicMaterial).color.set(ink);
      (f.slot.material as THREE.LineBasicMaterial).color.set(ink);
      if (here) {
        const busy = p.cards.filter((c) => c.id !== d!.id && c.turn !== undefined).map((c) => c.turn!);
        const at = ringTurned({ x: p.x, y: p.y }, ringLanding((d!.where as { turn: number }).turn, busy)), place = lying(at.x, at.y, 0.02, at.angle, true);
        f.slot.position.copy(place.pos);
        f.slot.quaternion.copy(place.quat);
      }
    }
  }
  /** Видимая часть сцены на экране: холст, обрезанный всеми родителями с `overflow` и окном браузера (на стенде сцена больше своего кадра — края у кадра). */
  function visibleRect(): { left: number; right: number; top: number; bottom: number; width: number; height: number } {
    const c = renderer.domElement.getBoundingClientRect();
    let left = Math.max(0, c.left), right = Math.min(innerWidth, c.right), top = Math.max(0, c.top), bottom = Math.min(innerHeight, c.bottom);
    for (let el = host.parentElement; el; el = el.parentElement) {
      const st = getComputedStyle(el);
      if (st.overflowX === "visible" && st.overflowY === "visible") continue;
      const r = el.getBoundingClientRect();
      left = Math.max(left, r.left); right = Math.min(right, r.right); top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom);
    }
    return { left, right, top, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }
  function tick(): void {
    const w = host.clientWidth, h = host.clientHeight;
    if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (camMode === "head") applyRig();
    }
    let moving = false;
    const now = performance.now(), dt = Math.min(0.05, Math.max(0.001, (now - lastTick) / 1000));
    const sinceMs = Math.min(250, now - lastTick);
    lastTick = now;
    // Несу быстро — карта шелестит по воздуху; тише и реже, чем стук.
    if (drag?.moved && dragPid !== null) { const sw = throwWeight(); if (sw > 0.15 && now - lastCarryFeel > 260) { lastCarryFeel = now; feel("carry", drag.id, sw); } }
    // КРАЙ ЭКРАНА ПРИ ПЕРЕНОСЕ: палец с картой у верха, левого или правого края — камера едет, а карта остаётся под пальцем.
    if (drag?.moved && dragPid !== null && !camLocked && (camMode === "top" || camMode === "head")) {
      const r = visibleRect(), b = EDGE_SCROLL.band, ch = myChair(), handOn = !!ch && !ch.reject;
      // Над рукой камера стоит (карту в неё кладут); ниже — на нижнем худе (док со вкладками, под веером), — едет, и тем быстрее, чем ближе к кромке. Без руки — полоса у кромки, как у остальных краёв.
      const dock = renderer.domElement.getBoundingClientRect().top + trayTopPx(), down = handOn ? Math.max(0, Math.min(1, ((lastFinger.y - dock) / Math.max(20, r.bottom - dock)) * 1.5)) : Math.max(0, Math.min(1, (b - (r.bottom - lastFinger.y)) / b));
      const near = (d: number) => Math.max(0, Math.min(1, (b - d) / b));
      const vx = near(lastFinger.x - r.left) * -1 + near(r.right - lastFinger.x), vy = near(lastFinger.y - r.top) - down;
      if (vx || vy) {
        if (camMode === "top") panBy({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, { clientX: r.left + r.width / 2 - vx * EDGE_SCROLL.panPx * dt, clientY: r.top + r.height / 2 + vy * EDGE_SCROLL.panPx * dt });
        else lookBy(vx * EDGE_SCROLL.turnDeg * dt, vy * EDGE_SCROLL.turnDeg * dt);
        advanceDrag(lastFinger.x, lastFinger.y);
        moving = true;
      }
    }
    // Палец остановился: тот, кто бросал, теперь «положит» — место падения пересчитывается без новых движений.
    if (drag?.moved && dragPid !== null && lastThrow > 0 && throwWeight() < lastThrow - 0.02) advanceDrag(lastFinger.x, lastFinger.y);
    // Камеру покрутили, а палец стоит: карта в руке доворачивается за экраном.
    if (drag?.moved && dragPid !== null && Math.abs(((heldAngle(drag, lastFinger.x, lastFinger.y) - drag.angle + 540) % 360) - 180) > 0.5) advanceDrag(lastFinger.x, lastFinger.y);
    frame = 0;
    if (floats.size) { applyFloats(now); moving = true; }
    syncSeatAngle();
    applyGyro();
    // Камера и моя рука — до пружин: рука едет с головой, и пружины догоняют уже новое место.
    if (!camLocked && (camMode === "head" || camMode === "top")) {
      // ШЕЯ ТЯНЕТСЯ ВПЕРЁД, НАЗАД И ВБОК одним натягом: считаем по длине вектора (наклон, сдвиг), и возвращается он тоже вместе.
      if (drag || rigPtrs.size > 0 || live.size > 0) neck.idle = 0;
      const goalMoved = camMode === "head" && headGoalStep(dt);
      const was = rig.lean, wasSide = rig.side, m = Math.hypot(rig.lean, rig.side), m2 = neckFree ? m : neckStep(neck, m, sinceMs, stanceNow() === "sit");
      if (m2 < m - 1e-6) headGoal = null;
      if (m2 !== m) { const k = m > 0 ? m2 / m : 0; rig.lean *= k; rig.side *= k; }
      if (goalMoved || rig.lean !== was || rig.side !== wasSide || neck.back > 0 || m2 > NECK.free) { applyRig(); sendBody(); moving = true; }
      neckViz(m2);
    } else neckViz(0);
    // Рука целиком отстаёт от поворота взгляда и возвращается: поворот вправо — рука левее, взгляд вверх — рука ниже.
    if (camMode === "head") {
      const k = Math.exp((-sinceMs / 1000) * LAG.decay), lim = (v: number) => Math.max(-LAG.max, Math.min(LAG.max, v));
      lag.yaw = lim((lag.yaw + LAG.gain * wrap(rig.yaw - lag.prevYaw) * DEG) * k);
      lag.pitch = lim((lag.pitch - LAG.gain * (rig.pitch - lag.prevPitch) * DEG) * k);
      lag.prevYaw = rig.yaw; lag.prevPitch = rig.pitch;
      if (Math.abs(lag.yaw) > 0.002 || Math.abs(lag.pitch) > 0.002) moving = true;
    } else { lag.yaw = lag.pitch = 0; lag.prevYaw = rig.yaw; lag.prevPitch = rig.pitch; }
    // Потолок руки: взгляд выше `HAND_CEIL` — рука не поднимается следом, а остаётся на месте в мире (в осях камеры уезжает вниз).
    handCeilRot = camMode === "head" ? -Math.max(0, rig.pitch - HAND_CEIL.pitch) * DEG : 0;
    handRoot.rotation.set(lag.pitch + handCeilRot, lag.yaw, 0);
    updateGrip(dt, now);
    if (gripAmt > 0.001 || gripDrag) moving = true;
    retargetMine();
    holdLanding();
    const gathering = applyGather() ? gatherSet() : null;
    if (gathering) moving = true;
    for (const [id, o] of cards) {
      const g = o.group, t = o.target;
      // Сменила место между миром и рукой — пересадить, сохранив, где она на экране, и долететь.
      // Изгиб самой карты догоняет цель плавно; сетка нужна, только пока карта согнута.
      const bendWas = (g.userData.bend as number | undefined) ?? 0, bendWant = t.bend ?? 0, bendNow = Math.abs(bendWant - bendWas) < 1e-4 ? bendWant : bendWas + (bendWant - bendWas) * (1 - Math.exp(-dt * 14));
      if (bendNow !== bendWas) { g.userData.bend = bendNow; moving = true; }
      (o.front.material as THREE.Material).userData.bend.value = bendNow;
      (o.back.material as THREE.Material).userData.bend.value = -bendNow;
      // ПОРЯДОК КАРТ В РУКЕ — по правилу, а не по глубине: карта справа всегда поверх карты слева (если смотреть со стороны держащего), несомая — выше всех.
      // Изогнутые карты пересекаются, и глубина дала бы торчащие углы; слои друг в друга не пишут, порядок задан.
      const from = fromOf.get(id), hovered = pileOverIds.get(id), carried = hovered !== undefined || (((!!drag?.moved && drag.id === id) || id === liftedId) && !!from && from.in === "hand");
      const layered = carried || (!!from && from.in === "hand" && (!!t.onCamera || !!t.stagger));
      const above = t.onCamera || !t.stagger || t.stagger.dot(camera.position.clone().sub(g.position)) > 0, slot = from && from.in === "hand" ? from.i : 0;
      const order = carried ? 300 + (hovered ?? 0) : layered ? 100 + (above ? slot : 99 - slot) : 0;
      for (const m of [o.front.material, o.back.material] as THREE.Material[]) m.depthWrite = !layered;
      o.front.renderOrder = o.back.renderOrder = order;
      for (const m of o.shades) m.visible = !t.onCamera && !t.over && Math.abs(bendNow) < 1e-4;
      const want = Math.abs(bendNow) > 1e-5 ? cardBendShape : cardShape;
      if (o.front.geometry !== want) o.front.geometry = o.back.geometry = want;
      const parent = t.onCamera ? handRoot : cardRoot;
      if (g.parent !== parent) { camera.updateMatrixWorld(); parent.attach(g); g.userData.v = new THREE.Vector3(); g.userData.sv = 0; }
      const layer = t.onCamera || t.over ? HAND_LAYER : 0;
      if (g.userData.layer !== layer) { g.userData.layer = layer; g.traverse((n) => n.layers.set(layer)); }
      // Над окном HUD несомую рисует сам HUD — поверх окна; здесь её нет.
      g.visible = !(drag?.moved && drag.id === id && drag.spot) && !(reseat && (fromOf.get(id)?.in === "hand" || t.onCamera));
      // Своя рука — не отбрасывает тени: она у глаза, её тень легла бы на полстола.
      o.front.castShadow = o.back.castShadow = !t.onCamera && !t.over && !flight.has(id);
      if (!g.userData.placed) { g.position.copy(t.pos); g.quaternion.copy(t.quat); g.scale.setScalar(t.scale); g.userData.placed = true; g.userData.v = new THREE.Vector3(); g.userData.sv = 0; continue; }
      // ПРУЖИНА: ускорение к месту, затухание скоростью; поворот догоняет плавно.
      // Мелкими шагами: жёсткая пружина на целом кадре разлетается.
      const sp = drag?.id === id ? SPRING_HELD : slamming.has(id) ? SPRING_SLAM : gathering?.has(id) ? (gather!.fast ? SPRING_HELD : GATHER.spring) : SPRING, c = 2 * Math.sqrt(sp.k) * sp.damp;
      const v = g.userData.v as THREE.Vector3, steps = Math.ceil(dt * 240), h = dt / steps, d = new THREE.Vector3();
      let sc = g.scale.x, sv = g.userData.sv as number;
      // ПЕРЕВОРОТ НА СТОЛЕ: пока карта наклонена, её край уходит вниз на полширины·sin(наклона) — цель поднята на столько, чтобы край не прошёл сквозь стол.
      const goal = t.pos.clone();
      if (!t.onCamera && t.pos.y < 0.5 && drag?.id !== id) goal.y += (CARD_W / 2) * Math.sin(Math.acos(Math.min(1, Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion).y)))) * g.scale.x;
      for (let i = 0; i < steps; i++) {
        d.copy(goal).sub(g.position);
        v.addScaledVector(d, sp.k * h).addScaledVector(v, -c * h);
        g.position.addScaledVector(v, h);
        // На сукно карта ложится со стуком, а не пружинит сквозь стол.
        if (!t.onCamera && t.pos.y < 0.5 && g.position.y < t.pos.y) { g.position.y = t.pos.y; v.y = 0; }
        sv += ((t.scale - sc) * sp.k - sv * c) * h;
        sc += sv * h;
      }
      // Несомая карта поднимается вдоль луча камеры, а её центр плавно съезжает под палец (по экрану, а не по прямой из места, где лежала): снизу она не стартует и не отстаёт.
      if (t.held && drag?.id === id) {
        const cp = camera.position, up = cp.y - t.pos.y, now = cp.y - g.position.y;
        if (up > 0.1 && now > 0.05) {
          const goal = t.pos.clone().project(camera), pix = (g.userData.pix as THREE.Vector2 | undefined) ?? (g.userData.pix = g.position.clone().project(camera) as unknown as THREE.Vector2);
          const k = 1 - Math.exp(-dt * 16);
          pix.x += (goal.x - pix.x) * k; pix.y += (goal.y - pix.y) * k;
          const dir = new THREE.Vector3(pix.x, pix.y, 0.5).unproject(camera).sub(cp).normalize();
          if (dir.y < -1e-3) { const r = now / -dir.y; g.position.x = cp.x + dir.x * r; g.position.z = cp.z + dir.z * r; v.x = v.z = 0; }
        }
      } else if (g.userData.pix) g.userData.pix = undefined;
      g.userData.sv = sv;
      g.scale.setScalar(sc);
      d.copy(t.pos).sub(g.position);
      const ds = t.scale - sc;
      g.quaternion.slerp(t.quat, 1 - Math.exp(-dt * (drag?.id === id ? 30 : 14)));
      // Пол по уже повёрнутой карте: край не может оказаться под столом ни в один кадр, даже если пружина запаздывает за поворотом.
      if (!t.onCamera && t.pos.y < 0.5 && drag?.id !== id) g.position.y = Math.max(g.position.y, t.pos.y + (CARD_W / 2) * Math.sin(Math.acos(Math.min(1, Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion).y)))) * g.scale.x);
      if (d.lengthSq() < 1e-6 && v.lengthSq() < 1e-6 && Math.abs(ds) < 1e-4 && g.quaternion.angleTo(t.quat) < 1e-3) { g.position.copy(t.pos); g.quaternion.copy(t.quat); g.scale.setScalar(t.scale); v.set(0, 0, 0); g.userData.sv = 0; }
      else moving = true;
    }
    // Камера сдвинулась — толщина шеи и рук чужих тел пересчитана под новую дальность.
    const camSig = camera.position.toArray().map((v) => v.toFixed(1)).join();
    if (camSig !== bodiesCam) { bodiesCam = camSig; drawBodies(store.state); }
    armPose();
    placeTabs();
    placeGlow();
    if (placeDrops()) moving = true;
    if (placeDenies()) moving = true;
    if (placeSlams(now)) moving = true;
    if (placeHomeMark()) moving = true;
    placeBodies();
    if (placeChairs(dt)) moving = true;
    placeZones();
    placeMyBody();
    handBowl();
    // Стенд дизайна: без моего тела, рук и чаши руки — только стол и карты (`test.setBareTable`).
    if (bareTable) { myBody.visible = false; myArm.visible = false; fpsArm.visible = false; bowlG.visible = false; }
    // Своя рука у глаза — вторым проходом поверх всего: борт стола, подошедший к камере вплотную, её не закрывает.
    camera.layers.set(0);
    headsFront();
    // Тряска от удара: камера сдвинута только на время кадра — состояние взгляда (`rig`) она не меняет.
    const jolt = shakeNow(now), keepPos = camera.position.clone(), keepRot = camera.quaternion.clone();
    if (jolt) { camera.translateX(jolt.x); camera.translateY(jolt.y); camera.rotateZ(jolt.roll); camera.updateMatrixWorld(); }
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    camera.layers.set(HAND_LAYER);
    renderer.render(scene, camera);
    renderer.autoClear = true;
    camera.layers.set(0);
    if (jolt) { camera.position.copy(keepPos); camera.quaternion.copy(keepRot); camera.updateMatrixWorld(); }
    // Панели «лицом к камере» — повёрнуты, как камера; остальные стоят, как поставлены.
    for (const one of panel3d.values()) if (one.at.tilt === "camera") placePanel(one);
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
  // ——— ТЕНЬ НЕСОМОЙ КАРТЫ: свет строго сверху, только для неё — под картой, вертикально, всегда (и в полёте, и пока падает) ———
  // Косое солнце у несомой карты выключено: тень одна — та, что показывает, куда карта упадёт, если её выпустить из руки.
  let carriedForeign = new Map<string, string>();
  const flight = new Set<string>();
  const dropShadows = new Map<string, { mesh: THREE.Mesh; pos: THREE.BufferAttribute }>();
  const dropTex = (() => {
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 180;
    const c = cv.getContext("2d")!, m = 0.3 / (CARD_W + 0.6), mh = 0.3 / (CARD_H + 0.6);
    c.shadowColor = "#000"; c.shadowBlur = 16; c.fillStyle = "#000";
    c.beginPath(); c.roundRect(128 * m, 180 * mh, 128 * (1 - 2 * m), 180 * (1 - 2 * mh), 8); c.fill();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  })();
  const DROP_SHADOW = { opacity: 0.42, margin: 0.3, lift: 0.005 };
  /** Тень каждой несомой (и ещё падающей) карты: четыре угла карты проектируются вертикально вниз на сукно. */
  function placeDrops(): boolean {
    let moving = false;
    if (drag?.moved) flight.add(drag.id);
    for (const id of carriedForeign.keys()) flight.add(id);
    for (const id of [...flight]) {
      const o = cards.get(id);
      if (!o) { flight.delete(id); const d = dropShadows.get(id); if (d) { scene.remove(d.mesh); dropShadows.delete(id); } continue; }
      const t = o.target, g = o.group, carried = (drag?.moved && drag.id === id) || carriedForeign.has(id);
      const hidden = t.onCamera || t.over || !g.visible;
      if (!carried && (hidden || (Math.abs(g.position.y - t.pos.y) < 0.03 && g.quaternion.angleTo(t.quat) < 0.02))) flight.delete(id);
      let d = dropShadows.get(id);
      if (!flight.has(id) || hidden) { if (d) d.mesh.visible = false; continue; }
      if (!d) {
        const geo = new THREE.BufferGeometry(), pos = new THREE.BufferAttribute(new Float32Array(12), 3);
        geo.setAttribute("position", pos);
        geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
        geo.setIndex([0, 1, 2, 0, 2, 3]);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: dropTex, color: 0x000000, transparent: true, opacity: DROP_SHADOW.opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
        mesh.renderOrder = 1; mesh.frustumCulled = false; mesh.raycast = () => {};
        scene.add(mesh);
        d = { mesh, pos };
        dropShadows.set(id, d);
      }
      g.updateMatrixWorld(true);
      const hw = CARD_W / 2 + DROP_SHADOW.margin, hh = CARD_H / 2 + DROP_SHADOW.margin;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => { const w = g.localToWorld(new THREE.Vector3(sx! * hw, sy! * hh, 0)); d!.pos.setXYZ(i, w.x, DROP_SHADOW.lift, w.z); });
      d.pos.needsUpdate = true;
      d.mesh.visible = true;
      moving = true;
    }
    return moving;
  }
  // ——— подсветка стопки при приёмке: свечение на сукне ПОД колодой, в её позе и в перспективе (`probe.setPileGlow`) ———
  const glowMat = new THREE.MeshBasicMaterial({ map: cardGlowTexture(), color: 0x7fd1b9, transparent: true, depthWrite: false });
  const glowMesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W + 1, CARD_H + 1), glowMat);
  glowMesh.visible = false; glowMesh.renderOrder = 1; scene.add(glowMesh);
  let glowFor: { pile: string; level: "hint" | "hot" } | null = null;
  function placeGlow(): void {
    const p = glowFor ? store.state.piles.find((x) => x.id === glowFor!.pile) : undefined, base = p ? cards.get(p.cards[0]?.id ?? "") : undefined;
    if (!glowFor || !p || !base || !base.group.visible) { glowMesh.visible = false; return; }
    base.group.updateMatrixWorld(true);
    const at = base.group.getWorldPosition(new THREE.Vector3());
    glowMesh.position.set(at.x, 0.004, at.z);
    glowMesh.rotation.set(-Math.PI / 2, -pileAngle(p) * DEG, 0, "YXZ");
    glowMat.opacity = glowFor.level === "hot" ? 1 : 0.6;
    glowMesh.visible = true;
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
      const tx = at.x + d * Math.sin(a), tz = at.z + d * Math.cos(a);
      // Язычок не тонет под картами, что легли рядом на сукно: он выше самой высокой из них, лежащей под ним.
      let ty = at.y + 0.004;
      store.state.felt.forEach((fc, i) => { if (Math.hypot(fc.x - tx, fc.y - tz) < CARD_H / 2 + CARD_W / 2 + TAB.w * k) ty = Math.max(ty, 0.01 + i * FELT_STEP + 0.006); });
      t.mesh.position.set(tx, ty, tz);
      t.mesh.rotation.set(-Math.PI / 2, a, 0, "YXZ");
      t.mesh.scale.setScalar(k);
    }
    // Язычок и у стопки бесхозного стула: потянул — вся стопка под палец (ключ `chair:<id>`).
    for (const ch of store.state.chairs) {
      if (ch.owner || ch.croupier || !ch.hand.length) continue;
      const base = cards.get(ch.hand[0]!.id);
      if (!base || !base.group.visible) continue;
      const key = `chair:${ch.id}`;
      seen.add(key);
      let t = tabs.get(key);
      if (!t) { t = makeTab(); t.hit.userData.pile = key; tabs.set(key, t); }
      const sig = `${ch.hand.length}|false|${litTabs.has(key)}`;
      if (t.key !== sig) { t.key = sig; drawTab(t.cv, ch.hand.length, false, litTabs.has(key)); t.tex.needsUpdate = true; }
      base.group.updateMatrixWorld(true);
      // Пока стопку несут (или она долетает после отпускания), она повёрнута лицом ко мне — язычок встаёт под её низ; лежит на месте — язычок к середине стола.
      const carried = !!gather && ch.hand.some((h) => gather!.ids.includes(h.id));
      const at = base.group.getWorldPosition(new THREE.Vector3()), k = base.group.scale.x, a = -(((-(carried ? (myChair()?.angle ?? 0) : ch.angle) % 360) + 360) % 360) * DEG + (carried ? 0 : Math.PI), d = k * (CARD_H / 2 + TAB.l / 2);
      // Язычок смотрит К СЕРЕДИНЕ стола (а не к стулу): другим игрокам за него удобнее тянуть, а сидящему за стулом язычка нет вовсе.
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
    const down = camMode === "orbit" ? 1 : tuckOf(mineBlend(ch)), carry = handCarry ? `${handCarry.x.toFixed(2)},${handCarry.y.toFixed(2)}` : "", sig = [ch.angle, stanceNow(), down.toFixed(2), ch.hand.length, who.ink, who.name, c.x.toFixed(3), c.y.toFixed(3), c.z.toFixed(3), yaw.toFixed(2), camMode, carry, seatPull].join("|");
    if (sig === myBodySig) return;
    myBodySig = sig;
    myBody.clear();
    const sh = shoulders3(ch.angle, stanceNow(), seatPull), m = myHeadNow(ch), head = m.head, left = m.hand, away = m.away;
    const mat = inkOf(who.ink), { S, H, base } = dollBody(sh, head), L = handCarry ? V({ x: handCarry.x, y: handCarry.y, h: CARRY_H - 0.15 }) : V(handRest(left, ch, down, ch.hand.length));
    myHandDrawn = { x: L.x, y: L.z, h: L.y };
    const r = Math.hypot(sh.x, sh.y) || 1, rightDir = new THREE.Vector3(sh.y / r, 0, -sh.x / r);
    const shL = S.clone().addScaledVector(rightDir, -DOLL.bar), shR = S.clone().addScaledVector(rightDir, DOLL.bar);
    myBody.userData.shoulder = shR;
    myBody.add(stick(base, S, DOLL.spine, mat), stick(shL, shR, DOLL.spine, mat), ball(shL, DOLL.spine, mat), ball(shR, DOLL.spine, mat));
    // Рука в кадре (`head`, `fov`) — перед самым глазом: кисть и предплечье там закрыли бы весь вид, рисуются только карты.
    if (camMode === "orbit" || camMode === "top" || down > 0.3 || handCarry) myBody.add(...armParts(shL, L, -1, rightDir, DOLL.arm * farK(L), mat), ball(L, DOLL.hand * farK(L), mat));
    if (away) {
      // Камера ушла на другую сторону стола — голова с ней: ниточка к ней и кружок с именем, как у других.
      const tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([S, H]), new THREE.LineDashedMaterial({ color: who.ink, dashSize: 0.35, gapSize: 0.3, transparent: true, opacity: 0.6 }));
      tether.computeLineDistances();
      myBody.add(tether);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex(who.name, who.ink) }));
      sprite.scale.set(headW(), headH(), 1);
      sprite.center.set(0.5, 1 - 128 / 320);
      sprite.position.copy(H);
      myBody.add(sprite);
    } else if (camMode === "orbit" || camMode === "top") {
      for (const part of neckParts(S, H, DOLL.spine * farK(H), camMode === "top" ? Math.max(0, rig.lean) : 0, mat)) myBody.add(part);
      // Сверху голова видна: кружок с именем — как у остальных.
      if (camMode === "top") {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex(who.name, who.ink) }));
        sprite.scale.set(headW(), headH(), 1);
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
  const CHAIR = { gap: 0.4, seat: 3.4, thick: 0.35, seatY: -3.3, back: 3.8, leg: 0.32, floor: -7, radius: 7.9, pushed: 1.6, free: 0x7d8a86 };
  /** Мягкий круг свечения: белый, яркий у середины и гаснущий к краю; цвет задаёт материал. */
  let glowTex: THREE.CanvasTexture | null = null;
  const glowTexture = (): THREE.CanvasTexture => glowTex ??= canvasTexture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 14, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.45, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  interface ChairObj { group: THREE.Group; mats: THREE.MeshLambertMaterial[]; ink: string; k: number; halo: THREE.Mesh; tag: THREE.Sprite | null; tagKey: string }
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
    // Свечение под пересадкой: кольцо на уровне сиденья (светится сложением, не красит стул).
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(seat * 2.8, seat * 2.8), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = seatY + thick / 2 + 0.06; halo.visible = false; halo.renderOrder = 5;
    group.add(halo);
    chairRoot.add(group);
    return { group, mats: [mat], ink: "", k: 0, halo, tag: null, tagKey: "" };
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
      // Стул едет с телом: придвинулся — стул ближе к столу; при пересадке мой стул стоит там, куда его тянут.
      const pull = ch.owner === null ? 0 : ch.owner === store.me.key ? seatPull : bodyOf(ch.owner, ch.angle).seat ?? 0, angle = reseat && reseat.angle !== null && ch.id === myChair()?.id ? reseat.angle : ch.angle;
      const at = seatPoint(angle, CHAIR.radius + CHAIR.pushed * one.k - (reseat && reseat.pull !== null && ch.id === myChair()?.id ? reseat.pull : pull)), dir = seatPoint(angle, 1);
      one.group.position.set(at.x, 0, at.y);
      one.group.rotation.y = Math.atan2(dir.x, dir.y);
      one.group.userData.placed = true;
      // Пустой стул не рисуется (только зона перед ним); при пересадке видны все.
      one.group.visible = !!ch.owner || !!reseat;
      // Стул уменьшается вместе с человеком — от уровня сукна: сиденье поднимается, ножки укорачиваются.
      one.group.scale.setScalar(dollK);
      // Свой стул при пересадке светится: не другим цветом, а мягким свечением (подсветка стула и кольцо), оно дышит.
      const glow = !!reseat && ch.id === myChair()?.id, pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
      one.halo.visible = glow;
      // При пересадке над каждым занятым стулом — кругляшок аватара его хозяина (цвет и имя), чтобы было ясно, чей стул.
      const tagKey = reseat && who ? `${who.name}|${who.ink}` : "";
      if (tagKey !== one.tagKey) {
        one.tagKey = tagKey;
        if (one.tag) { one.group.remove(one.tag); (one.tag.material as THREE.SpriteMaterial).dispose(); one.tag = null; }
        if (tagKey && who) {
          const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex(who.name, who.ink), depthTest: false, transparent: true }));
          tag.scale.set(3.4, 4.25, 1); tag.position.set(0, 1.2, 0); tag.renderOrder = 7;
          one.group.add(tag); one.tag = tag;
        }
      }
      // Свечение — цвета самого игрока; цвет стула остаётся таким, каким был в игре.
      if (glow) { const hm = one.halo.material as THREE.MeshBasicMaterial; hm.color.set(store.me.ink); hm.opacity = 0.55 + 0.4 * pulse; moving = true; }
    }
    for (const [id, one] of chairObjs) if (!seen.has(id)) { chairRoot.remove(one.group); chairObjs.delete(id); }
    return moving;
  }

  // ——— бок колоды: тело стопки под картами ———
  const bodies = new Map<string, THREE.Mesh>();
  /** Тело у каждой стопки из двух и больше карт — от нижней карты вверх на её высоту; несомую сверху карту в него не считают. */
  function placeBodies(): void {
    const seen = new Set<string>();
    const flying = new Set<string>();
    if (drag?.moved) flying.add(drag.id);
    for (const c of store.carries) { flying.add(c.id); for (const w of c.with ?? []) flying.add(w.card.id); }
    for (const p of store.state.piles) {
      const base = p.pose === "ring" ? undefined : cards.get(p.cards[0]?.id ?? "");
      // Унесённые сверху (моим пальцем или чужим) в тело не входят: они ещё числятся в стопке, но летят отдельно, и ребро не должно за ними тянуться.
      let n = p.cards.length;
      while (n > 0 && flying.has(p.cards[n - 1]!.id)) n--;
      if (!base || !base.group.visible || n < 2) continue;
      seen.add(p.id);
      let m = bodies.get(p.id);
      if (!m) { m = new THREE.Mesh(pileBodyGeom(n), pileBodyMat); scene.add(m); bodies.set(p.id, m); }
      const g = pileBodyGeom(n);
      if (m.geometry !== g) m.geometry = g;
      m.userData.layers = n;
      base.group.updateMatrixWorld(true);
      // Тело идёт за нижней картой, куда бы её ни повернули: растёт по нормали нижней карты — вверх у лежащей, к глазу у несомой лицом ко мне. Сторону выбирает верхняя карта,
      // но только пока она рядом: улетевшую или отставшую на пружине в расчёт не берём (иначе ребро «убегает» за ней), а держим последнюю хорошую сторону.
      const at = base.group.getWorldPosition(new THREE.Vector3()), k = base.group.getWorldScale(new THREE.Vector3()).x;
      const topCard = cards.get(p.cards[n - 1]!.id), baseQ = base.group.getWorldQuaternion(new THREE.Quaternion());
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(baseQ).normalize(), expect = Math.max(1e-3, n * PILE_STEP * k);
      const along = topCard ? topCard.group.getWorldPosition(new THREE.Vector3()).sub(at).dot(normal) : 0;
      let sign = (m.userData.sign as number | undefined) ?? (base.target.onCamera ? -1 : normal.y >= 0 ? 1 : -1);
      if (Math.abs(along) > 0.4 * expect && Math.abs(along) < 4 * expect + 0.2) sign = Math.sign(along);
      m.userData.sign = sign;
      const zAxis = normal.clone().multiplyScalar(sign);
      const yRef = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQ), xAxis = yRef.clone().cross(zAxis);
      if (xAxis.lengthSq() < 1e-9) xAxis.set(1, 0, 0);
      xAxis.normalize();
      const yAxis = zAxis.clone().cross(xAxis).normalize();
      m.position.copy(at);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
      m.scale.set(k * 0.985, k * 0.985, k);
      const layer = base.target.onCamera || base.target.over ? HAND_LAYER : 0;
      if (m.userData.layer !== layer) { m.userData.layer = layer; m.layers.set(layer); }
    }
    for (const [id, m] of bodies) if (!seen.has(id)) { scene.remove(m); bodies.delete(id); }
  }

  // ——— палец ———
  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  const ndc = (e: { clientX: number; clientY: number }) => { const r = renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  const hitCard = (e: PointerEvent): string | null => {
    ray.setFromCamera(ndc(e), camera);
    const hits = ray.intersectObjects([...cards.values()].flatMap((o) => [o.front, o.back]), false);
    // Карты руки лежат слоями: берётся та, что поверх на экране (справа поверх слева, несомая выше всех), а не ближайшая по глубине: изогнутые карты пересекаются.
    let best: THREE.Intersection | undefined;
    for (const h of hits) if (!best || h.object.renderOrder > best.object.renderOrder) best = h;
    return (best?.object.userData.card as string | undefined) ?? null;
  };
  const hitTab = (e: PointerEvent): string | null => {
    ray.setFromCamera(ndc(e), camera);
    const hit = ray.intersectObjects([...tabs.values()].map((t) => t.hit), false)[0];
    return (hit?.object.userData.pile as string | undefined) ?? null;
  };
  const onFelt = (e: { clientX: number; clientY: number }): THREE.Vector3 | null => { ray.setFromCamera(ndc(e), camera); return ray.ray.intersectPlane(feltPlane, new THREE.Vector3()); };
  /** Можно ли взять: с сукна, верхнюю из стопки, из своей руки — и не под чужим пальцем. */
  // ——— ПРАВИЛА КАРТЫ (`CardRules`): что с этой картой нельзя именно мне ———
  /** Кто действует с этого экрана: на стенде — выбранный игрок (`store.actor`), в игре — я. */
  const actorKey = (): string => (store as { actor?: { key: string } }).actor?.key ?? store.me.key;
  const cardRule = (id: string, rule: CardRule): boolean => store.state.cardRules?.[id]?.[rule].includes(actorKey()) ?? false;
  const cardNotice = (id: string, rule: CardRule): boolean => store.state.cardRules?.[id]?.notice[rule] === true;
  /** Карта «отказывает»: кивает в сторону (тряска) — только если у этого запрета включено «показывать». */
  const denies = new Map<string, number>();
  const DENY = { ms: 450, shake: 0.12, hz: 16 };
  function deny(id: string, rule: CardRule): void {
    if (!cardNotice(id, rule) || !cards.has(id)) return;
    denies.set(id, performance.now());
    feel("deny", id, 1);
    draw();
  }
  /** Тряска отказавших карт; по окончании всё возвращается, как было. */
  function placeDenies(): boolean {
    if (!denies.size) return false;
    const now = performance.now();
    for (const [id, t0] of [...denies]) {
      const o = cards.get(id), age = now - t0;
      if (!o) { denies.delete(id); continue; }
      if (age >= DENY.ms) {
        denies.delete(id);
        o.front.position.x = o.back.position.x = 0;
        continue;
      }
      o.front.position.x = o.back.position.x = Math.sin((age / 1000) * DENY.hz * Math.PI * 2) * DENY.shake * (1 - age / DENY.ms);
    }
    return denies.size > 0;
  }
  /** Куда вернётся несомая карта, которую нельзя перемещать: контур и лёгкая заливка на сукне в её месте. Видно, только если у карты включено «показывать отказ». */
  const homeMark = (() => {
    const g = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    const edge = new THREE.LineLoop(cardEdge, new THREE.LineBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.95 }));
    fill.raycast = () => {};
    g.add(fill, edge);
    g.visible = false; g.renderOrder = 2;
    scene.add(g);
    return g;
  })();
  function placeHomeMark(): boolean {
    const id = drag?.moved ? drag.id : null, home = id ? store.state.felt.find((f) => f.id === id) : undefined;
    if (!id || !home || !cardRule(id, "move") || !cardNotice(id, "move")) { homeMark.visible = false; return false; }
    homeMark.position.set(home.x, 0.006, home.y);
    homeMark.rotation.set(-Math.PI / 2, -home.angle * DEG, 0, "YXZ");
    homeMark.visible = true;
    return false;
  }
  const takeable = (id: string): boolean => {
    const f = fromOf.get(id), lock = store.state.locks[id];
    if (!f || (lock && lock !== store.me.key) || (store.state.picks[id] && !mine(id))) return false;
    // Из бесхозной руки (за стулом никто не сидит) берёт любой: это стопка перед пустым стулом.
    return f.in === "felt" || (f.in === "pile" && f.top) || (f.in === "hand" && (f.mine || !store.state.chairs.find((c) => c.id === f.chair)?.owner));
  };
  /** `group` — несут выделенное лассо: отпустил — все выделенные туда же (`moveMany`), одним намерением. */
  let spin: { id: string; pid: number; cx: number; cy: number; a0: number; base: number; x0: number; y0: number; moved: boolean; angle: number } | null = null;
  let drag: { id: string; x: number; y: number; moved: boolean; hold: number; up: boolean; angle: number; rot: number; gap: number | null; place: Place | null; where: Where | null; spot: { x: number; y: number; w: number; angle: number } | null; zone: { pile?: string; chair?: string; i: number } | null; fingerHand: boolean; latch0: string | null; scrubbed: boolean } | null = null;
  let zoneFn: Parameters<SceneApi["setZone"]>[0] = null;
  let restRight: { x: number; y: number } | null = null;
  let carriedAt = 0;
  /** Вид, в котором был, пока смотрю реплей — туда возвращаемся. */
  let replayWas: CamMode | null = null;
  /**
   * НЕСУ СТОПКУ ЦЕЛИКОМ — остальным: где она в воздухе и в какую сторону лицом (ко мне). Тот же поток, что у одной карты (`store.carry`), только ключ — стопка со стола или `chair:<стул>`;
   * шлётся и пока палец стоит на месте: зритель верит такой стопке недолго (`STACK_FRESH_MS`).
   */
  let stackSent: { key: string; x: number; y: number; at: number } | null = null;
  function streamStack(): void {
    const key = pileCarry ? pileCarry.pile : chairStack?.moved && gather ? `chair:${chairStack.chair}` : null;
    if (!key) { stackSent = null; return; }
    const at = pileCarry ? seatOnFelt(pileCarry) : gather!.at, now = performance.now();
    const same = stackSent && stackSent.key === key && stackSent.x === at.x && stackSent.y === at.y;
    if (stackSent && now - stackSent.at < (same ? CARRY_EVERY_MS * 5 : CARRY_EVERY_MS)) return;
    stackSent = { key, x: at.x, y: at.y, at: now };
    store.carry({ id: key, over: { in: "felt", x: at.x, y: at.y, angle: ((-(myChair()?.angle ?? 0) % 360) + 360) % 360, up: false } });
  }
  let foreignStacks = false;
  setInterval(() => {
    streamStack();
    // Чужая стопка перестала приходить (отпустили, ушёл) — карты возвращаются на свои места, не ждут чужого события.
    const some = store.stacks.length > 0;
    if (!some && foreignStacks) { layout(store.state); draw(); }
    foreignStacks = some;
  }, CARRY_EVERY_MS);
  /** Верх карты — туда, куда на столе указывает «верх экрана» (вектор камеры «вверх» на сукне): низ карты к низу экрана. Так несут при виде сверху. */
  const viewAngle = (): number => {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    if (Math.hypot(up.x, up.z) < 1e-3) up.set(0, 0, -1).applyQuaternion(camera.quaternion);
    return ((Math.atan2(up.x, -up.z) / DEG) + 360) % 360;
  };
  /**
   * Поворот несомой карты под пальцем в точке экрана: сверху — как `viewAngle`; от первого лица (и орбита) — верх карты смотрит ОТ глаза, низ — на глаз,
   * из одной точки (камеры) для любой точки стола: слева, справа и по центру карта стоит к глазу одинаково, наклон — только к нему.
   */
  const carryAngle = (x: number, y: number): number => {
    if (camMode === "top") return viewAngle();
    ray.setFromCamera(ndc({ clientX: x, clientY: y }), camera);
    const at = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -liftH()), new THREE.Vector3());
    if (!at) return viewAngle();
    const fx = at.x - camera.position.x, fz = at.z - camera.position.z;
    return Math.hypot(fx, fz) < 1e-3 ? viewAngle() : ((Math.atan2(fx, -fz) / DEG) + 360) % 360;
  };
  /** Угол несомой карты: по камере плюс то, на сколько её довернули рукой (Ctrl/Cmd, второй палец); «нельзя вращать» — прежний угол. */
  const heldAngle = (d: { id: string; rot: number }, x: number, y: number): number => {
    const home = cardRule(d.id, "rotate") ? store.state.felt.find((f) => f.id === d.id) : undefined;
    return home ? home.angle : (((carryAngle(x, y) + d.rot) % 360) + 360) % 360;
  };
  /** Высота несомой карты над сукном — доля высоты головы (камеры), как у стола: камера выше — и карта выше. */
  const liftH = () => Math.max(0.4, Math.min(8, HEAD.lift * eyeY()));
  /** Карта под пальцем: на высоте `liftH` там, где луч из глаза через палец её пересекает, — ровно под курсором. */
  const heldAt = (x: number, y: number, angle: number, up: boolean): Place | null => {
    ray.setFromCamera(ndc({ clientX: x, clientY: y }), camera);
    const at = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -liftH()), new THREE.Vector3());
    if (!at) return null;
    const p = lying(at.x, at.z, at.y, angle, up);
    p.scale = 1.06;
    p.held = true;
    return camMode === "top" ? p : faceEye(p, camera.position);
  };
  /** Моя левая рука (с веером) — куда тянется правая, когда несу карту в свою руку: так это видят остальные. */
  const myLeftHand = (): { x: number; y: number } | null => {
    const ch = myChair();
    if (!ch) return null;
    const l = myHeadNow(ch).hand;
    return { x: l.x, y: l.y };
  };
  const mine = (id: string) => store.state.picks[id] === store.me.key;
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
      if (!o || (drag?.moved && drag.id === c.id) || (c.id === liftedId && ch.hand.length > 1)) continue;
      o.group.updateMatrixWorld(true);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const p = project(o.group.localToWorld(new THREE.Vector3(sx * hw, sy * hh, 0)));
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
      seen++;
    }
    if (!seen) return null;
    const cx = (x0 + x1) / 2, w = Math.min(r.width - 8, Math.max(FRAME.minW, x1 - x0 + 2 * FRAME.pad)), h = Math.max(FRAME.minH, y1 - y0 + 2 * FRAME.pad);
    const x = Math.max(r.left + 4, Math.min(r.right - 4 - w, cx - w / 2)), y = (y0 + y1) / 2 - h / 2 - FRAME.edge / 2;
    return { x, y: y - FRAME.edge / 2, w, h: h + FRAME.edge, edge: FRAME.edge };
  }
  // Пальцы на экране — для простоя шеи: пока хоть один лежит, голова не возвращается.
  const live = new Set<number>();
  const liftFinger = (e: PointerEvent) => { live.delete(e.pointerId); };
  renderer.domElement.addEventListener("pointerup", liftFinger, { capture: true });
  renderer.domElement.addEventListener("pointercancel", liftFinger, { capture: true });
  // ПЕРЕСАДКА: палец на своём стуле тянет его по кругу (орбита при этом спит); на остальном — вращает, двигает и зумит вид.
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (!reseat || reseat.pid !== null) return;
    const mineId = myChair()?.id;
    ray.setFromCamera(ndc(e), camera);
    const hit = mineId ? ray.intersectObject(chairRoot, true).find((h) => h.object.userData.chair === mineId && h.object.visible && h.object.parent?.visible !== false) : undefined;
    if (!hit) return;
    e.stopImmediatePropagation();
    reseat.pid = e.pointerId;
    orbit.enabled = false;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* нет такого указателя */ }
  }, { capture: true });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!reseat || reseat.pid !== e.pointerId) return;
    e.stopImmediatePropagation();
    const at = onFelt(e);
    if (!at || Math.hypot(at.x, at.z) < 0.5) return;
    const angle = Math.round(((Math.atan2(at.x, at.z) * 180) / Math.PI + 360) % 360);
    // Стул тянут не только по кругу, но и от стола / к столу: расстояние от середины — посадка (от «как сидишь» до предела назад).
    const mineId = myChair()?.id ?? "", mineObj = chairObjs.get(mineId);
    const pull = Math.max(SEAT_PULL.min, Math.min(SEAT_PULL.max, CHAIR.radius + CHAIR.pushed * (mineObj?.k ?? 0) - Math.hypot(at.x, at.z)));
    // СТУЛЬЯ НЕ НАПЛЫВАЮТ: на чужое место или впритык к чужому стулу не поставить — стул останавливается у края.
    const c = seatPoint(angle, CHAIR.radius + CHAIR.pushed * (mineObj?.k ?? 0) - pull);
    for (const [id, one] of chairObjs) if (id !== mineId && Math.hypot(one.group.position.x - c.x, one.group.position.z - c.y) < CHAIR.seat + CHAIR.gap) return;
    reseat.angle = angle;
    reseat.pull = pull;
    layout(store.state); draw();
  }, { capture: true });
  const reseatUp = (e: PointerEvent): void => {
    if (!reseat || reseat.pid !== e.pointerId) return;
    reseat.pid = null;
    orbit.enabled = true;
  };
  renderer.domElement.addEventListener("pointerup", reseatUp, { capture: true });
  renderer.domElement.addEventListener("pointercancel", reseatUp, { capture: true });
  // ——— ЯЗЫЧОК СТОПКИ БЕСХОЗНОГО СТУЛА: вся стопка идёт под палец и ложится туда, куда отпустили ———
  let chairStack: { pid: number; chair: string; x: number; y: number; moved: boolean } | null = null;
  /**
   * ЧТО Я СЕЙЧАС НЕСУ — одно понятие для карты, стопки со стола и стопки бесхозного стула: какие карты, куда целюсь в руку (`gap`: щель в моей руке или `null`), можно ли это
   * вообще положить в руку (`takeable`), чья это карта в руке (`skip`) и куда её уже нацелили (`where`). Зона руки, подсветка зон стульев и щели руки читают это, а не каждый свой источник.
   */
  type Held = { kind: "card" | "pile" | "stack" | "hand"; ids: string[]; gap: number | null; takeable: boolean; skip?: string; where: Where | null };
  function held(): Held | null {
    if (pileCarry) {
      const p = store.state.piles.find((x) => x.id === pileCarry!.pile);
      return { kind: "pile", ids: p ? p.cards.map((c) => c.id) : [], gap: pileOver && camMode === "head" ? pileOver.gap : null, takeable: !!p && p.cards.length > 0 && !p.pin && !p.shut && !p.seal && !p.zone, where: null };
    }
    if (chairStack?.moved && gather) return { kind: "stack", ids: gather.ids, gap: chairOver && camMode === "head" ? chairOver.gap : null, takeable: true, where: null };
    // Тяну свою руку стопкой вверх: вернуть её можно обратно в руку, а отпустить — только на стол, поэтому в чужие зоны она не целится (см. `carrying` у зон стульев).
    if (handCarry) return { kind: "hand", ids: myChair()?.hand.map((c) => c.id) ?? [], gap: null, takeable: true, where: null };
    if (drag?.moved) return { kind: "card", ids: [drag.id], gap: drag.gap, takeable: true, skip: drag.id, where: drag.where ?? null };
    return null;
  }
  function chairStackDown(chairId: string, e: PointerEvent): void {
    const ch = store.state.chairs.find((c) => c.id === chairId);
    if (!ch || ch.owner || !ch.hand.length) return;
    orbit.enabled = false;
    live.add(e.pointerId);
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* нет такого указателя */ }
    chairStack = { pid: e.pointerId, chair: chairId, x: e.clientX, y: e.clientY, moved: false };
    const move = (ev: PointerEvent): void => {
      const cs = chairStack;
      if (!cs || ev.pointerId !== cs.pid) return;
      if (!cs.moved && Math.hypot(ev.clientX - cs.x, ev.clientY - cs.y) < 8) return;
      const c2 = store.state.chairs.find((c) => c.id === cs.chair);
      const at = onFelt(ev);
      if (!c2 || !at) return;
      if (!cs.moved) {
        cs.moved = true;
        gather = { ids: c2.hand.map((h) => h.id), at: seatOnFelt({ x: at.x, y: at.z }), t0: performance.now(), fast: true, from: { x: cs.x, y: cs.y }, until: Infinity };
        grabFn?.();
      }
      if (gather) {
        gather.at = seatOnFelt({ x: at.x, y: at.z });
        // Над моей рукой — карты в щелях руки (стопка «в руку»), иначе у пальца одной стопкой.
        const a = aim(ev.clientX, ev.clientY), over = a.in === "hand" && a.chair === myChair()?.id && camMode === "head";
        chairOver = over ? { ids: gather.ids, gap: (a as { i: number }).i } : null;
        pileOverIds.clear();
        if (chairOver) chairOver.ids.forEach((id, j) => pileOverIds.set(id, j));
        layout(store.state); applyGather(); draw();
      }
    };
    const up = (ev: PointerEvent): void => {
      const cs = chairStack;
      if (!cs || ev.pointerId !== cs.pid) return;
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
      chairStack = null;
      chairOver = null; pileOverIds.clear();
      live.delete(ev.pointerId);
      orbit.enabled = camMode === "orbit";
      const g = gather;
      if (!cs.moved || !g) return;
      const ids = g.ids, to = aim(ev.clientX, ev.clientY), angle = ((-(myChair()?.angle ?? 0) % 360) + 360) % 360;
      if (to.in === "hand") store.send({ t: "moveMany", moves: ids.map((id, k) => ({ id, to: { in: "hand" as const, chair: to.chair, i: to.i + k } })) });
      else if (to.in === "deck") store.send({ t: "gather", ids, side: "keep", to: { pile: to.pile } });
      else store.send({ t: "gather", ids, side: "keep", to: { x: g.at.x, y: g.at.y, angle } });
      g.until = performance.now() + GATHER.settleMs;
      draw();
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
  }

  // ——— РЕЖИМ «В СТОПКУ» ———
  // Выбор: тап по карте или стопке на столе выделяет (повторный — снимает), проведение пальцем выделяет всё, что под ним; выбор общий (`picks`), его видят все.
  // Сбор: долгий холд на выделенном — все выделенные карты неспешно слетаются под палец в одну стопку; двинул палец — летят быстро и идут за ним; отпустил — одно
  // намерение `gather` (стопка там, где палец, стороны как лежали), выбор снят. Карты в руках (своих и чужих) выбору не подчиняются.
  const isTableCard = (id: string): boolean => { const f = fromOf.get(id); return !!f && (f.in === "felt" || f.in === "pile"); };
  function myTablePicks(): string[] { return Object.entries(store.state.picks).filter(([id, by]) => by === store.me.key && isTableCard(id)).map(([id]) => id); }
  /** Что выделяет нажатие на карту: свободная — её саму; карта стопки — всю стопку (круг хода — одну карту; закрытая стопка и руки — ничего). */
  function stackTargets(id: string): string[] {
    const f = fromOf.get(id);
    if (!f || f.in === "hand") return [];
    if (f.in === "felt") return [id];
    const pile = store.state.piles.find((p) => p.id === f.pile);
    if (!pile || pile.shut || pile.seal) return [];
    return pile.pose === "ring" ? [id] : pile.cards.map((c) => c.id);
  }
  function setStackMode(on: boolean): void {
    if (on === stackMode) return;
    stackMode = on;
    stackPress = null;
    gather = null;
    if (!on && Object.values(store.state.picks).some((by) => by === store.me.key)) store.send({ t: "unpick" });
    layout(store.state); draw();
  }
  function pickIds(ids: string[], on: boolean): void {
    const todo = ids.filter((id) => (on ? !store.state.picks[id] : mine(id)));
    if (todo.length) store.send({ t: "pick", ids: todo, on });
  }
  let stackPress: { pid: number; x: number; y: number; ids: string[]; moved: boolean; timer: number; seen: Set<string> } | null = null;
  const gatherSet = (): Set<string> => new Set(gather?.ids ?? []);
  const cardUp = (id: string): boolean => store.state.felt.find((c) => c.id === id)?.up ?? !!store.state.piles.flatMap((p) => p.cards).find((c) => c.id === id)?.up;
  /** Цели летящих карт: после старта (с разносом) — стопка в точке пальца, лицом как лежали. Возвращает, идёт ли ещё сбор. */
  function applyGather(): boolean {
    const g = gather;
    if (!g) return false;
    const now = performance.now();
    if (now > g.until) { gather = null; layout(store.state); return false; }
    if (chairOver) return true; // над моей рукой карты стоят в щелях руки (retargetMine), у пальца их не складываем
    const angle = ((-(myChair()?.angle ?? 0) % 360) + 360) % 360;
    g.ids.forEach((id, i) => {
      const o = cards.get(id);
      if (!o || (!g.fast && now < g.t0 + i * GATHER.staggerMs)) return;
      o.target = lying(g.at.x, g.at.y, 0.03 + i * PILE_STEP, angle, cardUp(id));
    });
    return true;
  }
  function startGather(): void {
    const pr = stackPress;
    if (!pr || pr.moved) return;
    pr.timer = 0;
    // Холд — на выделенном: нажатое, что выделено не было, ничего не стягивает.
    if (!pr.ids.some((id) => mine(id))) return;
    const ids = myTablePicks();
    if (!ids.length) return;
    const at = onFelt({ clientX: pr.x, clientY: pr.y });
    if (!at) return;
    gather = { ids, at: seatOnFelt({ x: at.x, y: at.z }), t0: performance.now(), fast: false, from: { x: pr.x, y: pr.y }, until: Infinity };
    layout(store.state); draw();
  }
  function finishGather(): void {
    const g = gather;
    if (!g) return;
    const ids = g.ids.filter(isTableCard), angle = ((-(myChair()?.angle ?? 0) % 360) + 360) % 360;
    if (ids.length) store.send({ t: "gather", ids, side: "keep", to: { x: g.at.x, y: g.at.y, angle } });
    store.send({ t: "unpick" });
    g.until = performance.now() + GATHER.settleMs;
    draw();
  }
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (!stackMode || reseat || store.replay?.on) return;
    const pile = hitTab(e), top = pile ? store.state.piles.find((p) => p.id === pile)?.cards.at(-1)?.id : hitCard(e);
    const ids = top ? stackTargets(top) : [];
    if (!ids.length) return; // мимо — камера и взгляд как обычно
    e.stopImmediatePropagation();
    live.add(e.pointerId);
    orbit.enabled = false;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* нет такого указателя */ }
    stackPress = { pid: e.pointerId, x: e.clientX, y: e.clientY, ids, moved: false, timer: window.setTimeout(startGather, GATHER.holdMs), seen: new Set(ids) };
  }, { capture: true });
  renderer.domElement.addEventListener("pointermove", (e) => {
    const pr = stackPress;
    if (!pr || pr.pid !== e.pointerId) return;
    e.stopImmediatePropagation();
    if (gather) {
      const at = onFelt(e);
      if (at) gather.at = seatOnFelt({ x: at.x, y: at.z });
      if (!gather.fast && Math.hypot(e.clientX - gather.from.x, e.clientY - gather.from.y) > GATHER.moveStartPx) gather.fast = true;
      applyGather(); draw();
      return;
    }
    if (!pr.moved && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 8) return;
    if (!pr.moved) { pr.moved = true; clearTimeout(pr.timer); pickIds(pr.ids, true); }
    // Проведение пальцем выделяет всё, что под ним.
    const pile = hitTab(e), top = pile ? store.state.piles.find((p) => p.id === pile)?.cards.at(-1)?.id : hitCard(e);
    const fresh = (top ? stackTargets(top) : []).filter((id) => !pr.seen.has(id));
    for (const id of fresh) pr.seen.add(id);
    pickIds(fresh, true);
  }, { capture: true });
  const stackUp = (e: PointerEvent): void => {
    const pr = stackPress;
    if (!pr || pr.pid !== e.pointerId) return;
    e.stopImmediatePropagation();
    stackPress = null;
    clearTimeout(pr.timer);
    live.delete(e.pointerId);
    orbit.enabled = camMode === "orbit";
    if (gather) { finishGather(); return; }
    if (!pr.moved) pickIds(pr.ids, !pr.ids.every(mine));
  };
  renderer.domElement.addEventListener("pointerup", stackUp, { capture: true });
  renderer.domElement.addEventListener("pointercancel", stackUp, { capture: true });
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.button === 2) {
      // Левой держу карту, правую нажал — удар.
      if (drag?.moved && e.pointerType === "mouse") { e.stopImmediatePropagation(); e.preventDefault(); slam(); }
      return;
    }
    if (reseat || store.replay?.on) return;
    // ВТОРОЙ ПАЛЕЦ при несомой карте — переворот: ведёт карту вбок (`cardFlip.ts`); камеру и всё остальное это касание не трогает.
    if (drag?.moved && dragPid !== null && e.pointerId !== dragPid && !flipTouch) {
      e.stopImmediatePropagation();
      try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* нет такого указателя */ }
      const fl = new CardFlip();
      fl.begin(e.clientX);
      flipTouch = { pid: e.pointerId, fl, x0: e.clientX, y0: e.clientY, mode: "undecided", rot0: drag.rot, t0: performance.now() };
      return;
    }
    live.add(e.pointerId);
    // Язычок — первым: он лежит у самой кромки стопки и перекрыл бы её верхнюю карту.
    const pile = tabFn ? hitTab(e) : null;
    if (pile && pile.startsWith("chair:")) { e.stopImmediatePropagation(); chairStackDown(pile.slice(6), e); return; }
    if (pile) { e.stopImmediatePropagation(); tabFn!(pile, e); return; }
    const id = hitCard(e);
    if (id && cardRule(id, "lift")) { deny(id, "lift"); return; }
    if (!id || !takeable(id)) { if (liftedId) { liftedId = null; layout(store.state); } return; }
    // Свободная камера: моя рука — стопка на столе, и тянуть из неё можно только верхнюю карту.
    if (camMode === "orbit") { const from = fromOf.get(id); if (from?.in === "hand" && from.mine && id !== myChair()?.hand.at(-1)?.id) return; }
    // Карту — пальцем; облёт — только по пустому.
    e.stopImmediatePropagation();
    startDrag(id, e);
  }, { capture: true });
  function startDrag(id: string, e: PointerEvent): void {
    // Карту взяли снова, пока она «садилась» после броска: посадка кончена, держит палец, а не прежнее место.
    if (landing?.id === id) landing = null;
    const fromHand = fromOf.get(id);
    const latch0 = liftedId, fingerHand = !!fromHand && fromHand.in === "hand" && fromHand.mine && camMode === "head" && levelOn;
    liftedId = fromHand && fromHand.in === "hand" && fromHand.mine && camMode === "head" ? id : null;
    orbit.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
    const f = fromOf.get(id)!;
    const c = f.in === "felt" ? store.state.felt.find((x) => x.id === id) : undefined;
    const my = myChair()?.angle ?? 0;
    drag = { id, x: e.clientX, y: e.clientY, moved: false, hold: 0, up: c ? c.up : f.in === "hand" ? (f.mine ? true : !!store.state.chairs.find((q) => q.id === f.chair)?.hand.find((x) => x.id === id)?.up) : !!store.state.piles.find((p) => p.id === (f as { pile: string }).pile)?.cards.find((x) => x.id === id)?.up, angle: carryAngle(e.clientX, e.clientY), rot: 0, gap: null, place: null, where: null, spot: null, zone: null, fingerHand, latch0, scrubbed: false };
    trail = []; lastThrow = 0; ptrX = e.clientX; lastRotTick = 0;
    dragPid = e.pointerId; flipDeg = 0; flipTouch = null; lastFinger = { x: e.clientX, y: e.clientY };
    // Удержание поднимает карту и без движения пальца.
    const held = drag;
    window.setTimeout(() => { if (drag === held && !held.moved && dragPid !== null) advanceDrag(lastFinger.x, lastFinger.y, true); }, HOLD_PICK_MS);
    layout(store.state);
  }
  /** Моя карта ближе всего к пальцу по горизонтали — та, что поднимется под ним. */
  const handCardNearX = (x: number): string | null => {
    const ch = myChair();
    let best: string | null = null, d = Infinity;
    for (const c of ch?.hand ?? []) {
      const o = cards.get(c.id);
      if (!o) continue;
      o.group.updateMatrixWorld(true);
      const dx = Math.abs(project(o.group.localToWorld(new THREE.Vector3(0, 0, 0))).x - x);
      if (dx < d) { d = dx; best = c.id; }
    }
    return best;
  };
  let bareTable = false;
  /** Стенд дизайна: камера стоит как поставлена — ни пальцем, ни шеей, ни колесом (`test.setCamLocked`). */
  let camLocked = false;
  /** Несомая карта над стопкой садится ровно на неё. Стенд дизайна выключает это: карта остаётся на весу под пальцем (`test.setPileSnap`). */
  let pileSnap = true;
  // ——— ПЕРЕВОРОТ КАРТЫ В РУКЕ: F (комп) или второй палец вбок (телефон); логика жеста — `cardFlip.ts` ———
  let dragPid: number | null = null, lastFinger = { x: 0, y: 0 }, flipDeg = 0, flipTouch: { pid: number; fl: CardFlip; x0: number; y0: number; mode: "undecided" | "flip" | "turn"; rot0: number; t0: number } | null = null;
  /** Карта, которую несу, с поворотом «в воздухе»: вокруг её длинной оси на `flipDeg`. */
  const flipped = (p: Place): Place => (flipDeg ? { ...p, quat: p.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), flipDeg * DEG)) } : p);
  const dragPlace = (x: number, y: number): Place | null => {
    const d = drag!, w = d.where, pile = w && w.in === "deck" ? store.state.piles.find((q) => q.id === w.pile) : undefined;
    return d.gap !== null || d.spot ? null : pile && pile.pose !== "ring" && pileSnap ? lying(pile.x, pile.y, 0.25 + pile.cards.length * PILE_STEP, pileAngle(pile), d.up) : heldAt(x, y, d.angle, d.up);
  };
  /** Поток «несу» — с углом переворота: остальные видят карту в движении (не чаще `CARRY_EVERY_MS`). */
  const pushCarry = (): void => {
    const now = performance.now();
    if (!drag?.where || now - carriedAt < CARRY_EVERY_MS) return;
    carriedAt = now;
    const tilt = drag.place && drag.where.in === "felt" ? Math.round(Math.acos(Math.min(1, Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(drag.place.quat).y))) / DEG) : 0;
    store.carry({ id: drag.id, over: drag.where, ...(flipDeg ? { flip: Math.round(flipDeg) } : {}), ...(tilt ? { tilt } : {}) });
  };
  /** Щёлкнуло: сторона сменилась, карта доворачивается сама (пружина), угол в воздухе сброшен. */
  const flipClick = (): void => {
    const d = drag;
    if (!d?.moved) return;
    if (cardRule(d.id, "turn")) { deny(d.id, "turn"); return; }
    d.up = !d.up;
    feel("flip", d.id, 1);
    // Стол сам помнит, какой стороной карту положат: при броске он берёт сторону карты, а не метку жеста, поэтому переворот — обычное намерение «перевернуть» над удерживаемой картой.
    store.send({ t: "turn", id: d.id });
    flipDeg = 0;
    d.where = target({ clientX: lastFinger.x, clientY: lastFinger.y }, d);
    d.place = dragPlace(lastFinger.x, lastFinger.y);
    carriedAt = 0;
    pushCarry();
    layout(store.state);
  };
  const PULL_PX = 18;
  /**
   * Палец ведёт карту: сдвинулся на 6 пикселей — карта поднята и идёт за ним. `hold` — палец держат на карте дольше `HOLD_PICK_MS` и не двигают:
   * карта поднимается и без сдвига. Тап (отпустил раньше) карту не трогает.
   */
  const advanceDrag = (x: number, y: number, hold = false, ts?: number): void => {
    if (!drag) return;
    // ПАЛЕЦ ПО РУКЕ: пока он не потянул вверх, карту не берут — под пальцем поднимается та, над которой он стоит (одна), и палец может
    // скользить вдоль руки; потянул вверх — берёт ту, что поднята. (Только в виде «голова» и с новым язычком руки.)
    if (!hold && !drag.moved && drag.fingerHand) {
      const dx = x - drag.x, dy = y - drag.y;
      if (dy > -PULL_PX) {
        if (Math.abs(dx) >= 4 || drag.scrubbed) {
          const id = handCardNearX(x);
          drag.scrubbed = true;
          if (id && id !== drag.id) { drag.id = id; liftedId = id; layout(store.state); draw(); }
        }
        return;
      }
    }
    if (!hold && !drag.moved && Math.hypot(x - drag.x, y - drag.y) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      feel("grab", drag.id, 1);
      store.send({ t: "grab", id: drag.id });
      grabFn?.();
      drag.hold = window.setInterval(() => { if (drag) store.send({ t: "hold", id: drag.id }); }, HOLD_MS);
    }
    drag.angle = heldAngle(drag, x, y);
    if (Math.abs(drag.rot - lastRotTick) >= 15) { lastRotTick = drag.rot; feel("spin", drag.id, 1); }
    trail.push({ x, y, t: ts ?? performance.now() });
    // Куда целит палец: над своей рукой — щель в руке и правая рука у левой; иначе — карта под пальцем над столом.
    const where = target({ clientX: x, clientY: y }, drag);
    const z = zoneFn?.(x, y) ?? null;
    drag.where = where;
    drag.zone = z ? (z.where.in === "deck" ? { pile: z.where.pile, i: z.where.i } : { chair: z.where.chair, i: z.where.i }) : null;
    drag.spot = drag.zone ? z!.spot : null;
    drag.gap = where.in === "hand" && where.chair === myChair()?.id ? where.i : null;
    const pile = where.in === "deck" ? store.state.piles.find((p) => p.id === where.pile) : undefined;
    // Над стопкой — карта уже над ней, наверху: видно, куда ляжет; рука остальным — на стопке.
    drag.place = dragPlace(x, y);
    const zonePile = drag.zone?.pile ? store.state.piles.find((p) => p.id === drag!.zone!.pile) : undefined;
    const zoneChair = drag.zone?.chair ? store.state.chairs.find((c) => c.id === drag!.zone!.chair) : undefined, zoneHand = zoneChair ? leftOf(zoneChair) : null;
    rightAt = drag.gap !== null ? myLeftHand() : zoneHand ? { x: zoneHand.x, y: zoneHand.y } : zonePile ? { x: zonePile.x, y: zonePile.y } : pile ? { x: pile.x, y: pile.y } : drag.place ? { x: drag.place.pos.x, y: drag.place.pos.z } : null;
    sendBody();
    pushCarry();
    layout(store.state);
  };
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (dragPid !== null && e.pointerId !== dragPid) return;
    // Ctrl/Cmd при переносе: карта стоит на месте и вращается за движением мыши (вправо — по часовой).
    const dx = e.clientX - ptrX;
    ptrX = e.clientX;
    // Правая кнопка нажата поверх левой: браузер шлёт это не `pointerdown`, а `pointermove` с новыми `buttons` — удар.
    const chord = (e.buttons & 2) !== 0 && (prevButtons & 2) === 0 && drag.moved && e.pointerType === "mouse";
    prevButtons = e.buttons;
    if (chord) { slam(); return; }
    if ((e.ctrlKey || e.metaKey) && drag.moved && e.pointerType === "mouse") {
      if (cardRule(drag.id, "rotate")) { deny(drag.id, "rotate"); return; }
      drag.rot += dx * SPIN.perPx;
      advanceDrag(lastFinger.x, lastFinger.y);
      return;
    }
    lastFinger = { x: e.clientX, y: e.clientY };
    advanceDrag(e.clientX, e.clientY, false, e.timeStamp);
  });
  const end = (e: PointerEvent) => {
    if (!drag) return;
    if (dragPid !== null && e.pointerId !== dragPid) return;
    const d = drag;
    drag = null;
    // Первый палец отпустил: щёлкнуло — переворот остался (`d.up` уже сменён), не щёлкнуло — обрыв, как дроп без переворота.
    flipTouch = null; flipDeg = 0; dragPid = null;
    if (d.moved) liftedId = null;
    orbit.enabled = camMode === "orbit";
    clearInterval(d.hold);
    rightAt = null;
    sendBody(true);
    if (!d.moved) {
      // Скользил по руке (не тап): поднятая под пальцем карта опускается — остаётся поднятой только та, что была поднята тапом.
      // Тап по карте ничего не делает: поднятая под пальцем (по руке) возвращается как была до касания.
      if (d.fingerHand) { liftedId = d.latch0; layout(store.state); draw(); return; }
      draw();
      return;
    }
    // Легла — ждёт ответа стола там, куда её положили (над сукном — опускается на сукно, в руку — в щель).
    const o = cards.get(d.id), to = target(e, d);
    // ЗВУК — В МОМЕНТ ОТПУСКАНИЯ, а не когда карта доехала: палец отпустил — слышно сразу (удар об стол звучит от самого удара, `slam`).
    if (!slamForce) {
      if (to.in === "felt") {
        const fall = Math.min(1, Math.max(0, (o?.group.position.y ?? 0) / 2.5));
        if (cardRule(d.id, "move")) { if (cardNotice(d.id, "move")) feel("home", d.id, 1); }
        else feel(lastThrow > 0.5 ? "throw" : "lay", d.id, lastThrow > 0.5 ? lastThrow : fall);
      } else feel("lay", d.id, 0.4);
    }
    if (o && to.in === "felt") landing = { id: d.id, place: lying(to.x, to.y, 0.01 + store.state.felt.length * FELT_STEP, to.angle, to.up), key: fromKey(d.id), until: performance.now() + 1500 };
    // В свою руку (из руки, с сукна, из стопки) — в щель. В стопку и в круг — туда, где карта ляжет: ответ стола даст то же место.
    const now = performance.now();
    if (to.in === "hand" && to.chair === myChair()?.id) {
      const st = store.state, card = st.felt.find((c) => c.id === d.id) ?? st.piles.flatMap((p) => p.cards).find((c) => c.id === d.id) ?? st.chairs.flatMap((c) => c.hand).find((c) => c.id === d.id);
      if (card) incoming = { id: d.id, i: to.i, key: fromKey(d.id), until: now + 1500, card };
    } else if (to.in === "deck") {
      const pile = store.state.piles.find((p) => p.id === to.pile);
      if (pile?.pose === "ring" && to.turn !== undefined) {
        const busy = pile.cards.filter((c) => c.id !== d.id && c.turn !== undefined).map((c) => c.turn!);
        const at = ringTurned({ x: pile.x, y: pile.y }, ringLanding(to.turn, busy));
        landing = { id: d.id, place: lying(at.x, at.y, 0.01 + pile.cards.filter((c) => c.id !== d.id).length * FELT_STEP, at.angle, d.up), key: fromKey(d.id), until: now + 1500 };
      } else if (pile && o) landing = { id: d.id, place: lying(pile.x, pile.y, 0.01 + pile.cards.filter((c) => c.id !== d.id).length * PILE_STEP, pileAngle(pile), d.up), key: fromKey(d.id), until: now + 1500 };
    }
    store.send({ t: "drop", id: d.id, to });
    layout(store.state);
  };
  // Второй палец ведёт переворот; поднят до щелчка — карта откатывается, после щелчка переворот остаётся.
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!flipTouch || e.pointerId !== flipTouch.pid) return;
    e.stopImmediatePropagation();
    const t = flipTouch;
    // Режим второго пальца выбирается по первому заметному направлению и держится, пока палец не оторван: вбок — переворот, вниз-вверх — поворот.
    if (t.mode === "undecided") {
      const dx = Math.abs(e.clientX - t.x0), dy = Math.abs(e.clientY - t.y0);
      if (Math.max(dx, dy) < SPIN.dead) return;
      t.mode = dy > dx ? "turn" : "flip";
      if (t.mode === "flip" && drag && cardRule(drag.id, "turn")) deny(drag.id, "turn");
      if (t.mode === "turn" && drag && cardRule(drag.id, "rotate")) deny(drag.id, "rotate");
    }
    if (!drag) return;
    if (t.mode === "turn") {
      if (cardRule(drag.id, "rotate")) return;
      drag.rot = t.rot0 + (e.clientY - t.y0) * SPIN.perPx;
      advanceDrag(lastFinger.x, lastFinger.y);
      return;
    }
    if (cardRule(drag.id, "turn")) return;
    const r = t.fl.move(e.clientX);
    if (r.click) flipClick();
    else if (!t.fl.clicked) flipDeg = r.angle;
    pushCarry();
    layout(store.state);
  }, { capture: true });
  const flipUp = (e: PointerEvent): void => {
    if (!flipTouch || e.pointerId !== flipTouch.pid) return;
    e.stopImmediatePropagation();
    const t = flipTouch, now = performance.now();
    flipTouch = null;
    if (t.mode === "flip" && !t.fl.clicked) flipDeg = 0;
    carriedAt = 0;
    pushCarry();
    layout(store.state);
    // Второй палец коснулся и тут же ушёл (не двигаясь) — тап; два тапа подряд — удар картой.
    if (t.mode === "undecided" && now - t.t0 < SLAM_TAP.press && e.type === "pointerup") {
      if (now - lastSecondTap < SLAM_TAP.gap) { lastSecondTap = 0; slam(); } else lastSecondTap = now;
    }
  };
  let lastSecondTap = 0;
  renderer.domElement.addEventListener("pointerup", flipUp, { capture: true });
  renderer.domElement.addEventListener("pointercancel", flipUp, { capture: true });
  // Пробел при несомой карте — удар.
  addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.repeat || !drag?.moved || (e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) return;
    e.preventDefault();
    slam();
  });
  // F: пока держу карту — перевернуть (на компьютере).
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyF" || e.repeat || !drag?.moved || flipTouch || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) return;
    e.preventDefault();
    flipClick();
  });
  // Правая кнопка по карте — меню («Перевернуть», повернуть на 30/60/90 по часовой).
  let cardMenu: HTMLElement | null = null;
  const closeMenu = (): void => { cardMenu?.remove(); cardMenu = null; };
  const MENU_TURNS = [30, 60, 90] as const;
  function openCardMenu(x: number, y: number, id: string): void {
    closeMenu();
    const m = document.createElement("div");
    m.style.cssText = `position:fixed;z-index:60;left:${x}px;top:${y}px;background:#3a2a1d;box-shadow:0 0 0 2px #0b0704,inset 0 0 0 2px #6b4d2c;padding:4px;font:400 13px 'Tiny5',monospace`;
    const item = (label: string, run: () => void): void => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "display:block;width:100%;font:inherit;color:#f5ead0;background:transparent;border:0;padding:6px 10px;cursor:pointer;text-align:left";
      b.onclick = () => { closeMenu(); run(); };
      m.append(b);
    };
    item("Перевернуть", () => { if (cardRule(id, "turn")) deny(id, "turn"); else { feel("flip", id, 1); store.send({ t: "turn", id }); } });
    const on = store.state.felt.find((f) => f.id === id);
    if (on) for (const deg of MENU_TURNS) item(`Повернуть на ${deg}°`, () => { if (cardRule(id, "rotate")) deny(id, "rotate"); else { feel("spin", id, 1); store.send({ t: "spin", id, angle: (on.angle + deg) % 360 }); } });
    document.body.append(m);
    cardMenu = m;
  }
  // Правая кнопка по карте на столе: повёл мышью — карта вращается вокруг своего центра следом за мышью; отпустил, не двигая (клик или долгий клик), — меню.
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.button !== 2 || drag || reseat || store.replay?.on) return;
    const id = hitCard(e), f = id ? store.state.felt.find((c) => c.id === id) : undefined, c = id ? screenOf(id) : null;
    if (!id || !f || !c || !takeable(id)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* нет такого указателя */ }
    spin = { id, pid: e.pointerId, cx: c.x, cy: c.y, a0: Math.atan2(e.clientY - c.y, e.clientX - c.x) / DEG, base: f.angle, x0: e.clientX, y0: e.clientY, moved: false, angle: f.angle };
    lastSpinTick = f.angle;
  }, { capture: true });
  renderer.domElement.addEventListener("pointermove", (e) => {
    const s = spin;
    if (!s || e.pointerId !== s.pid) return;
    e.stopImmediatePropagation();
    if (!s.moved && Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < 6) return;
    if (!s.moved && cardRule(s.id, "rotate")) deny(s.id, "rotate");
    s.moved = true;
    if (cardRule(s.id, "rotate")) return;
    const turn = Math.atan2(e.clientY - s.cy, e.clientX - s.cx) / DEG - s.a0;
    s.angle = ((((s.base + turn) % 360) + 360) % 360);
    if (Math.abs((((s.angle - lastSpinTick) % 360) + 540) % 360 - 180) >= 15) { lastSpinTick = s.angle; feel("spin", s.id, 1); }
    layout(store.state); draw();
  }, { capture: true });
  const spinUp = (e: PointerEvent): void => {
    const s = spin;
    if (!s || e.pointerId !== s.pid) return;
    e.stopImmediatePropagation();
    spin = null;
    if (!s.moved) { openCardMenu(e.clientX, e.clientY, s.id); return; }
    if (!cardRule(s.id, "rotate")) store.send({ t: "spin", id: s.id, angle: Math.round(s.angle * 100) / 100 });
    layout(store.state); draw();
  };
  renderer.domElement.addEventListener("pointerup", spinUp, { capture: true });
  renderer.domElement.addEventListener("pointercancel", (e) => { if (spin && e.pointerId === spin.pid) { spin = null; layout(store.state); draw(); } }, { capture: true });
  // Системное меню по правой кнопке на карте гасим всегда; своё показываем на отпускании (мышь) или здесь (долгое касание пальцем).
  renderer.domElement.addEventListener("contextmenu", (e) => {
    if (drag?.moved) { e.preventDefault(); return; }
    const id = hitCard(e);
    if (!id || !takeable(id)) return;
    e.preventDefault();
    if ((e as PointerEvent).pointerType === "touch" || (e as PointerEvent).pointerType === "pen") openCardMenu(e.clientX, e.clientY, id);
  });
  addEventListener("pointerdown", (e) => { if (cardMenu && !cardMenu.contains(e.target as Node)) closeMenu(); }, true);
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  renderer.domElement.addEventListener("pointerup", end);
  renderer.domElement.addEventListener("pointercancel", end);
  // Палец отпустили, пока этот экран не на виду (переключились на другой): его карта ложится там, где была, а не виснет до возвращения.
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);

  /** Куда кладут: над своей рукой — в руку, на это место; у стопки — в неё; иначе — на сукно, внутри стола. */
  /**
   * ЛОЖИТСЯ КАК ЛЁГ ПАЛЕЦ: быстро тянул и бросил — карта летит дальше по лучу камеры и ложится там, где луч встречает стол; палец стоит (или слегка дрожит) —
   * карта падает вертикально, ровно под собой. Между — плавно по скорости пальца за последние `THROW.window` мс.
   */
  // ——— ОЩУЩЕНИЕ: звук и вибрация на каждое движение карты (`feel.ts`); сцена только сообщает, что случилось и с какой силой ———
  let feelFn: ((e: FeelEvent) => void) | null = null;
  function feel(kind: FeelKind, id: string | null, energy = 1): void {
    if (!feelFn) return;
    const c = id ? screenOf(id) : null, r = renderer.domElement.getBoundingClientRect();
    feelFn({ kind, energy, x: c ? ((c.x - r.left) / r.width - 0.5) * 2 : 0, z: c ? ((c.y - r.top) / r.height - 0.5) * 2 : 0 });
  }
  let lastCarryFeel = 0, lastRotTick = 0, lastSpinTick = 0;
  // ——— УДАР КАРТОЙ ОБ СТОЛ: несомая карта падает вниз сразу, жёстко, и камера вздрагивает от удара ———
  // Мышь: левой держишь карту, правую кнопку нажать — удар; или пробел. Телефон: первый палец держит, вторым — двойной тап.
  /** Двойной тап вторым пальцем: касание не дольше `press`, второе не позже `gap` после первого (мс). */
  const SLAM_TAP = { press: 300, gap: 450 };
  const SHAKE = { ms: 380, pos: 0.16, roll: 0.9 };
  let shake: { t0: number; amp: number } | null = null, shakes = 0;
  const slamming = new Map<string, number>();
  let slamForce = false;
  function shakeCamera(amp = 1): void {
    shake = { t0: performance.now(), amp };
    shakes++;
  }
  /** Смещение камеры от тряски в этот миг: затухает к концу, складывается из нескольких несоизмеримых частот — не качание, а удар. */
  function shakeNow(now: number): { x: number; y: number; roll: number } | null {
    if (!shake) return null;
    const age = now - shake.t0;
    if (age >= SHAKE.ms) { shake = null; return null; }
    const k = (1 - age / SHAKE.ms) ** 2 * shake.amp;
    return {
      x: (Math.sin(age * 0.19) + 0.6 * Math.sin(age * 0.43 + 1)) * SHAKE.pos * k,
      y: (Math.sin(age * 0.23 + 2) + 0.6 * Math.sin(age * 0.37)) * SHAKE.pos * k,
      roll: (Math.sin(age * 0.29 + 3) + 0.5 * Math.sin(age * 0.51)) * SHAKE.roll * DEG * k,
    };
  }
  /** Удар: отпустить несомую карту сейчас же, строго вниз под собой; как только она упала на стол — тряска. */
  function slam(): void {
    if (!drag?.moved || dragPid === null) return;
    const d = drag;
    slamForce = true;
    try { end({ pointerId: dragPid, clientX: lastFinger.x, clientY: lastFinger.y, type: "pointerup" } as PointerEvent); } finally { slamForce = false; }
    slamming.set(d.id, performance.now() + 800);
    feel("slam", d.id, 1);
  }
  /** Каждый кадр: упавшая после удара карта — тряска камеры; не упала за 0,8 с — отбой без тряски. */
  function placeSlams(now: number): boolean {
    for (const [id, until] of [...slamming]) {
      const o = cards.get(id);
      if (!o || now > until) { slamming.delete(id); continue; }
      if (o.group.position.y - o.target.pos.y < 0.08) { slamming.delete(id); shakeCamera(); }
    }
    return slamming.size > 0 || shake !== null;
  }
  /** Вращение рукой: градусов на пиксель движения (мышь с Ctrl/Cmd, второй палец по вертикали, правая кнопка — по углу, там не нужно). */
  const SPIN = { perPx: 0.45, dead: 10 };
  let ptrX = 0, prevButtons = 0;
  const THROW = { window: 120, still: 100, full: 600, settle: 40 };
  let trail: { x: number; y: number; t: number }[] = [];
  let lastThrow = 0;
  const throwWeight = (now = performance.now()): number => {
    trail = trail.filter((s) => now - s.t <= THROW.window);
    const a = trail[0], b = trail.at(-1);
    if (!a || !b || a === b) return 0;
    // События пачкой в одну миллисекунду — не бесконечная скорость: короче 16 мс (кадр) не считаем.
    const speed = (Math.hypot(b.x - a.x, b.y - a.y) / Math.max(16, b.t - a.t)) * 1000;
    return Math.max(0, Math.min(1, (speed - THROW.still) / (THROW.full - THROW.still)));
  };
  function target(e: { clientX: number; clientY: number }, d: { id: string; up: boolean; angle: number; moved?: boolean; x?: number; y?: number }): Where {
    const a = aim(e.clientX, e.clientY, undefined, d.id);
    if (a.in !== "felt") return a;
    // Нельзя перемещать: куда бы ни отпустил — карта вернётся на своё место.
    const home = cardRule(d.id, "move") ? store.state.felt.find((f) => f.id === d.id) : undefined;
    if (home) return { in: "felt", x: home.x, y: home.y, up: d.up, angle: cardRule(d.id, "rotate") ? home.angle : d.angle };
    let at = { x: a.x, y: a.y };
    if (d.moved) {
      const under = heldAt(e.clientX, e.clientY, d.angle, d.up), w = slamForce ? 0 : throwWeight((e as { timeStamp?: number }).timeStamp);
      lastThrow = w;
      if (under) at = { x: under.pos.x + (a.x - under.pos.x) * w, y: under.pos.z + (a.y - under.pos.z) * w };
      // Взял и почти не сдвинул (поднял и опустил): карта поднималась по лучу и сместилась к камере — ложится не под собой, а на своё место; чем дальше палец от места взятия, тем больше «под собой».
      const start = d.x !== undefined && d.y !== undefined ? store.state.felt.find((f) => f.id === d.id) : undefined;
      if (start) {
        const k = slamForce ? 1 : Math.max(0, Math.min(1, Math.hypot(e.clientX - d.x!, e.clientY - d.y!) / THROW.settle));
        at = { x: start.x + (at.x - start.x) * k, y: start.y + (at.y - start.y) * k };
      }
    }
    const far = Math.hypot(at.x, at.y);
    if (far > FELT_REACH) at = { x: (at.x / far) * FELT_REACH, y: (at.y / far) * FELT_REACH };
    const ringPile = store.state.piles.find((p) => p.pose === "ring" && Math.hypot(p.x - at.x, p.y - at.y) < RING_CATCH);
    if (ringPile) return { in: "deck", pile: ringPile.id, turn: ((Math.atan2(at.x - ringPile.x, -(at.y - ringPile.y)) / DEG) + 360) % 360 };
    return { in: "felt", x: at.x, y: at.y, up: d.up, angle: d.angle };
  }
  /** Верх моей руки на экране: над самой высокой её картой (пустая — над левой рукой тела) — отсюда и ниже карту кладут в руку. */
  const handTop = (chair: Chair, skipCard?: string): number => {
    const rr = renderer.domElement.getBoundingClientRect();
    if (handCarry) return handCarry.zoneTop - rr.top;
    // Граница приёмки в руку — верх чаши: палец внутри неё — карта встаёт в руку, а не только горит контур.
    if (camMode === "head") { const rim = bowlRimPx(skipCard); if (rim !== null) return rim; }
    const r = rr, ys = chair.hand.filter((c) => c.id !== skipCard).map((c) => screenOf(c.id)?.y).filter((y): y is number => y !== undefined);
    // Пустая рука: зона низкая — не выше одной карты над нижней строкой (а не где-то у середины экрана, как выходило из точки кисти на широком экране).
    if (!ys.length) {
      const shape = shapeOfWidth(handWidth, 1, 0, 0);
      shape.lift = 1;
      const box = handCardBox(1, shape, Math.tan((baseFov * DEG) / 2) / Math.tan((CAMHAND.refFov * DEG) / 2), 0, 0);
      return trayTopPx() - Math.abs(box.bottom - box.top);
    }
    return Math.min(Math.min(...ys) - r.top - 55, r.height * 0.8);
  };
  function aim(x: number, y: number, skipPile?: string, skipCard?: string): { in: "hand"; chair: string; i: number } | { in: "deck"; pile: string; i?: number } | { in: "felt"; x: number; y: number } {
    const e = { clientX: x, clientY: y };
    const z = zoneFn?.(x, y);
    if (z) return z.where;
    const chair = myChair();
    const r = renderer.domElement.getBoundingClientRect();
    // Над своей рукой — от верха её карт, как они нарисованы в мире, и ниже.
    // Рука, что не принимает карты, их и не ловит: карта над ней остаётся на столе (а не улетает в щель руки и не возвращается).
    if (chair && !chair.reject && e.clientY - r.top > handTop(chair, skipCard)) {
      const others = chair.hand.filter((c) => c.id !== skipCard);
      const xs = others.map((c) => screenOf(c.id)?.x ?? 0);
      return { in: "hand", chair: chair.id, i: xs.filter((q) => q < e.clientX).length };
    }
    const at = onFelt(e) ?? new THREE.Vector3();
    // В зону бесхозного стула — в его руку (в конец стопки); занятый стул зону не принимает.
    for (const c of store.state.chairs) {
      if (c.id === chair?.id || !handTakes(c)) continue;
      const zc = zoneCentre(c.angle);
      if (Math.hypot(at.x - zc.x, at.z - zc.y) < ZONE.r) return { in: "hand", chair: c.id, i: c.hand.length };
    }
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
    const ch = myChair(), yaw = ch ? myHeadNow(ch).sent : 0, pitchOut = camMode === "head" ? { pitch: Math.round(rig.pitch * 10) / 10, gaze: Math.round(rig.yaw * 10) / 10, curl: Math.round(handCurl * 100) / 100, handY: Math.round(heightPx * pxUnit() * 1000) / 1000 } : {};
    const eye = ch && camMode === "top" ? (() => { const h = myHeadNow(ch).head; return { x: h.x, y: h.y, h: h.h }; })() : { x: camera.position.x, y: camera.position.z, h: Math.max(0, eyeY()) };
    lastBody = { stance: stanceNow(), model: "seat", eye, seat: Math.round(seatPull * 100) / 100, stretch: camMode === "head" || camMode === "top" ? Math.max(0, rig.lean) : 0, yaw, ...pitchOut, right: drag?.moved ? rightAt : restRight };
    store.body({ stance: stanceNow(), model: "seat", eye, seat: Math.round(seatPull * 100) / 100, stretch: camMode === "head" || camMode === "top" ? Math.max(0, rig.lean) : 0, yaw, ...pitchOut, right: drag?.moved ? rightAt : restRight });
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
    /** Раскладка моей руки сейчас: ширина 0…1, сжатость, веер ↔ ряд, комната. */
    handShape: () => { const ch = myChair(); return ch ? { f: widthLive ?? handWidth, ...shapeOfWidth(widthLive ?? handWidth, ch.hand.length, Math.max(0, Math.min(1, heightPx / WIDTH.rise)), widthOver) } : null; },
    fanFitsN,
    /** Ширина карты в мире: сколько единиц стола она занимает (рука — в осях камеры, стол — свой размер). */
    setHandWidthNow: (raw: number) => { widthLive = Math.max(0, Math.min(WIDTH.max, raw)); widthOver = 0; layout(store.state); },
    cardOrder: (id: string) => { const o = cards.get(id); return o ? { order: o.front.renderOrder, write: (o.front.material as THREE.Material).depthWrite } : null; },
    handHeightNow: () => heightPx,
    gripXNow: () => gripSx,
    gripAmtNow: () => gripAmt,
    gripPressNow: (sx: number) => { gripDrag = true; gripRelAt = 0; gripSx = sx; layout(store.state); draw(); },
    gripReleaseNow: () => { if (!gripDrag) return; gripDrag = false; gripRelAt = performance.now(); gripRelX = gripSx ?? gripRelX; gripAmt0 = gripAmt; draw(); },
    peekReturnMsNow: (ms: number) => { peekReturnMs = ms; },
    carryPileNow: (pile: string, at: { x: number; y: number } | null) => api.carryPile(pile, at),
    pileOverNow: () => (pileOver ? { ...pileOver, ids: [...pileOverIds.keys()] } : null),
    peekShiftFor: (xs: number[], f: number | null) => peekShift(xs, f),
    setHandHeightNow: (px: number) => { heightPx = Math.max(HEIGHT.min, Math.min(HEIGHT.max, px)); layout(store.state); sendBody(true); draw(); },
    cardNormalY: (id: string) => { const o = cards.get(id); return o ? new THREE.Vector3(0, 0, 1).applyQuaternion(o.group.getWorldQuaternion(new THREE.Quaternion())).y : null; },
    setHandSizeNow: (k: number) => api.setHandSize(k),
    setBaseFovNow: (deg: number) => {
      baseFov = Math.max(CAM.fov.view.min, Math.min(CAM.fov.view.max, deg));
      camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      if (camMode === "head") { rig.fov = baseFov; applyRig(); }
      layout(store.state); draw();
    },
    curlFor: (n: number) => mineCurlK(n),
    trimHand: (n: number) => { const ch = myChair(); if (!ch) return; ch.hand.slice(n).forEach((c, k) => { store.send({ t: "grab", id: c.id }); store.send({ t: "drop", id: c.id, to: { in: "felt", x: -2 + k * 0.6, y: 1.5, up: false, angle: 0 } }); }); },
    fillHand: (n: number) => { const ch = myChair(); if (!ch) return; const deck = store.state.piles[0]; for (const c of deck.cards.slice(-n)) { store.send({ t: "grab", id: c.id }); store.send({ t: "drop", id: c.id, to: { in: "hand", chair: ch.id, i: ch.hand.length } }); } },
    cardAt: (x: number, y: number) => hitCard({ clientX: x, clientY: y } as PointerEvent),
    dropFeltAt: (id: string, x: number, y: number) => { store.send({ t: "grab", id }); store.send({ t: "drop", id, to: { in: "felt", x, y, angle: 0, up: false } }); },
    tabInfo: (pile: string) => { const t = tabs.get(pile); return t ? { y: t.mesh.position.y, x: t.mesh.position.x, z: t.mesh.position.z, screen: project(t.mesh.position.clone()) } : null; },
    shadeCount: () => [...cards.values()].filter((o) => o.shades.every((m) => m.receiveShadow && m.material instanceof THREE.ShadowMaterial)).length,
    cardBend: (id: string) => (cards.get(id)?.group.userData.bend as number | undefined) ?? 0,
    handCurl: () => handCurl,
    setHandCurl: (c: number) => { handCurl = Math.max(0, Math.min(1, c)); layout(store.state); sendBody(); },
    depthOf: (id: string) => { const o = cards.get(id); if (!o) return null; camera.updateMatrixWorld(); return -o.group.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse).z; },
    cardWidth: (id: string) => { const o = cards.get(id); return o ? o.group.getWorldScale(new THREE.Vector3()).x * CARD_W : null; },
    /** Для снимков фона дизайна: спрятать мои карты (чужие и стол остаются). */
    hideMine: (on: boolean) => { const ch = myChair(); for (const c of ch?.hand ?? []) { const o = cards.get(c.id); if (o) o.group.visible = !on; } draw(); },
    zoomBy: (k: number) => zoomBy(k),
    setPileSnap: (on: boolean) => { pileSnap = on; },
    fovDeg: () => camera.fov,
    cardMinY: (id: string) => { const o = cards.get(id); if (!o) return null; o.group.updateMatrixWorld(true); let m = Infinity; for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) m = Math.min(m, o.group.localToWorld(new THREE.Vector3(x * CARD_W / 2, y * CARD_H / 2, 0)).y); return m; },
    haloInfo: (id: string) => { const o = cards.get(id); return o ? { on: o.halo.visible, color: (o.halo.material as THREE.MeshBasicMaterial).color.getHexString() } : null; },
    flipInfo: () => ({ deg: flipDeg, up: drag?.moved ? drag.up : null, second: !!flipTouch }),
    setPileGlow: (pile: string | null, level: "hint" | "hot" = "hint") => { const was = glowFor; glowFor = pile ? { pile, level } : null; if (was?.pile !== glowFor?.pile || was?.level !== glowFor?.level) draw(); },
    setBareTable: (on: boolean) => { bareTable = on; },
    setCamLocked: (on: boolean) => { camLocked = on; },
    floatCard: (id: string, pile: string | null, dx = 0, dy = 0, lift = 0, da = 0, up = true) => { if (pile) floats.set(id, { pile, dx, dy, lift, da, up, phase: floats.get(id)?.phase ?? Math.random() * 6 }); else floats.delete(id); layout(store.state); },
    seatNow: () => seatPull,
    dollParts: () => { const b = heads.children[0]?.children.find((c) => c.userData.base)?.userData as { base?: THREE.Vector3 } | undefined; const ch = [...chairObjs.values()][0]; return { headY: b?.base?.y ?? null, chairScale: ch?.group.scale.x ?? null }; },
    pickAtNow: (x: number, y: number) => api.pickAt(x, y),
    dollScaleNow: () => dollK,
    bodyInfo: (pile: string) => { const m = bodies.get(pile); if (!m) return null; const base = cards.get(store.state.piles.find((p) => p.id === pile)?.cards[0]?.id ?? ""); const up = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion); return { n: m.userData.layers as number, axis: up.toArray(), at: m.position.toArray(), base: base?.group.getWorldPosition(new THREE.Vector3()).toArray() ?? null, normal: base ? new THREE.Vector3(0, 0, 1).applyQuaternion(base.group.getWorldQuaternion(new THREE.Quaternion())).toArray() : null }; },
    setCamMode: (m: CamMode) => setCamMode(m),
    myShoulders: () => ({ body: (myBody.userData.shoulder as THREE.Vector3 | undefined)?.toArray() ?? null, arm: (myArm.userData.shoulder as THREE.Vector3 | undefined)?.toArray() ?? null }),
    leftHandOf: (chair: string) => { for (const b of heads.children) if (b.userData.chair === chair && b.userData.left) return (b.userData.left as THREE.Vector3).toArray(); return null; },
    zoneInfo: () => store.state.chairs.filter((c) => !c.croupier).map((c) => ({ id: c.id, owner: c.owner, zone: zones.get(c.id)?.fill.visible ?? false, chair: chairObjs.get(c.id)?.group.visible ?? null, centre: zoneCentre(c.angle), hand: c.hand.map((h) => h.id) })),
    heldAngle: () => (drag?.moved ? drag.angle : null),
    draggingId: () => (drag?.moved ? drag.id : null),
    reseatNow: (angle: number) => { store.send({ t: "reseat", angle }); },
    gyroOffNow: () => gyroOff,
    carryTo: (id: string, chair: string, i: number) => { if (!store.state.locks[id]) store.send({ t: "grab", id }); store.carry({ id, over: { in: "hand", chair, i } }); },
    cardOnHud: (id: string) => { const o = cards.get(id); return o ? { onCamera: !!o.target.onCamera, x: o.target.pos.x } : null; },
    stackMode: () => stackMode,
    turnCard: (id: string) => { store.send({ t: "turn", id }); },
    gatherNow: () => (gather ? { n: gather.ids.length, fast: gather.fast } : null),
    wideK: () => wideK(),
    pileBodyAxis: (pile: string) => { const m = bodies.get(pile), p = store.state.piles.find((x) => x.id === pile); if (!m || !p) return null; const b = cards.get(p.cards[0]!.id), t = cards.get(p.cards.at(-1)!.id); if (!b || !t) return null; const d = t.group.getWorldPosition(new THREE.Vector3()).sub(b.group.getWorldPosition(new THREE.Vector3())).normalize(), z = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion); return { dot: d.dot(z), z: z.toArray().map((v) => Math.round(v * 100) / 100) }; },
    headFronts: () => heads.children.flatMap((b) => b.children.filter((c) => c.userData.base).map((c) => ({ by: b.userData.by as string, moved: c.position.distanceTo(c.userData.base as THREE.Vector3), scale: c.scale.x }))),
    handDropZone: () => api.handDropZone(),
    bowlInfo: () => ({ ...bowlNow }),
    handShift: () => api.handShiftPx(),
    setLook: (pitch: number) => { rig.pitch = pitch; applyRig(); draw(); },
    handCardPx: () => { const shape = shapeOfWidth(handWidth, 1, 0, 0); shape.lift = 1; const b = handCardBox(1, shape, Math.tan((baseFov * DEG) / 2) / Math.tan((CAMHAND.refFov * DEG) / 2), 0, 0); return Math.abs(b.bottom - b.top); },
    eyeNow: () => eyeY(),
    setViewHeight: (t: number) => setViewHNorm(t),
    chairAt: (id: string) => chairObjs.get(id)?.group.position.toArray() ?? null,
    reseatInfo: () => ({ on: reseat !== null, heads: heads.visible, chairs: chairRoot.visible, handShown: store.state.chairs.flatMap((c) => c.hand).filter((c) => cards.get(c.id)?.group.visible).length, felt: store.state.felt.filter((c) => cards.get(c.id)?.group.visible).length, ghost: reseatGhost ? { x: reseatGhost.position.x, z: reseatGhost.position.z } : null, chair: (() => { const o = chairObjs.get(myChair()?.id ?? ""); return o ? { color: o.mats[0]!.color.getHexString(), emissive: o.mats[0]!.emissive.getHexString(), halo: (o.halo.material as THREE.MeshBasicMaterial).color.getHexString() } : null; })(), tags: [...chairObjs.entries()].filter(([, o]) => o.tag).map(([id]) => id), glow: [...chairObjs.entries()].filter(([, o]) => o.halo.visible).map(([id]) => id) }),
    feltScreen: (x: number, y: number) => project(new THREE.Vector3(x, 0, y)),
    ringLit: () => [...ringFields.entries()].map(([id, f]) => ({ id, zone: f.zone.visible, glow: f.glow.visible, slot: f.slot.visible })),
    cardQuat: (id: string) => { const o = cards.get(id); return o ? new THREE.Euler().setFromQuaternion(o.target.quat, "ZXY").toArray().slice(0, 3).map((v) => Math.round(((v as number) * 180) / Math.PI * 10) / 10) : null; },
    dropShadow: (id: string) => { const d = dropShadows.get(id); if (!d || !d.mesh.visible) return { on: false }; const a = d.pos; return { on: true, x: (a.getX(0) + a.getX(1) + a.getX(2) + a.getX(3)) / 4, z: (a.getZ(0) + a.getZ(1) + a.getZ(2) + a.getZ(3)) / 4 }; },
    ruleInfo: (id: string) => ({ shaking: denies.has(id), ring: cards.get(id)?.ring.visible === true, home: homeMark.visible, lift: cardRule(id, "lift"), move: cardRule(id, "move"), turn: cardRule(id, "turn"), notice: { lift: cardNotice(id, "lift"), move: cardNotice(id, "move"), turn: cardNotice(id, "turn"), rotate: cardNotice(id, "rotate") }, rotate: cardRule(id, "rotate") }),
    shakeInfo: () => ({ active: shake !== null && performance.now() - shake.t0 < SHAKE.ms, count: shakes, slamming: slamming.size }),
    setThrow: (o: Partial<typeof THROW>) => { Object.assign(THROW, o); },
    setNeckFree: (on: boolean) => { neckFree = on; },
    panInfo: () => ({ x: rig.panX, z: rig.panZ }),
    lookBy: (dyaw: number, dpitch: number) => lookBy(dyaw, dpitch),
    cardTopOnScreen: (id: string) => { const o = cards.get(id); if (!o) return null; o.group.updateMatrixWorld(true); const a = project(o.group.localToWorld(new THREE.Vector3(0, 0, 0))), b = project(o.group.localToWorld(new THREE.Vector3(0, CARD_H / 2, 0))); return { dx: b.x - a.x, dy: b.y - a.y }; },
    cardTilt: (id: string) => { const o = cards.get(id); if (!o) return null; const n = new THREE.Vector3(0, 0, 1).applyQuaternion(o.target.quat), eye = camera.position.clone().sub(o.target.pos).normalize(), s = Math.sign(n.dot(eye)) || 1; return { roll: Math.asin(Math.min(1, Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(o.target.quat).y))) / DEG, fromUp: Math.acos(Math.min(1, Math.abs(n.y))) / DEG, towardEye: Math.acos(Math.min(1, Math.abs(n.dot(eye)))) / DEG, minY: (() => { let m = Infinity; for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) m = Math.min(m, new THREE.Vector3(x * CARD_W / 2, y * CARD_H / 2, 0).applyQuaternion(o.target.quat).y + o.target.pos.y); return m; })(), s }; },
    cardTarget: (id: string) => { const o = cards.get(id); return o ? o.target.pos.toArray() : null; },
    neckNow: () => ({ ...neck }),
    seatBy: (d: number) => seatBy(d),
    lifted: () => liftedId,
    handWidthNow: () => widthLive ?? handWidth,
    dragNow: () => (drag ? { moved: drag.moved, gap: drag.gap, where: drag.where, fingerHand: drag.fingerHand } : null),
    handLevel: () => handLevel,
    setHandLevel: (h: number) => setHandLevel(h),
    handTopPx: () => api.handTopPx(),
    headToward: (x: number, y: number) => headToward(x, y),
    feltAt: (cx: number, cy: number) => { const r = renderer.domElement.getBoundingClientRect(), v = onFelt({ clientX: cx, clientY: cy }); return v ? { x: v.x, y: v.z } : null; },
    sideBy: (d: number) => sideBy(d),
    cam: () => ({ mode: camMode, yaw: rig.yaw, pitch: rig.pitch, lean: rig.lean, side: rig.side, fov: camera.fov, pos: camera.position.toArray(), neck: { ...neck } }),
    view: () => { const p = camera.position.clone().sub(orbit.target); return { yaw: Math.atan2(p.x, p.z) / DEG, pitch: Math.asin(p.y / p.length()) / DEG }; },
  };
  // Хук проверок — у последнего смонтированного экрана; когда экранов два, тот, что сейчас перед глазами, выставляет его сам (`test`).
  (window as unknown as { __t3d: unknown }).__t3d = test;
  const project = (v: THREE.Vector3) => { const p = v.clone().project(camera), r = renderer.domElement.getBoundingClientRect(); return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }; };
  const api: SceneApi = {
    test,
    probe: { draggingId: test.draggingId, screenOf: test.screenOf, cardWidth: test.cardWidth, depthOf: test.depthOf, fovDeg: test.fovDeg, heldAngle: test.heldAngle, floatCard: test.floatCard, setPileSnap: test.setPileSnap, setPileGlow: test.setPileGlow },
    home: () => { home(); draw(); sendBody(true); },
    camMode: () => camMode,
    baseFov: () => baseFov,
    viewHeight: () => { const r = viewHRange(); return (viewH - r.min) / (r.max - r.min); },
    setViewHeight: (t: number) => setViewHNorm(t),
    dollScale: () => dollK,
    setDollScale: (k: number) => setDollScale(k),
    viewHeightUnits: () => viewH,
    seat: () => (seatPull - SEAT_PULL.min) / (SEAT_PULL.max - SEAT_PULL.min),
    setSeat: (t: number) => setSeatPull(SEAT_PULL.min + Math.max(0, Math.min(1, t)) * (SEAT_PULL.max - SEAT_PULL.min)),
    reseatOn: () => reseat !== null,
    replay(on) {
      if (on) {
        if (reseat) setReseat(false);
        setStackMode(false);
        replayWas = camMode;
        liftedId = null;
        setCamMode("top");
      } else if (replayWas) {
        const was = replayWas;
        replayWas = null;
        setCamMode(was);
      }
      layout(store.state); draw();
    },
    setReseat,
    reseatDone,
    handSize: () => handSize,
    setHandSize(k) { handSize = Math.max(HAND_SIZE.min, Math.min(HAND_SIZE.max, k)); layout(store.state); draw(); },
    setBaseFov(deg) {
      baseFov = Math.max(CAM.fov.view.min, Math.min(CAM.fov.view.max, deg));
      camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      if (camMode === "head") { rig.fov = baseFov; applyRig(); }
      layout(store.state); draw();
    },
    setCamMode,
    gyro: { toggle: gyroToggle, on: () => gyro.on(), info: () => gyro.info() },
    lookBy,
    zoomBy,
    seatBy,
    neckViz: (kind) => viz[kind],
    setNeckViz: (kind, on) => { viz[kind] = on; neckViz(0); },
    sideBy,
    handFrame,
    carryingHand: () => !!handCarry,
    orbitZoom: () => { const d = camera.position.distanceTo(orbit.target); return Math.max(0, Math.min(1, (orbit.maxDistance - d) / (orbit.maxDistance - orbit.minDistance))); },
    setOrbitZoom: (t: number) => {
      if (camMode !== "orbit") return;
      const d = orbit.maxDistance - Math.max(0, Math.min(1, t)) * (orbit.maxDistance - orbit.minDistance), dir = camera.position.clone().sub(orbit.target).normalize();
      camera.position.copy(orbit.target).addScaledVector(dir, d); orbit.update(); draw();
    },
    handLevel: () => { if (!levelOn) levelFromPose(); return handLevel; },
    setHandLevel,
    handPoseAt: levelPose,
    poseLevels: POSE_LEVEL,
    handTopPx: () => {
      const ch = myChair();
      if (!ch || !ch.hand.length || levelPose(handLevel) === "tuck" || handCarry) return null;
      let y0 = Infinity;
      for (const c of ch.hand) {
        const o = cards.get(c.id);
        if (!o || (drag?.moved && drag.id === c.id) || c.id === liftedId) continue;
        o.group.updateMatrixWorld(true);
        for (const [sx, sy] of [[-1, 1], [1, 1]] as const) y0 = Math.min(y0, project(o.group.localToWorld(new THREE.Vector3(sx * (CARD_W / 2), sy * (CARD_H / 2), 0))).y);
      }
      return Number.isFinite(y0) ? y0 - renderer.domElement.getBoundingClientRect().top : null;
    },
    setDock: (top: number, extra: number) => { if (top === dockTopPx && extra === dockExtraPx) return; dockTopPx = top; dockExtraPx = extra; layout(store.state); draw(); },
    fanFits: () => fanFitsNow(),
    handHeight: () => heightPx,
    gripX: () => gripSx,
    gripAmount: () => gripAmt,
    gripBegin() { gripDrag = true; gripRelAt = 0; draw(); },
    gripMove(sx) { gripSx = sx; layout(store.state); draw(); },
    gripEnd() { if (!gripDrag) return; gripDrag = false; gripRelAt = performance.now(); gripRelX = gripSx ?? gripRelX; gripAmt0 = gripAmt; draw(); },
    setHandHeight(px) { heightPx = Math.max(HEIGHT.min, Math.min(HEIGHT.max, px)); layout(store.state); sendBody(); draw(); },
    handWidth: () => handWidth,
    handCurl: () => handCurl,
    setHandCurl(c) { handCurl = Math.max(0, Math.min(1, c)); layout(store.state); sendBody(); },
    stackScreen() {
      const ch = myChair();
      if (!ch || camMode === "orbit" || !ch.hand.length || tuckOf(mineBlend(ch)) < 0.95) return null;
      const rest = ch.hand.filter((c) => !(drag?.moved && drag.id === c.id));
      const top = rest.length ? cards.get(rest[rest.length - 1]!.id) : undefined;
      if (!top) return null;
      top.group.updateMatrixWorld(true);
      camera.updateMatrixWorld();
      const r = renderer.domElement.getBoundingClientRect();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const w = top.group.localToWorld(new THREE.Vector3(sx * CARD_W / 2, sy * CARD_H / 2, 0));
        if (w.clone().applyMatrix4(camera.matrixWorldInverse).z > -0.1) return null;
        const p = project(w);
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
    setHandWidth(raw) {
      if (raw === null) { commitWidth(); return; }
      widthLive = Math.max(0, Math.min(WIDTH.max, raw)); widthOver = 0;
      layout(store.state);
    },
    carryHand(screen, lines) {
      const ch = myChair();
      if (!ch) return false;
      if (screen) {
        // Вернул палец на худ руки, не отпуская, — стопка возвращается в руку (и можно снова вытянуть вверх). Вход и выход с запасом
        // (вход — заметно выше худа, выход — ниже его верха): на границе стопка не дрожит туда-сюда.
        const was = handCarry as { zoneTop: number } | null;
        if (lines) {
          if (was && screen.y > lines.exit) { handCarry = null; layout(store.state); return false; }
          if (!was && screen.y > lines.enter) return false;
        } else {
          const fr0 = handFrame(), zoneTop0 = was?.zoneTop ?? (fr0 ? fr0.y - 10 : renderer.domElement.getBoundingClientRect().height * 0.7);
          if (was && screen.y > zoneTop0 + 20) { handCarry = null; layout(store.state); return false; }
          if (!was && screen.y > zoneTop0 - 60) return false;
        }
        ray.setFromCamera(ndc({ clientX: screen.x, clientY: screen.y }), camera);
        const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -CARRY_H), new THREE.Vector3());
        if (!hit) return !!was;
        const fr = handFrame();
        // Стопка в руке не уходит за стол: дальше края сукна она скользит вдоль него.
        const reach = Math.hypot(hit.x, hit.z), edge = TABLE_RADIUS - 0.7, kEdge = reach > edge ? edge / reach : 1;
        handCarry = { x: hit.x * kEdge, y: hit.z * kEdge, sx: screen.x, sy: screen.y, zoneTop: was?.zoneTop ?? lines?.enter ?? (fr ? fr.y - 10 : renderer.domElement.getBoundingClientRect().height * 0.7) };
        layout(store.state);
        return true;
      }
      const c = handCarry as { sx: number; sy: number } | null;
      if (!c) return false;
      const where = aim(c.sx, c.sy);
      handCarry = null;
      const ids = ch.hand.map((x) => x.id);
      if (where.in === "deck") store.send({ t: "gather", ids, side: "keep", to: { pile: where.pile } });
      else if (where.in === "felt") store.send({ t: "gather", ids, side: "keep", to: { x: where.x, y: where.y, angle: ((-ch.angle % 360) + 360) % 360 } });
      layout(store.state);
      return false;
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
    safeBottom,
    bowlRim() {
      if (!bowlNow.visible) return null;
      return { y: ((1 - bowlNow.ringTop) * renderer.domElement.getBoundingClientRect().height) / 2, lit: bowlNow.lit };
    },
    handShiftPx() {
      if (!handCeilRot) return 0;
      const rect = renderer.domElement.getBoundingClientRect(), p0 = new THREE.Vector3(0, CAMHAND.at.y, CAMHAND.at.z), p1 = p0.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), handCeilRot);
      const y = (v: THREE.Vector3) => ((1 - v.clone().applyMatrix4(camera.projectionMatrix).y) * rect.height) / 2;
      return Math.max(0, y(p1) - y(p0));
    },
    handDropZone() {
      // Зона руки нужна всему, что можно в неё положить: одной карте и стопке целиком. Что нельзя (запертая или приколотая стопка, рука «не принимает») — не намечается.
      const ch = myChair();
      if (!ch || camMode !== "head" || ch.reject) return null;
      const bottom = dockTopPx ?? host.clientHeight - safeBottom() - 80;
      const h = held();
      if (!h || !h.takeable) return null;
      return { top: handTop(ch, h.skip), bottom, over: h.gap !== null };
    },
    handGeom,
    setBlend(b) { blend = b; layout(store.state); },
    stance: stanceNow,
    setStance(st) { stance = st; viewHManual = false; home(); sendBody(true); draw(); },
    setFigures(on) { figuresOn = on; reseatSync(); draw(); },
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
      // Язычок стопки бесхозного стула — тап по нему тоже стул.
      const tabHit = hitTab(e);
      if (tabHit && tabHit.startsWith("chair:")) return { t: "chair", id: tabHit.slice(6) };
      const id = hitCard(e);
      // Карта в стопке бесхозного стула — тап открывает окно стула (в зону не надо целиться), а не карту.
      const inHand = id ? fromOf.get(id) : undefined;
      if (id && inHand && inHand.in === "hand" && !store.state.chairs.find((c) => c.id === inHand.chair)?.owner && !inHand.mine) return { t: "chair", id: inHand.chair };
      if (id) return { t: "card", id };
      // Пустой стул не нарисован — на него попадает только его зона (хозяйский стул — сам стул).
      const shown = (o: THREE.Object3D | null): boolean => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      const seat = chairRoot.visible ? ray.intersectObject(chairRoot, true).find((h) => h.object.userData.chair && shown(h.object)) : undefined;
      return seat ? { t: "chair", id: seat.object.userData.chair as string } : null;
    },
    pileSpots,
    setStackMode(on) { setStackMode(on); },
    stackMode: () => stackMode,
    stackPicked: () => myTablePicks().length,
    onTab(fn) { tabFn = fn; },
    setTabLit(piles) { litTabs = piles; },
    feltAt: (x, y) => { const at = onFelt({ clientX: x, clientY: y }); return at ? { x: at.x, y: at.z } : null; },
    feltToScreen(x, y) { const q = project(new THREE.Vector3(x, 0, y)), r = renderer.domElement.getBoundingClientRect(); return { x: q.x - r.left, y: q.y - r.top }; },
    onGrab(fn) { grabFn = fn; },
    onFeel(fn) { feelFn = fn; },
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
      const a = screen && p ? aim(screen.x, screen.y, pile) : null;
      pileOver = a && a.in === "hand" && a.chair === myChair()?.id && camMode === "head" && p && p.cards.length > 0 ? { pile, gap: a.i } : null;
      pileOverIds.clear();
      if (pileOver && p) p.cards.forEach((c, j) => pileOverIds.set(c.id, j));
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
        placePanel(one);
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
  camera.fov = camMode === "orbit" ? 50 : camMode === "top" ? TOP.fov : baseFov;
  camera.updateProjectionMatrix();
  home();
  sendBody(true);
  layout(store.state);
  handZone = () => api.handDropZone();
  return api;
}
