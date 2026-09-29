// СЦЕНА ДЕТАЛИ НА THREE.JS — два движка на выбор хозяина, одна и та же сцена:
//
//   webgl — видеокарта: картинки — плоскости с текстурой, глубина — буфер глубины;
//   css   — те же объекты three.js, но картинки — наши `<img>` с `matrix3d` (CSS3DRenderer), глубину решает браузер.
//
// Поверх — прозрачный холст WebGL с помощниками: ручки (TransformControls), оси, клетка. Весь ввод идёт в него: камера
// (OrbitControls), выбор картинки (луч по плоскостям — в css у картинок невидимые двойники), ручки.
//
// Две сцены: `mountDetailStage` — деталь одна (ручки на выбранной картинке), `mountTableStage` — деталь у стола
// (тянешь — камера вокруг стола, Ctrl — двигать деталь, Shift — поворачивать).
//
// Для проверок у сцены — `data-*` на хозяине и `screenOf` (где середина картинки на экране).

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { CSS3DObject, CSS3DRenderer, CSS3DSprite } from "three/addons/renderers/CSS3DRenderer.js";
import { normalOf, shapeCorners, visibleLayers, wrapDeg, type Layer, type V3 } from "../src/table/details.js";

export type Engine = "webgl" | "css";
export type Grip = "translate" | "rotate" | "scale";
/** Что показать: слои детали, чем их рисовать, что выбрано. */
export interface DetailLook {
  width: number;
  layers: readonly Layer[];
  src(l: Layer): string | null;
  sel: ReadonlySet<string>;
}
const DEG = Math.PI / 180;
/** Пикселей CSS на единицу стола у картинки в css-движке: картинка чёткая, объект уменьшен обратно. */
const PX = 100;
const GOLD = 0xf2c14e, SKY = 0x6fd0ff;

// ——— картинки: текстуры и размеры ———
// Одна текстура на картинку на обе сцены; догрузилась — сказать всем, кто её ждёт (у каждой сцены своя подписка).
const textures = new Map<string, { tex: THREE.Texture; aspect: number; ready: boolean; waiting: Set<() => void> }>();
function textureOf(src: string, ready: () => void): { tex: THREE.Texture; aspect: number; ready: boolean } {
  let one = textures.get(src);
  if (!one) {
    const img = new Image();
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const made = { tex, aspect: 1, ready: false, waiting: new Set<() => void>() };
    one = made;
    textures.set(src, made);
    img.onload = () => { made.aspect = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1; made.ready = true; tex.needsUpdate = true; for (const f of made.waiting) f(); made.waiting.clear(); };
    img.src = src;
  }
  if (!one.ready) one.waiting.add(ready);
  return one;
}
/** Сторона картинки: ширина детали, высота — по картинке (прямоугольник) или как ширина (фигура). */
const sizeOf = (l: Layer, width: number, aspect: number) => ({ w: width, h: l.shape === "rect" ? width * aspect : width });

/** Контур формы в единицах: прямоугольник или правильная фигура, первый угол — наверху. */
function outline(l: Layer, w: number, h: number): THREE.Vector2[] {
  const c = shapeCorners(l.shape);
  if (!c) return [new THREE.Vector2(-w / 2, -h / 2), new THREE.Vector2(w / 2, -h / 2), new THREE.Vector2(w / 2, h / 2), new THREE.Vector2(-w / 2, h / 2)];
  return c.map(([x, y]) => new THREE.Vector2((x * w) / 2, (y * h) / 2));
}
/** Плоскость формы с развёрткой картинки по квадрату стороны; отражения — развёрткой, лицевая сторона не меняется. */
function faceGeometry(l: Layer, w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(new THREE.Shape(outline(l, w, h)), 48);
  const pos = g.getAttribute("position") as THREE.BufferAttribute, uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let u = pos.getX(i) / w + 0.5, v = pos.getY(i) / h + 0.5;
    if (l.flipX) u = 1 - u;
    if (l.flipY) v = 1 - v;
    uv.setXY(i, u, v);
  }
  return g;
}
/** `clip-path` формы для css-движка (проценты квадрата, y — вниз). */
function clipOf(l: Layer): string {
  const c = shapeCorners(l.shape);
  return c ? `polygon(${c.map(([x, y]) => `${(50 + x * 50).toFixed(2)}% ${(50 - y * 50).toFixed(2)}%`).join(",")})` : "";
}

