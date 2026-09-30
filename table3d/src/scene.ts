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
import { artUrl } from "../../server/table-client/deckArt.js";
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
interface CardObj { group: THREE.Group; front: THREE.Mesh; back: THREE.Mesh; target: Place; faceUrl: string; backUrl: string }

export function mountScene(host: HTMLElement, hud: HTMLElement, store: TableStore): void {
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
    const d = Math.max(R + 5, ((R + RIM) / Math.tan(half)) * 0.8);
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
    group.add(front, back);
    o = { group, front, back, target: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 }, faceUrl: "", backUrl: "" };
    cards.set(id, o);
    cardRoot.add(group);
    return o;
  }
  /** Лицо и рубашка по снимку: лица не видно — с обеих сторон рубашка. */
  function dress(o: CardObj, c: SeenCard, s: Snapshot): void {
    const backUrl = artUrl(s.rules, undefined), faceUrl = c.face ? artUrl(s.rules, c.face) : backUrl;
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
  /** Своя рука: веер внизу экрана, лицом к тебе, по ширине кадра. */
  const inHand = (k: number, n: number): Place => {
    const D = 5, vh = 2 * D * Math.tan((camera.fov * DEG) / 2), vw = vh * camera.aspect;
    const sc = Math.min((0.24 * vh) / CARD_H, (vw * 0.3) / CARD_W), s = k - (n - 1) / 2;
    const step = n > 1 ? Math.min(sc * CARD_W * 0.62, (vw * 0.94 - sc * CARD_W) / (n - 1)) : 0;
    const pos = new THREE.Vector3(s * step, -vh / 2 + sc * CARD_H * 0.45 - s * s * 0.004 * sc, -D + k * 0.004);
    return { pos, quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -s * 2.5 * DEG), scale: sc, onCamera: true };
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
      o.target = ring ? lying(ring.x, ring.y, 0.01 + i * FELT_STEP, ring.angle, !!c.up) : lying(p.x, p.y, 0.01 + i * PILE_STEP, pileAngle(p), !!c.up);
      fromOf.set(c.id, { in: "pile", pile: p.id, top: i === p.cards.length - 1 || !!ring });
      seen.add(c.id);
    });
    for (const ch of s.chairs) ch.hand.forEach((c, i) => {
      const o = cardObj(c.id);
      dress(o, c, s);
      const pose = poses.get(ch.id);
      o.target = ch.id === mine ? inHand(i, ch.hand.length) : pose && !pose.away ? held(pose, i, ch.hand.length) : fanned(ch.angle, i, ch.hand.length, false);
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
    if (!f || (lock && lock !== store.me.key) || (store.state.picks[id] && store.state.picks[id] !== store.me.key)) return false;
    return f.in === "felt" || (f.in === "pile" && f.top) || (f.in === "hand" && f.mine);
  };
  let drag: { id: string; x: number; y: number; moved: boolean; hold: number; up: boolean; angle: number } | null = null;
  let lastTap = { id: "", at: 0 };
  renderer.domElement.addEventListener("pointerdown", (e) => {
    const id = hitCard(e);
    if (!id || !takeable(id)) return;
    // Карту — пальцем; облёт — только по пустому.
    e.stopImmediatePropagation();
    orbit.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
    const f = fromOf.get(id)!;
    const c = f.in === "felt" ? store.state.felt.find((x) => x.id === id) : undefined;
    const my = myChair()?.angle ?? 0;
    drag = { id, x: e.clientX, y: e.clientY, moved: false, hold: 0, up: c ? c.up : f.in === "hand" ? true : !!store.state.piles.find((p) => p.id === (f as { pile: string }).pile)?.cards.find((x) => x.id === id)?.up, angle: c ? c.angle : ((-my % 360) + 360) % 360 };
  }, { capture: true });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      store.send({ t: "grab", id: drag.id });
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

  /** Куда кладут: над своей рукой — в руку, на это место; у стопки — в неё; иначе — на сукно, внутри стола. */
  function target(e: PointerEvent, d: { id: string; up: boolean; angle: number }): Where {
    const chair = myChair();
    const r = renderer.domElement.getBoundingClientRect();
    if (chair && e.clientY > r.top + r.height * 0.76) {
      const others = chair.hand.filter((c) => c.id !== d.id);
      const xs = others.map((c) => screenOf(c.id)?.x ?? 0);
      return { in: "hand", chair: chair.id, i: xs.filter((x) => x < e.clientX).length };
    }
    const at = onFelt(e) ?? new THREE.Vector3();
    const pile = store.state.piles.find((p) => Math.hypot(p.x - at.x, p.y - at.z) < 0.9 && p.pose !== "ring");
    if (pile) return { in: "deck", pile: pile.id };
    const ringPile = store.state.piles.find((p) => p.pose === "ring" && Math.hypot(p.x - at.x, p.y - at.z) < 3.2);
    if (ringPile) return { in: "deck", pile: ringPile.id, turn: ((Math.atan2(at.x - ringPile.x, -(at.z - ringPile.y)) / DEG) + 360) % 360 };
    const len = Math.hypot(at.x, at.z), max = R - 0.8, k = len > max ? max / len : 1;
    return { in: "felt", x: Math.round(at.x * k * 100) / 100, y: Math.round(at.z * k * 100) / 100, up: d.up, angle: d.angle };
  }

  // ——— своё тело — остальным: голова — камера, взгляд — куда она смотрит, правая рука — где несёшь карту ———
  let sentAt = 0, rightAt: { x: number; y: number } | null = null;
  function sendBody(force = false): void {
    const now = performance.now();
    if (!force && now - sentAt < BODY_EVERY_MS) return;
    sentAt = now;
    const f = camera.getWorldDirection(new THREE.Vector3());
    store.body({ stance: store.state.rules.stand ? "stand" : "sit", model: "seat", eye: { x: camera.position.x, y: camera.position.z, h: Math.max(0, camera.position.y) }, stretch: 0, yaw: Math.atan2(f.x, -f.z) / DEG, right: rightAt });
  }
  orbit.addEventListener("change", () => sendBody());

  function screenOf(id: string): { x: number; y: number } | null {
    const o = cards.get(id);
    if (!o) return null;
    const p = o.group.getWorldPosition(new THREE.Vector3()).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  // ——— над столом: что умеет крупье, камера домой ———
  function drawHud(): void {
    // Дела крупье — под одной кнопкой: на телефоне их ряд закрыл бы полстола.
    const crew = store.crew.length ? `<details class="crew"><summary>Крупье</summary><div>${store.crew.map((c) => `<button data-crew="${c.id}">${c.name}</button>`).join("")}</div></details>` : "";
    // Подсказка — под «?»: строкой сверху она закрывала головы тех, кто сидит напротив.
    document.title = `${store.title} · 3D`;
    hud.innerHTML = `<button data-home>Моя сторона</button>${crew}<details class="crew"><summary>?</summary><div><span class="said">${store.title} · ${store.me.name}. Тянешь карту — несёшь: над своей рукой — в руку, у стопки — в стопку, иначе — на сукно. Двойной тап — перевернуть. Тянешь по пустому — облёт стола.</span></div></details>`;
    hud.querySelector<HTMLElement>("[data-home]")!.onclick = () => { home(); draw(); };
    for (const b of hud.querySelectorAll<HTMLElement>("[data-crew]")) b.onclick = () => { store.send({ t: "crew", act: b.dataset.crew! }); hud.querySelector("details")?.removeAttribute("open"); };
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
  store.onChange(() => layout(store.state));
  // Размер окна сменился (поворот телефона) — домой заново, пока камеру не трогали.
  let touched = false;
  orbit.addEventListener("start", () => { touched = true; });
  new ResizeObserver(() => { if (!touched) home(); draw(); }).observe(host);
  home();
  sendBody(true);
  drawHud();
  layout(store.state);
}
