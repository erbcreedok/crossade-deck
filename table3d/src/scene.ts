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
import type { Chair, Pile, SeenCard, Snapshot, Where } from "../../server/src/table/contract.js";
import { awayOf, BODY_EVERY_MS, gazeOf, HEAD, headOf, leftHandOf, NECK, restHead, shoulders3, type Body, type Point3 } from "../../server/src/table/bodies.js";
import { ringTurned, seatPoint, SEAT_RADIUS, TABLE_RADIUS } from "../../server/src/table/ring.js";
import { artUrl, readLook, type DeckLook } from "../../server/table-client/deckArt.js";
import { mineGeomOf, type PoseBlend } from "../../server/table-client/handGeom.js";
import type { Geom } from "../../server/table-client/screenConst.js";
import type { TableStore } from "../../server/table-client/store.js";

const DEG = Math.PI / 180;
const R = TABLE_RADIUS, RIM = 0.45, THICK = 0.6;
const CARD_W = 1, CARD_H = 1.4;
/** Каждую карту стопки — чуть выше предыдущей; каждую карту сукна — выше лёгшей раньше. */
const PILE_STEP = 0.012, FELT_STEP = 0.004;
/** Сколько держать карту без «держу» — меньше `LOCK_TTL_MS` стола. */
const HOLD_MS = 1500;
/** Двойной тап — два тапа по одной карте за столько. */
const DOUBLE_MS = 350;

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

/** Карта: лицо (+z) и рубашка (−z) спиной к спине, со скруглёнными углами. */
const cardShape = (() => {
  const w = CARD_W / 2, h = CARD_H / 2, r = 0.09;
  const s = new THREE.Shape();
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  const g = new THREE.ShapeGeometry(s, 4);
  const pos = g.getAttribute("position") as THREE.BufferAttribute, uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5);
  return g;
})();
interface CardObj { group: THREE.Group; front: THREE.Mesh; back: THREE.Mesh; ring: THREE.LineLoop; target: Place; faceUrl: string; backUrl: string }
const cardEdge = (() => {
  const w = CARD_W / 2 + 0.04, h = CARD_H / 2 + 0.04;
  return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w, -h, 0.003), new THREE.Vector3(w, -h, 0.003), new THREE.Vector3(w, h, 0.003), new THREE.Vector3(-w, h, 0.003)]);
})();

/** Что сцена даёт HUD (`hud.ts`): камеру, руку, стопки и головы на экране, выделение. */
export interface SceneApi {
  home(): void;
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
  heads(): { key: string; x: number; y: number; r: number; ink: string }[];
  pickAt(x: number, y: number): { t: "card"; id: string } | { t: "who"; key: string } | null;
  /** Стопки на экране: где и сколько. */
  pileSpots(): { pile: string; count: number; x: number; y: number }[];
  /** Карты, чья середина на экране внутри многоугольника. */
  cardsIn(poly: { x: number; y: number }[]): string[];
  /** Лассо открыто — тап по карте выделяет, выделенные несут вместе; `grab` — как несут. */
  setLasso(on: boolean, grab: "collect" | "keep"): void;
  /** Точка сукна под пальцем. */
  feltAt(x: number, y: number): { x: number; y: number } | null;
  /** После каждого кадра — HUD переставляет то, что стоит по сцене. */
  onFrame(fn: () => void): void;
  /** Взять карту пальцем из окна HUD (окно стопки, окно стула): дальше её несут, как со стола. */
  carry(id: string, e: PointerEvent): void;
  /** Стопку несут за грип: её карты — под пальцем над сукном; `null` — положили. */
  carryPile(pile: string, at: { x: number; y: number } | null): void;
  /** Куда ляжет то, что отпустят здесь: в мою руку (на место `i`), в стопку, на сукно. */
  aim(x: number, y: number, skipPile?: string): { in: "hand"; chair: string; i: number } | { in: "deck"; pile: string } | { in: "felt"; x: number; y: number };
}