/**
 * СЛОИ ДЕТАЛИ В ОБОИХ ДВИЖКАХ. `root` — корень детали (в него ставят и крутят деталь). У каждого слоя — группа
 * (место, поворот, величина — ровно числа слоя, её двигают ручки), в ней лицо: плоскость или `<img>`, «лицом к
 * камере» — поворот у лица, не у группы.
 */
class LayersView {
  readonly root = new THREE.Group();
  private groups = new Map<string, { group: THREE.Group; face: THREE.Object3D; pick: THREE.Mesh; key: string; line?: THREE.LineLoop }>();
  shown: Layer[] = [];
  constructor(private engine: Engine, private redraw: () => void) {}

  groupOf(id: string): THREE.Group | undefined { return this.groups.get(id)?.group; }
  picks(): THREE.Mesh[] { return this.shown.map((l) => this.groups.get(l.id)?.pick).filter((m): m is THREE.Mesh => !!m); }

  /** Разложить слои по виду `look`, видя деталь с `me` (направление в осях детали), камерой `camera`. */
  update(look: DetailLook, me: V3, camera: THREE.Camera, empty: boolean): void {
    this.shown = visibleLayers(look.layers, me, empty);
    const want = new Set(this.shown.map((l) => l.id));
    for (const [id, g] of this.groups) if (!want.has(id)) { this.root.remove(g.group); this.dispose(g); this.groups.delete(id); }
    const camQ = camera.getWorldQuaternion(new THREE.Quaternion());
    this.root.updateWorldMatrix(true, false);
    this.shown.forEach((l, order) => {
      const src = look.src(l);
      const t = src ? textureOf(src, this.redraw) : null;
      const { w, h } = sizeOf(l, look.width, t?.aspect ?? 1);
      const picked = look.sel.has(l.id);
      const key = [src, w.toFixed(4), h.toFixed(4), l.shape, l.flipX, l.flipY, picked, order, t?.ready].join("|");
      let g = this.groups.get(l.id);
      if (!g || g.key !== key) {
        if (g) { this.root.remove(g.group); this.dispose(g); }
        g = this.build(l, src, t, w, h, picked, order, key);
        this.groups.set(l.id, g);
        this.root.add(g.group);
      }
      g.group.position.set(l.x, l.y, l.z);
      g.group.rotation.set(l.rx * DEG, l.ry * DEG, l.rz * DEG, "YXZ");
      g.group.scale.setScalar(l.scale);
      // Лицом к камере: лицо поворачивается так, чтобы смотреть как камера; бумажная — ещё и сужается по углу.
      if (l.stand === "plane") { g.face.quaternion.identity(); g.face.scale.set(1, 1, 1); }
      else {
        g.group.updateWorldMatrix(true, false);
        const parentQ = g.group.getWorldQuaternion(new THREE.Quaternion());
        g.face.quaternion.copy(parentQ.invert().multiply(camQ));
        const n = normalOf(l), k = l.stand === "tilt" ? Math.max(0.15, n[0] * me[0] + n[1] * me[1] + n[2] * me[2]) : 1;
        g.face.scale.set(k, 1, 1);
      }
      const el = g.face.children.find((c): c is CSS3DObject => c instanceof CSS3DObject);
      if (el) el.element.style.zIndex = String(order);
    });
    // Порядок в списке — порядок в сцене: в css при равной глубине поверх тот, кто позже.
    for (const l of this.shown) { const g = this.groups.get(l.id)!; this.root.remove(g.group); this.root.add(g.group); }
  }

