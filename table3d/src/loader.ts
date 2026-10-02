// ЛОАДЕР 3D — тот же крест, что у хаба и обычного стола (`look/src/loading.ts`), но объёмный: контур `CROSS_PATH` выдавлен в тело с фаской и крутится.
// Форма та же, что у плоского (его же точки), краска — та же (`PALETTE.danger` на сукне), подпись и поведение (`done`, `say`, `showing`) — те же, поэтому
// на месте плоского он встаёт без переделок. Вариант анимации выбирается (`?loader=spin|flip|build` у стенда `/?loader`, тап по нему листает варианты).

import * as THREE from "three";
import { PALETTE } from "../../look/src/palette.js";
import { CROSS_PATH, LOADING_MS } from "../../look/src/loading.js";
export { CROSS_PATH };

export const LOADER_VARIANTS = ["spin", "flip", "build"] as const;
export type LoaderVariant = (typeof LOADER_VARIANTS)[number];

/** Вершины креста из `CROSS_PATH` (сетка 0…100, вниз — плюс) в единицах от середины: ширина креста — 2. */
export function crossPoints(): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (const m of CROSS_PATH.matchAll(/([ML])\s*(-?[\d.]+)\s+(-?[\d.]+)/g)) out.push(new THREE.Vector2((Number(m[2]) - 50) / 50, (50 - Number(m[3])) / 50));
  return out;
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const SHEET = "crossade-loader3d";
const CSS = `
.crossade-loader3d { position: fixed; inset: 0; z-index: 7; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  background: ${PALETTE.felt}; transition: opacity 220ms ease; touch-action: none; }
.crossade-loader3d.gone { opacity: 0; pointer-events: none; }
.crossade-loader3d canvas { width: 132px; height: 132px; display: block; }
.crossade-loader3d .said { font: 600 13px/1.2 ui-sans-serif, system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: ${PALETTE.inkDim}; }
`;

export interface Loader3d {
  done(): void;
  showing(): boolean;
  say(label: string): void;
  /** Сменить вариант анимации (стенд). */
  variant(v: LoaderVariant): void;
}

/** Накрыть `over` загрузкой с вращающимся крестом, пока не позовут `done()`. */
export function loader3d(over: HTMLElement, label: string, start: LoaderVariant = "spin"): Loader3d {
  if (!document.getElementById(SHEET)) {
    const style = document.createElement("style");
    style.id = SHEET;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const sheet = document.createElement("div"), said = document.createElement("div");
  sheet.className = "crossade-loader3d";
  said.className = "said";
  said.textContent = label;
  const canvas = document.createElement("canvas");
  sheet.append(canvas, said);
  over.appendChild(sheet);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(132, 132, false);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  camera.position.set(0, 0, 5.4);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a3a32, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sun.position.set(2.5, 3, 4);
  scene.add(sun);

  const shape = new THREE.Shape(crossPoints());
  const depth = 0.34, geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 });
  geometry.translate(0, 0, -depth / 2);
  const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: PALETTE.danger, roughness: 0.42, metalness: 0.12 }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 40), new THREE.LineBasicMaterial({ color: 0x0b0704 }));
  const cross = new THREE.Group();
  cross.add(body, edge);
  scene.add(cross);

  let mode = start, up = true, raf = 0;
  const t0 = performance.now(), period = LOADING_MS * 1.8;
  const frame = (): void => {
    if (!up) return;
    const t = ((performance.now() - t0) % period) / period;
    cross.rotation.set(-0.22, 0, 0);
    cross.position.set(0, 0, 0);
    cross.scale.set(1, 1, 1);
    if (mode === "spin") {
      // Оборот вокруг вертикали за первые 70% круга, потом короткая пауза: тот же ритм «рисуется — держится — гаснет», что у плоского.
      cross.rotation.y = ease(Math.min(1, t / 0.7)) * Math.PI * 2;
    } else if (mode === "flip") {
      // Монетка: подброс вверх и переворот через себя, приземляется и замирает.
      const k = Math.min(1, t / 0.7);
      cross.rotation.x = -0.22 + ease(k) * Math.PI * 2;
      cross.position.y = Math.sin(k * Math.PI) * 0.55;
    } else {
      // Сборка: толщина вырастает из плоского креста, он оборачивается раз, и толщина снова тает.
      const k = Math.min(1, t / 0.8), grow = Math.sin(k * Math.PI);
      cross.scale.z = 0.12 + 0.88 * Math.min(1, grow * 1.6);
      cross.rotation.y = ease(k) * Math.PI * 2;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  frame();
  sheet.addEventListener("click", () => { /* тап листает варианты только у стенда: его вешает вызывающий */ });

  return {
    done() {
      if (!up) return;
      up = false;
      cancelAnimationFrame(raf);
      sheet.classList.add("gone");
      setTimeout(() => { sheet.remove(); renderer.dispose(); geometry.dispose(); }, 240);
    },
    showing: () => up,
    say(next) { said.textContent = next; },
    variant(v) { mode = v; },
  };
}