export function mountScene(host: HTMLElement, store: TableStore): SceneApi {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x0a1511);
  host.append(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block", touchAction: "none" });
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a1511, 30, 70);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  // Своя рука — в осях камеры: внизу экрана, как бы камеру ни крутили.
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
  const top = new THREE.Mesh(new THREE.CircleGeometry(R + RIM, 128), new THREE.MeshBasicMaterial({ map: feltTex }));
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
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(6, 14, 8);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1a2a22, 1.6), sun);
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
    return { by: who.key, s: sh, head, left: leftHandOf(head, b.yaw), away: awayOf(sh, b.yaw), yaw: b.yaw, right: b.right ? { ...b.right, h: holding ? HEAD.lift * head.h : 0.4 } : null, ink: who.ink, name: who.name, strained: b.stretch > NECK.free };
  };
  const V = (p: Point3) => new THREE.Vector3(p.x, p.h, p.y);
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
      one.scale.set(r * k, len + (k > 1 ? r * 0.5 : 0), r * k);
      g.add(one);
    }
    g.position.copy(a).add(b).multiplyScalar(0.5);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return g;
  };
  const ball = (at: THREE.Vector3, r: number, mat: THREE.Material): THREE.Group => {
    const g = new THREE.Group();
    for (const [m, k] of [[mat, 1], [outlineMat, 1.25]] as const) { const one = new THREE.Mesh(unitBall, m); one.scale.setScalar(r * k); g.add(one); }
    g.position.copy(at);
    return g;
  };
  /** Кукла в единицах стола — как у стола в 2D (`bodyView.ts`): толщина палки, полуширина плеч, руки, досягаемость. */
  const DOLL = { spine: 0.21, bar: 1.4, arm: 0.13, hand: 0.32, reach: 5 } as const;
  const poses = new Map<string, Pose>();
  function drawBodies(s: Snapshot): void {
    heads.clear();
    poses.clear();
    for (const ch of s.chairs) {
      if (ch.owner === store.me.key) continue;
      const pose = poseOf(ch, s);
      if (!pose) {
        // Пустой стул — серое кольцо на своём месте.
        const at = seatPoint(ch.angle, R + 1.9);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 40), new THREE.MeshBasicMaterial({ color: 0x5b6663, side: THREE.DoubleSide }));
        ring.position.set(at.x, 1.6, at.y);
        ring.lookAt(0, 1.6, 0);
        heads.add(ring);
        continue;
      }
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
    const backUrl = artUrl(s.rules, undefined, look), faceUrl = c.face ? artUrl(s.rules, c.face, look) : backUrl;
    const by = s.picks[c.id];
    o.ring.visible = !!by;
    if (by) (o.ring.material as THREE.LineBasicMaterial).color.set(s.people.find((p) => p.key === by)?.ink ?? "#f2c14e");
    if (o.faceUrl !== faceUrl) { o.faceUrl = faceUrl; (o.front.material as THREE.MeshBasicMaterial).map = texture(faceUrl, draw); (o.front.material as THREE.MeshBasicMaterial).needsUpdate = true; }
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
  const handGeom = (): Geom | null => { const ch = myChair(); return ch ? mineGeomOf(glass(), ch.pose, ch.hand.length, ch.id, blend) : null; };
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
    for (const ch of s.chairs) ch.hand.forEach((c, i) => {
      const o = cardObj(c.id);
      dress(o, c, s);
      const pose = poses.get(ch.id);
      o.target = ch.id === mine && geom ? inHand(i, geom) : pose && !pose.away ? held(pose, i, ch.hand.length) : fanned(ch.angle, i, ch.hand.length, false);
      // Перевёрнутая в руке — лицом наружу, к остальным: хозяину — рубашкой.
      if (c.up) o.target.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      fromOf.set(c.id, { in: "hand", chair: ch.id, mine: ch.id === mine, i });
      seen.add(c.id);
    });
    for (const [id, o] of cards) if (!seen.has(id)) { cardRoot.remove(o.group); cards.delete(id); }
    draw();
  }

  // ——— кадр: карты догоняют свои места ———
  function tick(): void {
    frame = 0;
    const w = host.clientWidth, h = host.clientHeight;
    if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    let moving = false;
    for (const [id, o] of cards) {
      if (drag?.id === id) continue;
      const g = o.group, t = o.target;
      // Сменила место между миром и рукой — пересадить, сохранив, где она на экране, и долететь.
      const parent = t.onCamera ? handRoot : cardRoot;
      if (g.parent !== parent) { camera.updateMatrixWorld(); parent.attach(g); }
      if (g.position.distanceToSquared(t.pos) > 1e-6 || g.quaternion.angleTo(t.quat) > 1e-3 || Math.abs(g.scale.x - t.scale) > 1e-3) {
        const fresh = !g.userData.placed;
        g.position.lerp(t.pos, fresh ? 1 : 0.25);
        g.quaternion.slerp(t.quat, fresh ? 1 : 0.25);
        g.scale.setScalar(g.scale.x + (t.scale - g.scale.x) * (fresh ? 1 : 0.25));
        g.userData.placed = true;
        moving = true;
      }
    }
    renderer.render(scene, camera);
    for (const f of frameHeard) f();
    host.dataset.cards = String(cards.size);
    host.dataset.felt = String(store.state.felt.length);
    const hand = myChair()?.hand.length ?? 0;
    host.dataset.hand = String(hand);
    if (moving) draw();
  }

  // ——— палец ———
  const ray = new THREE.Raycaster();
  const ndc = (e: { clientX: number; clientY: number }) => { const r = renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  const hitCard = (e: PointerEvent): string | null => {
    ray.setFromCamera(ndc(e), camera);
    const hit = ray.intersectObjects([...cards.values()].flatMap((o) => [o.front, o.back]), false)[0];
    return (hit?.object.userData.card as string | undefined) ?? null;
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
  let drag: { id: string; x: number; y: number; moved: boolean; hold: number; up: boolean; angle: number; group: boolean } | null = null;
  const mine = (id: string) => store.state.picks[id] === store.me.key;
  let lastTap = { id: "", at: 0 };
  renderer.domElement.addEventListener("pointerdown", (e) => {
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
    drag = { id, x: e.clientX, y: e.clientY, moved: false, hold: 0, up: c ? c.up : f.in === "hand" ? true : !!store.state.piles.find((p) => p.id === (f as { pile: string }).pile)?.cards.find((x) => x.id === id)?.up, angle: c ? c.angle : ((-my % 360) + 360) % 360, group: lasso.on && mine(id) };
  }
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      if (!drag.group) store.send({ t: "grab", id: drag.id });
      drag.hold = window.setInterval(() => { if (drag) store.send({ t: "hold", id: drag.id }); }, HOLD_MS);
    }
    const at = onFelt(e);
    const o = cards.get(drag.id);
    if (o && o.group.parent !== cardRoot) cardRoot.attach(o.group);
    rightAt = at ? { x: at.x, y: at.z } : null;
    sendBody();
    if (at && o) {
      const p = lying(at.x, at.z, 0.6, drag.angle, drag.up);
      o.group.position.copy(p.pos);
      o.group.quaternion.copy(p.quat);
      o.group.scale.setScalar(1.1);
      draw();
    }
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
    store.send({ t: "drop", id: d.id, to: target(e, d) });
    draw();
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
  function aim(x: number, y: number, skipPile?: string, skipCard?: string): { in: "hand"; chair: string; i: number } | { in: "deck"; pile: string } | { in: "felt"; x: number; y: number } {
    const e = { clientX: x, clientY: y };
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
    const pile = store.state.piles.find((p) => p.id !== skipPile && Math.hypot(p.x - at.x, p.y - at.z) < 0.9 && p.pose !== "ring");
    if (pile) return { in: "deck", pile: pile.id };
    const len = Math.hypot(at.x, at.z), max = R - 0.8, k = len > max ? max / len : 1;
    return { in: "felt", x: Math.round(at.x * k * 100) / 100, y: Math.round(at.z * k * 100) / 100 };
  }

  // ——— своё тело — остальным: голова — камера, взгляд — куда она смотрит, правая рука — где несёшь карту ———
  let sentAt = 0, rightAt: { x: number; y: number } | null = null;
  function sendBody(force = false): void {
    const now = performance.now();
    if (!force && now - sentAt < BODY_EVERY_MS) return;
    sentAt = now;
    const f = camera.getWorldDirection(new THREE.Vector3());
    store.body({ stance: stanceNow(), model: "seat", eye: { x: camera.position.x, y: camera.position.z, h: Math.max(0, camera.position.y) }, stretch: 0, yaw: Math.atan2(f.x, -f.z) / DEG, right: rightAt });
  }
  orbit.addEventListener("change", () => sendBody());

  function screenOf(id: string): { x: number; y: number } | null {
    const o = cards.get(id);
    if (!o) return null;
    const p = o.group.getWorldPosition(new THREE.Vector3()).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  (window as unknown as { __t3d: unknown }).__t3d = {
    screenOf,
    state: () => store.state,
    me: () => store.me.key,
    /** Своя рука: есть ли у карты лицо в снимке и какой стороной она нарисована к камере. */
    handFaces: () => (myChair()?.hand ?? []).map((c) => {
      const o = cards.get(c.id);
      if (!o) return { id: c.id, face: !!c.face, drawn: "none" };
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(o.group.getWorldQuaternion(new THREE.Quaternion()));
      const toCam = camera.position.clone().sub(o.group.getWorldPosition(new THREE.Vector3()));
      return { id: c.id, face: !!c.face, drawn: n.dot(toCam) > 0 ? (o.faceUrl === o.backUrl ? "back-art" : "face") : "back" };
    }),
    /** Чужие тела: чьё, где голова на экране, ушёл ли головой, где левая рука и сколько в ней карт. */
    bodies: () => [...poses.entries()].map(([chair, pose]) => {
      const p = V(pose.head).project(camera), r = renderer.domElement.getBoundingClientRect();
      return { by: pose.by, chair, away: pose.away, head: { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }, left: pose.left };
    }),
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
    setFigures(on) { heads.visible = on; draw(); },
    setLook(l) { look = l; layout(store.state); },
    heads: () => [...poses.values()].map((pose) => {
      const c = project(V(pose.head)), edge = project(V(pose.head).add(new THREE.Vector3(0, 1, 0)));
      return { key: pose.by, x: c.x, y: c.y, r: Math.hypot(edge.x - c.x, edge.y - c.y), ink: pose.ink };
    }),
    pickAt(x, y) {
      // Голова — первой: веер в его руке висит у самого лица и перекрывал бы её.
      const e = { clientX: x, clientY: y } as PointerEvent;
      ray.setFromCamera(ndc(e), camera);
      const head = heads.visible ? ray.intersectObjects(heads.children, true).find((h) => h.object.userData.head) : undefined;
      if (head) return { t: "who", key: head.object.userData.head as string };
      const id = hitCard(e);
      return id ? { t: "card", id } : null;
    },
    pileSpots: () => store.state.piles.filter((p) => p.pose !== "ring" && p.cards.length).map((p) => ({ pile: p.id, count: p.cards.length, ...project(new THREE.Vector3(p.x, 0.02 + p.cards.length * PILE_STEP, p.y)) })),
    cardsIn(poly) {
      const inside = (q: { x: number; y: number }) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i]!, b = poly[j]!; if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
      return store.state.felt.filter((f) => { const q = screenOf(f.id); return q && inside(q); }).map((f) => f.id);
    },
    setLasso(on, grab) { lasso = { on, grab }; },
    feltAt: (x, y) => { const at = onFelt({ clientX: x, clientY: y }); return at ? { x: at.x, y: at.z } : null; },
    onFrame: (fn) => void frameHeard.push(fn),
    carry(id, e) { if (fromOf.has(id)) startDrag(id, e); },
    carryPile(pile, at) {
      const p = store.state.piles.find((x) => x.id === pile);
      if (!at && pileCarry && p) pileLanding = { ...pileCarry, was: { x: p.x, y: p.y }, until: performance.now() + 1500 };
      pileCarry = at ? { pile, ...at } : null;
      layout(store.state);
    },
    aim: (x, y, skipPile) => aim(x, y, skipPile),
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