  private build(l: Layer, src: string | null, t: ReturnType<typeof textureOf> | null, w: number, h: number, picked: boolean, order: number, key: string) {
    const group = new THREE.Group();
    group.userData.layer = l.id;
    const geo = faceGeometry(l, w, h);
    const pick = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    pick.userData.layer = l.id;
    let face: THREE.Object3D;
    let line: THREE.LineLoop | undefined;
    if (this.engine === "webgl") {
      const mat = src && t
        ? new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, alphaTest: 0.02, side: l.stand === "plane" ? THREE.FrontSide : THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -order * 0.2, polygonOffsetUnits: -order * 4 })
        : new THREE.MeshBasicMaterial({ color: SKY, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = order;
      face = mesh;
      if (picked || !src) {
        const pts = outline(l, w, h).map((p) => new THREE.Vector3(p.x, p.y, 0.002));
        line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), picked ? new THREE.LineBasicMaterial({ color: GOLD, depthTest: false, transparent: true }) : new THREE.LineDashedMaterial({ color: SKY, dashSize: w / 16, gapSize: w / 24 }));
        line.computeLineDistances();
        line.renderOrder = 999;
        face.add(line);
      }
    } else {
      const el = document.createElement("div");
      el.dataset.layer = l.id;
      el.className = "d3-face";
      Object.assign(el.style, { width: `${w * PX}px`, height: `${h * PX}px`, clipPath: clipOf(l), pointerEvents: "none" });
      if (l.stand === "plane") el.style.backfaceVisibility = "hidden";
      if (src) {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        img.draggable = false;
        img.onload = this.redraw;
        Object.assign(img.style, { width: "100%", height: "100%", objectFit: l.shape === "rect" ? "fill" : "cover", display: "block", transform: `scale(${l.flipX ? -1 : 1}, ${l.flipY ? -1 : 1})` });
        el.append(img);
      } else el.classList.add("empty");
      if (picked) el.classList.add("picked");
      const obj = new CSS3DObject(el);
      obj.scale.setScalar(1 / PX);
      const holder = new THREE.Group();
      holder.add(obj);
      face = holder;
    }
    // Двойник для луча крутится вместе с лицом.
    face.add(pick);
    group.add(face);
    return { group, face, pick, key, line };
  }

  private dispose(g: { group: THREE.Group; pick: THREE.Mesh }): void {
    g.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineLoop) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }
      if (o instanceof CSS3DObject) o.element.remove();
    });
  }
}

