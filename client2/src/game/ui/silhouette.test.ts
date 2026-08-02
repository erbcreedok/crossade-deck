import { describe, it, expect } from "vitest";
import { alphaSilhouette, type AlphaBitmap } from "./silhouette";

// Форма тени снимается с самого предмета. Здесь проверяется ровно это: по одной и той же картинке
// контур обязан отличаться, если отличается предмет, — иначе мы вернулись к «контуру фигуры вообще».

/** Битмап из строк-рисунков: `#` — предмет, `.` — пусто. */
function bitmap(rows: string[]): AlphaBitmap {
  const h = rows.length;
  const w = rows[0]!.length;
  const alpha = new Uint8Array(w * h);
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) alpha[y * w + x] = row[x] === "#" ? 255 : 0;
  });
  return { alpha, w, h };
}

/** Верхняя кромка контура по полосам: столько же точек, сколько занятых полос. */
function topEdge(poly: number[]): number[] {
  const half = poly.length / 2;
  const ys: number[] = [];
  for (let i = 0; i < half; i += 2) ys.push(poly[i + 1]!);
  return ys;
}

describe("силуэт по альфе", () => {
  it("пустая картинка формы не даёт — тени у ничего нет", () => {
    expect(alphaSilhouette(bitmap(["....", "....", "...."]))).toBeNull();
  });

  it("прямоугольник даёт свой прямоугольник: кромки по краям пикселей, а не по центрам полос", () => {
    const poly = alphaSilhouette(bitmap(["....", ".##.", ".##.", "...."]), { columns: 4 })!;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < poly.length; i += 2) {
      xs.push(poly[i]!);
      ys.push(poly[i + 1]!);
    }
    expect(Math.min(...xs)).toBe(1);
    expect(Math.max(...xs)).toBe(3); // правая кромка — ЗА последним занятым пикселем
    expect(Math.min(...ys)).toBe(1);
    expect(Math.max(...ys)).toBe(3);
  });

  it("вырез сверху остаётся вырезом: между зубцами кромка проваливается внутрь", () => {
    // корона: два зубца по краям, провал посередине
    const poly = alphaSilhouette(bitmap(["#..#", "#..#", "####", "####"]), { columns: 4 })!;
    const top = topEdge(poly);
    expect(top[0]).toBe(0); // левый зубец начинается сверху
    expect(top[top.length - 1]).toBe(0); // правый тоже
    expect(Math.max(...top)).toBe(2); // а посередине верх формы — только с третьей строки
  });

  it("разные предметы — разные контуры (иначе это «контур предмета вообще»)", () => {
    const tall = alphaSilhouette(bitmap([".##.", ".##.", ".##.", ".##."]), { columns: 4 })!;
    const wide = alphaSilhouette(bitmap(["....", "####", "####", "...."]), { columns: 4 })!;
    expect(tall).not.toEqual(wide);
  });

  it("полупрозрачная кромка сглаживания в форму не идёт — она не тело предмета", () => {
    const w = 4;
    const h = 4;
    const alpha = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) alpha[0 * w + x] = 10; // еле видная строка сверху
    for (let y = 1; y < h; y++) for (let x = 1; x < 3; x++) alpha[y * w + x] = 255;
    const poly = alphaSilhouette({ alpha, w, h }, { columns: 4, threshold: 24 })!;
    expect(Math.min(...topEdge(poly))).toBe(1); // верх — по плотной части, а не по кромке
  });

  it("одной занятой полосы мало: два числа — это отрезок, а не форма", () => {
    expect(alphaSilhouette(bitmap(["#...", "#...", "#..."]), { columns: 4 })).toBeNull();
  });
});
