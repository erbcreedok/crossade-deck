// ГДЕ СТОИТ СТОЛ — чистая математика между трекером и three.js, без браузера.
//
// Два трекера отдают позу метки по-разному, а сцена одна. Договор сцены: ЕДИНИЦА — ширина метки,
// стол лежит в плоскости XY якоря, ось Z смотрит из метки к камере. Камера three.js в нуле, смотрит
// в −Z; её угол обзора — тот, что у видео ПОСЛЕ подгонки «cover» под экран, иначе стол съезжает с
// метки к краям кадра.

/** MindAR считает камеру с вертикальным обзором 45° по входному кадру; ArUco берёт тот же, чтобы режимы совпадали. */
export const INPUT_FOV = 45;

/** Видео «cover» в контейнер: размер и сдвиг, как у фона (края срезаются, пропорции целы). */
export function coverFit(vw, vh, cw, ch) {
  const scale = Math.max(cw / vw, ch / vh);
  const w = vw * scale, h = vh * scale;
  return { w, h, left: (cw - w) / 2, top: (ch - h) / 2, scale };
}

/** Вертикальный обзор камеры three.js для контейнера, в который видео вписано «cover». */
export function screenFov(vh, fit, ch, inputFov = INPUT_FOV) {
  const half = Math.tan(((inputFov / 2) * Math.PI) / 180);
  return (2 * Math.atan((half * ch) / fit.h) * 180) / Math.PI;
}

/** Фокус в пикселях входного кадра при вертикальном обзоре `inputFov`. */
export function focalPx(inputHeight, inputFov = INPUT_FOV) {
  return inputHeight / 2 / Math.tan(((inputFov / 2) * Math.PI) / 180);
}

/**
 * Поза из POSIT (js-aruco) → матрица three.js (column-major, 16 чисел).
 *
 * POSIT живёт в кадре камеры «x вправо, y вверх, z ВПЕРЁД», а three — «z НАЗАД». Переход F=diag(1,1,−1)
 * с двух сторон: F·[R|t]·F. С одной стороны вышло бы отражение (det −1) и стол вывернулся бы наизнанку.
 * Модель POSIT — квадрат со стороной 1, углы (−½,½) (½,½) (½,−½) (−½,−½): единица сцены = метка.
 */
export function positMatrix(R, t) {
  const s = [1, 1, -1];
  const e = new Array(16).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) e[col * 4 + row] = s[row] * R[row][col] * s[col];
    e[12 + row] = s[row] * t[row];
  }
  e[15] = 1;
  return e;
}

/** Углы маркера (пиксели кадра, y вниз) → точки для POSIT (центр кадра, y вверх). */
export function centred(corners, width, height) {
  return corners.map((c) => ({ x: c.x - width / 2, y: height / 2 - c.y }));
}

/** Кватернион камеры из deviceorientation — как в three DeviceOrientationControls, без самого three. */
export function deviceQuaternion(alpha, beta, gamma, screenAngle) {
  const d = Math.PI / 180;
  const [x, y, z] = [beta * d, alpha * d, -gamma * d];
  // Эйлер 'YXZ' → кватернион
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  let q = [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
  q = mul(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]); // камера смотрит из задней стороны, а не из макушки
  const o = (-screenAngle * d) / 2;
  return mul(q, [0, 0, Math.sin(o), Math.cos(o)]);
}

function mul([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
