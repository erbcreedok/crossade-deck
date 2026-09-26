// РОГАТКА — сильный бросок карты из руки. Здесь только числа: схватился ли натяг, какая у него сила и
// куда упадёт карта. Кто что рисует и что уходит на сервер, решает экран (`screen.ts`).

import { SLING } from "./screenConst.js";

type Point = { x: number; y: number };

/**
 * НАТЯГ ПО ПАЛЬЦУ: палец ушёл от точки захвата ВНИЗ дальше порога. `was` — был ли натяг до этого
 * движения: отпускается он на меньшем пороге (`cancel`), чем хватается (`start`), — иначе на границе
 * натяг дрожал бы от каждого пикселя.
 *
 * Тянуть надо вниз: вбок по руке — это перестановка карт в веере, а не рогатка. Доля «вниз» —
 * `SLING.down` от всей длины оттяжки.
 *
 * `null` — натяга нет. Иначе — сила 0…1 и направление ПОЛЁТА на стекле: против оттяжки, как у рогатки.
 */
export function slingPull(from: Point, finger: Point, was: boolean): { power: number; dir: Point } | null {
  const dx = finger.x - from.x;
  const dy = finger.y - from.y;
  const pull = Math.hypot(dx, dy);
  if (pull === 0 || dy < pull * SLING.down) return null;
  if (pull < (was ? SLING.cancel : SLING.start)) return null;
  const power = Math.max(0, Math.min(1, (pull - SLING.start) / (SLING.max - SLING.start)));
  return { power, dir: { x: -dx / pull, y: -dy / pull } };
}

/**
 * КУДА УПАДЁТ КАРТА — на столе, в его единицах. Луч идёт от точки захвата (`from`) через `toward`; стол
 * — круг радиуса `r` вокруг нуля. Слабый бросок кладёт карту у ближней кромки, полный — у дальней;
 * между ними — по силе.
 *
 * Луч мимо стола (бросили вбок) — карта ложится в ближайшую к лучу точку сукна: со стола она не
 * улетает никогда.
 */
export function slingLanding(from: Point, toward: Point, r: number, power: number): Point {
  const len = Math.hypot(toward.x - from.x, toward.y - from.y) || 1;
  const d = { x: (toward.x - from.x) / len, y: (toward.y - from.y) / len };
  // |from + s·d|² = r² — где луч входит в стол и где выходит.
  const b = from.x * d.x + from.y * d.y;
  const c = from.x * from.x + from.y * from.y - r * r;
  const disc = b * b - c;
  const onRim = (p: Point): Point => {
    const k = Math.hypot(p.x, p.y);
    return k <= r ? p : { x: (p.x / k) * r, y: (p.y / k) * r };
  };
  if (disc < 0) return onRim({ x: from.x - b * d.x, y: from.y - b * d.y });
  const enter = Math.max(0, -b - Math.sqrt(disc));
  const leave = -b + Math.sqrt(disc);
  if (leave <= 0) return onRim({ x: from.x - b * d.x, y: from.y - b * d.y });
  const s = enter + power * (leave - enter);
  return onRim({ x: from.x + s * d.x, y: from.y + s * d.y });
}