/** Холсты сцены: движок (webgl — он же помощники) или css + прозрачный webgl поверх. */
function makeRenderers(host: HTMLElement, engine: Engine) {
  host.style.position = "relative";
  host.style.overflow = "hidden";
  const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  gl.setClearColor(0x000000, 0);
  gl.autoClear = false;
  Object.assign(gl.domElement.style, { position: "absolute", inset: "0", width: "100%", height: "100%", touchAction: "none", display: "block" });
  let css: CSS3DRenderer | null = null;
  if (engine === "css") {
    css = new CSS3DRenderer();
    Object.assign(css.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    host.append(css.domElement);
  }
  host.append(gl.domElement);
  return { gl, css };
}

/** Холст-текстура из рисования 2D. */
function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Оси детали: перед (к лицу, +z), верх (+y), право детали (её правая рука, −x) — стрелками с подписями. */
function axesGroup(len: number): THREE.Group {
  const g = new THREE.Group();
  const one = (dir: V3, color: number, text: string) => {
    const d = new THREE.Vector3(...dir);
    g.add(new THREE.ArrowHelper(d, new THREE.Vector3(), len, color, len * 0.14, len * 0.08));
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(128, 48, (c) => { c.fillStyle = "rgba(11,7,4,.75)"; c.fillRect(0, 0, 128, 48); c.font = "600 30px system-ui, sans-serif"; c.fillStyle = `#${color.toString(16).padStart(6, "0")}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, 64, 25); }), depthTest: false, transparent: true }));
    label.scale.set(len * 0.42, len * 0.16, 1);
    label.position.copy(d.multiplyScalar(len * 1.22));
    label.renderOrder = 1000;
    g.add(label);
  };
  one([0, 0, 1], GOLD, "перед");
  one([0, 1, 0], SKY, "верх");
  one([-1, 0, 0], 0xff7ab8, "право");
  return g;
}

export interface DetailStage {
  set(look: DetailLook): void;
  /** Ручки на выбранной картинке и их вид. */
  grip(mode: Grip, space: "local" | "world"): void;
  layersOn(axes: boolean, grid: boolean): void;
  /** Камера: разворот и наклон (градусы, наклон вверх — плюс), расстояние в ширинах детали. */
  view(): { yaw: number; pitch: number; dist: number };
  setView(v: Partial<{ yaw: number; pitch: number; dist: number }>): void;
  /** Откуда смотришь на деталь — направлением в её осях. */
  me(): V3;
  shown(): Layer[];
  screenOf(id: string): { x: number; y: number } | null;
  destroy(): void;
}

/**
 * СЦЕНА «ДЕТАЛЬ»: деталь одна посреди, камера вокруг (тянешь — крутишь, колесо — ближе). Тап по картинке — выбор
 * (`onPick`, с Shift/Ctrl/⌘ — добавить к выбранным); ручки — на первой выбранной: двигаешь, и `onGrip` получает её
 * новые числа, `onGripEnd` — отпустил.
 */
export function mountDetailStage(host: HTMLElement, engine: Engine, on: { pick(id: string | null, add: boolean): void; grip(id: string, patch: Partial<Layer>): void; gripEnd(): void; view(): void }): DetailStage {
  const { gl, css } = makeRenderers(host, engine);
  const scene = new THREE.Scene(), cssScene = new THREE.Scene(), helpers = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 400);
  let look: DetailLook = { width: 2.4, layers: [], src: () => null, sel: new Set() };
  let frame = 0;
  const draw = () => { if (!frame) frame = requestAnimationFrame(render); };
  const view = new LayersView(engine, draw);
  (engine === "css" ? cssScene : scene).add(view.root);
  const orbit = new OrbitControls(camera, gl.domElement);
  orbit.enableDamping = false;
  orbit.addEventListener("change", () => { draw(); on.view(); });
  const grips = new TransformControls(camera, gl.domElement);
  grips.setMode("translate");
  grips.setSize(0.8);
  helpers.add(grips.getHelper());
  grips.addEventListener("dragging-changed", (e) => { orbit.enabled = !(e as unknown as { value: boolean }).value; if (!(e as unknown as { value: boolean }).value) on.gripEnd(); });
  let lastScale = 1;
  grips.addEventListener("objectChange", () => {
    const g = grips.object as THREE.Group | undefined, id = g?.userData.layer as string | undefined;
    if (!g || !id) return;
    // Величина одна на картинку: какую ось потянул сильнее — та и величина.
    const s = [g.scale.x, g.scale.y, g.scale.z].reduce((a, b) => (Math.abs(b - lastScale) > Math.abs(a - lastScale) ? b : a), lastScale);
    g.scale.setScalar(Math.max(0.05, s));
    lastScale = g.scale.x;
    const e = new THREE.Euler().setFromQuaternion(g.quaternion, "YXZ");
    const r = (v: number, k = 1000) => Math.round(v * k) / k;
    on.grip(id, { x: r(g.position.x), y: r(g.position.y), z: r(g.position.z), rx: wrapDeg(r(e.x / DEG, 10)), ry: wrapDeg(r(e.y / DEG, 10)), rz: wrapDeg(r(e.z / DEG, 10)), scale: r(g.scale.x) });
  });
  grips.addEventListener("change", draw);
  const axes = axesGroup(1), grid = new THREE.Group();
  helpers.add(axes, grid);
  let dist = 3.2;

  function sizeGrid(): void {
    grid.clear();
    const n = Math.max(4, Math.ceil(look.width * 1.6));
    const g = new THREE.GridHelper(n * 2, n * 2, 0xffffff, 0xffffff);
    (g.material as THREE.Material).transparent = true;
    (g.material as THREE.Material).opacity = 0.18;
    g.rotation.x = Math.PI / 2;
    grid.add(g);
    axes.scale.setScalar(look.width * 0.7);
  }

  function me(): V3 {
    const p = camera.position.clone().sub(orbit.target).normalize();
    return [p.x, p.y, p.z];
  }
  function render(): void {
    frame = 0;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    view.update(look, me(), camera, true);
    const firstSel = look.layers.find((l) => look.sel.has(l.id))?.id;
    const g = firstSel ? view.groupOf(firstSel) : undefined;
    if (g && grips.object !== g) { grips.attach(g); lastScale = g.scale.x; }
    if (!g && grips.object) grips.detach();
    if (g && !grips.dragging) lastScale = g.scale.x;
    gl.clear();
    if (engine === "webgl") gl.render(scene, camera);
    else css!.render(cssScene, camera);
    gl.clearDepth();
    gl.render(helpers, camera);
    host.dataset.engine = engine;
    host.dataset.shown = view.shown.filter((l) => l.sprite).map((l) => l.id).join(",");
    host.dataset.planes = String(view.shown.filter((l) => l.sprite).length);
    host.dataset.grip = firstSel ?? "";
    const v = stageView();
    host.dataset.yaw = String(Math.round(v.yaw));
    host.dataset.pitch = String(Math.round(v.pitch));
  }
  function resize(): void {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    gl.setSize(w, h, false);
    css?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // Тап без сдвига — выбор картинки лучом; тянул — это камера.
  const ray = new THREE.Raycaster();
  let down: { x: number; y: number } | null = null;
  gl.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
  gl.domElement.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || grips.dragging) { down = null; return; }
    down = null;
    if ((grips as unknown as { axis: string | null }).axis) return;
    const r = gl.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    view.root.updateWorldMatrix(true, true);
    const hit = ray.intersectObjects(view.picks(), false)[0];
    on.pick((hit?.object.userData.layer as string | undefined) ?? null, e.shiftKey || e.ctrlKey || e.metaKey);
  });

  function stageView() {
    const p = camera.position.clone().sub(orbit.target);
    const d = p.length();
    return { yaw: wrapDeg(Math.atan2(p.x, p.z) / DEG), pitch: Math.asin(p.y / d) / DEG, dist: d / Math.max(0.2, look.width) };
  }
  function setView(v: Partial<{ yaw: number; pitch: number; dist: number }>): void {
    const now = stageView();
    const yaw = (v.yaw ?? now.yaw) * DEG, pitch = Math.max(-89, Math.min(89, v.pitch ?? now.pitch)) * DEG;
    dist = v.dist ?? now.dist;
    const d = dist * Math.max(0.2, look.width);
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
    camera.lookAt(orbit.target);
    orbit.update();
    draw();
  }
  camera.position.set(0, 0, dist * look.width);

  return {
    set(next) {
      const resized = next.width !== look.width;
      look = next;
      if (resized) { const v = stageView(); sizeGrid(); setView({ ...v, dist: v.dist }); }
      draw();
    },
    grip(mode, space) { grips.setMode(mode); grips.setSpace(space); draw(); },
    layersOn(a, g) { axes.visible = a; grid.visible = g; host.dataset.axes = a ? "1" : ""; host.dataset.grid = g ? "1" : ""; draw(); },
    view: stageView,
    setView,
    me,
    shown: () => view.shown,
    screenOf(id) {
      const g = view.groupOf(id);
      if (!g) return null;
      g.updateWorldMatrix(true, false);
      const p = g.getWorldPosition(new THREE.Vector3()).project(camera);
      const r = host.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    },
    destroy() { ro.disconnect(); grips.dispose(); orbit.dispose(); gl.dispose(); cancelAnimationFrame(frame); host.innerHTML = ""; },
  };
}

// ——— у стола ———
export interface TablePlace { x: number; y: number; h: number; yaw: number; tilt: number }
export interface TableStage {
  set(look: DetailLook): void;
  place(at: TablePlace): void;
  layersOn(compass: boolean, grid: boolean): void;
  view(): { yaw: number; pitch: number };
  setView(v: Partial<{ yaw: number; pitch: number }>): void;
  destroy(): void;
}

/**
 * СЦЕНА «У СТОЛА»: стол радиуса `r` с кромкой `rim` и дном на `thick` ниже, деталь на своём месте (`place`: x —
 * вправо, y — к тебе, h — вверх; поворот и наклон). Тянешь — камера вокруг стола (снизу видно тёмное дно), Ctrl + тянуть
 * — двигать деталь по экрану, Shift + тянуть — поворачивать её (`onPlace`). С и Ю — у края стола, стрелка на север по
 * сукну; клетка — в единицу стола.
 */
export function mountTableStage(host: HTMLElement, engine: Engine, table: { r: number; rim: number; thick: number }, onPlace: (at: TablePlace, done: boolean) => void, onView: () => void): TableStage {
  const { gl, css } = makeRenderers(host, engine);
  const scene = new THREE.Scene(), cssScene = new THREE.Scene(), helpers = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  let look: DetailLook = { width: 2.4, layers: [], src: () => null, sel: new Set() };
  let at: TablePlace = { x: 0, y: 0, h: 0, yaw: 0, tilt: 0 };
  let frame = 0;
  const draw = () => { if (!frame) frame = requestAnimationFrame(render); };
  const view = new LayersView(engine, draw);
  const main = engine === "css" ? cssScene : scene;
  const anchor = new THREE.Group();
  anchor.add(view.root);
  main.add(anchor);
  const { r, rim, thick } = table, full = r + rim;

  // Стол: сукно с кромкой сверху, дно снизу, бортик.
  const feltTex = canvasTexture(512, 512, (c) => {
    const k = 256 / full;
    const grad = c.createRadialGradient(256, 256, 0, 256, 256, r * k);
    grad.addColorStop(0, "#1b5a3f"); grad.addColorStop(1, "#0c2c1f");
    c.fillStyle = "#6b4d2c"; c.beginPath(); c.arc(256, 256, 256, 0, Math.PI * 2); c.fill();
    c.fillStyle = grad; c.beginPath(); c.arc(256, 256, r * k, 0, Math.PI * 2); c.fill();
  });
  const underTex = canvasTexture(256, 256, (c) => { const g = c.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, "#1a130c"); g.addColorStop(1, "#070503"); c.fillStyle = g; c.beginPath(); c.arc(128, 128, 128, 0, Math.PI * 2); c.fill(); });
  const gridTex = canvasTexture(1024, 1024, (c) => {
    const k = 512 / r;
    c.save(); c.beginPath(); c.arc(512, 512, 512, 0, Math.PI * 2); c.clip();
    c.strokeStyle = "rgba(255,255,255,.22)"; c.lineWidth = 2;
    for (let u = -Math.floor(r); u <= r; u++) { c.beginPath(); c.moveTo(512 + u * k, 0); c.lineTo(512 + u * k, 1024); c.stroke(); c.beginPath(); c.moveTo(0, 512 + u * k); c.lineTo(1024, 512 + u * k); c.stroke(); }
    c.restore();
  });
  const compass = new THREE.Group(), cells = new THREE.Group();
  if (engine === "webgl") {
    const top = new THREE.Mesh(new THREE.CircleGeometry(full, 96), new THREE.MeshBasicMaterial({ map: feltTex }));
    top.rotation.x = -Math.PI / 2;
    const under = new THREE.Mesh(new THREE.CircleGeometry(full, 96), new THREE.MeshBasicMaterial({ map: underTex }));
    under.rotation.x = Math.PI / 2;
    under.position.y = -thick;
    const side = new THREE.Mesh(new THREE.CylinderGeometry(full, full, thick, 96, 1, true), new THREE.MeshBasicMaterial({ color: 0x3a2716 }));
    side.position.y = -thick / 2;
    const grid = new THREE.Mesh(new THREE.CircleGeometry(r, 96), new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false }));
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.01;
    cells.add(grid);
    scene.add(top, under, side, cells);
  } else {
    const disc = (size: number, bg: string, turn: string, y: number, extra: Partial<CSSStyleDeclaration> = {}) => {
      const el = document.createElement("div");
      Object.assign(el.style, { width: `${size * 2 * PX}px`, height: `${size * 2 * PX}px`, borderRadius: "50%", background: bg, backfaceVisibility: "hidden", pointerEvents: "none", ...extra });
      const o = new CSS3DObject(el);
      o.scale.setScalar(1 / PX);
      o.rotation.x = turn === "up" ? -Math.PI / 2 : Math.PI / 2;
      o.position.y = y;
      return o;
    };
    const edge = ((r / full) * 100).toFixed(2);
    cssScene.add(disc(full, `radial-gradient(circle closest-side, #1b5a3f, #0c2c1f ${edge}%, #6b4d2c ${edge}%, #6b4d2c 99%, transparent 100%)`, "up", 0));
    cssScene.add(disc(full, "radial-gradient(circle closest-side, #1a130c, #070503 75%)", "down", -thick));
    const grid = disc(r, "", "up", 0.01, { backgroundImage: "linear-gradient(rgba(255,255,255,.22) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,.22) 2px, transparent 2px)", backgroundSize: `${PX}px ${PX}px`, backgroundPosition: `${((r * PX) % PX) - 1}px ${((r * PX) % PX) - 1}px` });
    cells.add(grid);
    cssScene.add(cells);
  }
  // Стороны света: север — прочь от южного места (−z), подписи всегда к камере.
  const cardinal = (text: string, z: number) => {
    if (engine === "webgl") {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(96, 96, (c) => { c.fillStyle = "rgba(11,7,4,.85)"; c.strokeStyle = "#f2c14e"; c.lineWidth = 5; c.beginPath(); c.roundRect(8, 8, 80, 80, 16); c.fill(); c.stroke(); c.fillStyle = "#f2c14e"; c.font = "700 56px system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, 48, 52); }), depthTest: false }));
      s.scale.setScalar(1.6);
      s.position.set(0, 0.6, z);
      s.renderOrder = 1000;
      return s;
    }
    const el = document.createElement("span");
    el.className = "tb-cardinal";
    el.dataset.tcard = text === "С" ? "n" : "s";
    el.textContent = text;
    const s = new CSS3DSprite(el);
    s.scale.setScalar(1.6 / 30);
    s.position.set(0, 0.6, z);
    return s;
  };
  const far = full + 1.1;
  compass.add(cardinal("С", -far), cardinal("Ю", far));
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.03, 0), r - 1.2, GOLD, 1.1, 0.7);
  (engine === "webgl" ? scene : cssScene).add(compass);
  // Стрелка — линии: в css её рисует прозрачный холст поверх.
  (engine === "webgl" ? scene : helpers).add(arrow);
  // Стойка до сукна и след.
  const pole = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineDashedMaterial({ color: GOLD, dashSize: 0.3, gapSize: 0.25 }));
  const foot = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 32), new THREE.MeshBasicMaterial({ color: GOLD, side: THREE.DoubleSide }));
  foot.rotation.x = -Math.PI / 2;
  helpers.add(pole, foot);

  const orbit = new OrbitControls(camera, gl.domElement);
  orbit.target.set(0, 2, 0);
  orbit.maxPolarAngle = Math.PI;
  orbit.enablePan = false;
  orbit.addEventListener("change", () => { draw(); onView(); });

  function me(): V3 {
    anchor.updateWorldMatrix(true, true);
    const local = view.root.worldToLocal(camera.position.clone()).normalize();
    return [local.x, local.y, local.z];
  }
  function render(): void {
    frame = 0;
    if (!host.clientWidth || !host.clientHeight) return;
    anchor.position.set(at.x, at.h, at.y);
    anchor.rotation.set(at.tilt * DEG, at.yaw * DEG, 0, "YXZ");
    view.update(look, me(), camera, false);
    pole.position.set(at.x, 0, at.y);
    pole.scale.set(1, Math.max(0.001, at.h), 1);
    pole.computeLineDistances();
    foot.position.set(at.x, 0.02, at.y);
    gl.clear();
    if (engine === "webgl") gl.render(scene, camera);
    else css!.render(cssScene, camera);
    gl.clearDepth();
    gl.render(helpers, camera);
    host.dataset.engine = engine;
    host.dataset.shown = view.shown.map((l) => l.id).join(",");
    host.dataset.planes = String(view.shown.length);
    host.dataset.at = [at.x, at.y, at.h].map((v) => Math.round(v * 100) / 100).join(",");
    host.dataset.under = camera.position.y < 0 ? "1" : "";
  }
  const resize = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; gl.setSize(w, h, false); css?.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); draw(); };
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // Ctrl — двигать деталь по экрану, Shift — поворачивать; без них — камера.
  let drag: { x: number; y: number; move: boolean } | null = null;
  gl.domElement.addEventListener("pointerdown", (e) => {
    if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;
    orbit.enabled = false;
    drag = { x: e.clientX, y: e.clientY, move: e.ctrlKey || e.metaKey };
    gl.domElement.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, { capture: true });
  gl.domElement.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.move) {
      const depth = camera.position.distanceTo(anchor.position);
      const k = (2 * depth * Math.tan((camera.fov * DEG) / 2)) / host.clientHeight;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const step = right.multiplyScalar(dx * k).add(up.multiplyScalar(-dy * k));
      at = { ...at, x: at.x + step.x, h: at.h + step.y, y: at.y + step.z };
    } else at = { ...at, yaw: at.yaw + dx * 0.8, tilt: Math.max(-90, Math.min(90, at.tilt + dy * 0.6)) };
    onPlace(at, false);
    draw();
  });
  const up = () => { if (!drag) return; drag = null; orbit.enabled = true; onPlace(at, true); };
  gl.domElement.addEventListener("pointerup", up);
  gl.domElement.addEventListener("pointercancel", up);
  gl.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

  function stageView() {
    const p = camera.position.clone().sub(orbit.target);
    return { yaw: wrapDeg(Math.atan2(p.x, p.z) / DEG), pitch: Math.asin(p.y / p.length()) / DEG };
  }
  function setView(v: Partial<{ yaw: number; pitch: number }>): void {
    const now = camera.position.lengthSq() ? stageView() : { yaw: 0, pitch: 30 };
    const yaw = (v.yaw ?? now.yaw) * DEG, pitch = Math.max(-89, Math.min(89, v.pitch ?? now.pitch)) * DEG, d = (r + 3.5) * 2.1;
    camera.position.set(orbit.target.x + Math.sin(yaw) * Math.cos(pitch) * d, orbit.target.y + Math.sin(pitch) * d, orbit.target.z + Math.cos(yaw) * Math.cos(pitch) * d);
    camera.lookAt(orbit.target);
    orbit.update();
    draw();
  }

  return {
    // Выбор — на сцене детали; у стола деталь как за столом, без подсветки.
    set(next) { look = { ...next, sel: new Set() }; draw(); },
    place(next) { at = { ...next }; draw(); },
    layersOn(c, g) { compass.visible = c; arrow.visible = c; cells.visible = g; host.dataset.compass = c ? "1" : ""; host.dataset.grid = g ? "1" : ""; draw(); },
    view: stageView,
    setView,
    destroy() { ro.disconnect(); orbit.dispose(); gl.dispose(); cancelAnimationFrame(frame); host.innerHTML = ""; },
  };
}
