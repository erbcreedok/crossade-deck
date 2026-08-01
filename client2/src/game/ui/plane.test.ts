import { describe, it, expect } from "vitest";
import { scaleForState } from "./plane";
import { cardShadow, SHADOW_ON_TABLE, type ShadowShape } from "./shadow";
import { DRAG_SCALE, LIFT_SCALE, TEX_H, TEX_W } from "../engine/constants";
import { bobOffset, idleBobs, screenLift, zFromScale } from "./elevation";

// Тень может отсутствовать (эффект её убрал) — во всех проверках берём непустую.
const sh = (o: Parameters<typeof cardShadow>[0], t?: Parameters<typeof cardShadow>[1]): ShadowShape => cardShadow(o, t)!;

describe("plane.scaleForState", () => {
  it("план → масштаб", () => {
    expect(scaleForState("rest")).toBe(1);
    expect(scaleForState("fan")).toBe(1);
    expect(scaleForState("lifted")).toBe(LIFT_SCALE);
    expect(scaleForState("held")).toBe(DRAG_SCALE);
    expect(scaleForState("drag")).toBe(DRAG_SCALE);
  });
});

describe("plane.shadowSilhouette", () => {
  // Тень зависит ТОЛЬКО от высоты `z`: место на столе (px, py) подъёмом не меняется.
  const rest = { px: 100, py: 200, shakeX: 0, z: 0, rotation: 0, scaleFactor: 1 };

  it("в покое: тень прижата и РОВНО по предмету — лежащая карта не может отбрасывать тень больше себя", () => {
    const s = sh(rest);
    // elev=0 → x = px - chpx*0.03, y = py + chpx*0.04 (chpx = TEX_H*1)
    expect(s.x).toBeLessThan(rest.px); // чуть влево
    expect(s.y).toBeGreaterThan(rest.py); // чуть вниз
    expect(s.hw).toBeCloseTo((TEX_W / 2) * 1, 6); // base = 1: ни пикселем больше карты
    expect(s.rot).toBe(0);
  });

  // Высоту показывает ЗАЗОР между предметом и тенью, а не абсолютное положение тени: обе едут
  // вверх, когда предмет поднимается, просто предмет быстрее.
  const gap = (z: number) => sh({ ...rest, z }).y - (rest.py + screenLift(z, TEX_H));

  it("подъём: зазор до тени растёт и она уходит дальше вбок", () => {
    expect(gap(0.45)).toBeGreaterThan(gap(0));
    expect(Math.abs(sh({ ...rest, z: 0.45 }).x - rest.px)).toBeGreaterThan(Math.abs(sh(rest).x - rest.px));
  });

  // Две модели света, и смешивать их нельзя: приклеенная тень едет с предметом и НЕ меняет размер,
  // лежащая на столе — остаётся, отдаляется и растёт. Умолчание — первая.
  it("приклеенная тень (follow=1) размер НЕ меняет", () => {
    expect(sh({ ...rest, z: 0.45 }).hw).toBeCloseTo(sh(rest).hw, 6);
  });

  it("тень НА СТОЛЕ (follow=0) остаётся на месте, отдаляется и растёт", () => {
    const a = sh(rest, SHADOW_ON_TABLE);
    const b = sh({ ...rest, z: 0.45 }, SHADOW_ON_TABLE);
    expect(b.y).toBeGreaterThan(a.y);
    expect(b.hw).toBeGreaterThan(a.hw);
  });

  it("вниз зазор растёт сильнее, чем вбок (перспектива)", () => {
    const dDown = gap(0.45) - gap(0);
    const dSide = Math.abs(sh({ ...rest, z: 0.45 }).x - sh(rest).x);
    expect(dDown).toBeGreaterThan(dSide);
  });

  it("shakeX и rotation пробрасываются", () => {
    const s = sh({ ...rest, shakeX: 7, rotation: 0.2 });
    expect(s.x).toBeCloseTo(sh(rest).x + 7, 6);
    expect(s.rot).toBe(0.2);
  });

  it("spinX сужает тень по ширине при перевороте (в такт карте)", () => {
    const full = sh(rest);
    const half = sh({ ...rest, spinX: 0.5 });
    const edge = sh({ ...rest, spinX: 0 });
    expect(half.hw).toBeCloseTo(full.hw * 0.5, 6);
    expect(edge.hw).toBe(0); // на ребре (90°) тень схлопывается
    expect(half.hh).toBe(full.hh); // высота не меняется
  });
});

// Ось `z` заведена после трёх подряд ошибок в этой формуле: тень росла при спуске, уезжала вверх,
// когда карта опускалась, и была больше лежащей карты. Все три — из-за того, что «высота» и
// «положение на экране» жили в одном выражении. Тесты ниже сторожат именно это разделение.
describe("plane: высота — единственный источник поведения тени", () => {
  const at = (z: number) => sh({ px: 100, py: 200, shakeX: 0, z, rotation: 0, scaleFactor: 1 });

  it("выше предмет — больше зазор, монотонно", () => {
    const g = (z: number) => at(z).y - screenLift(z, TEX_H);
    expect(g(0.1)).toBeGreaterThan(g(0));
    expect(g(0.3)).toBeGreaterThan(g(0.1));
  });

  // Ради этого follow и заведён: встречное движение читается как две несвязанные вещи.
  it("тень едет в ТУ ЖЕ сторону, что предмет, а не навстречу", () => {
    expect(at(0.3).y).toBeLessThan(at(0).y);
  });

  it("МЕСТО НА СТОЛЕ подъёмом не меняется: тень считается от py, а не от того, где карта на экране", () => {
    // Одинаковый z при разном py даёт одинаковый ОТСТУП тени — то есть подъём не путается с
    // перемещением. Именно это ломалось, когда в формулу входило экранное качание.
    const a = sh({ px: 0, py: 0, shakeX: 0, z: 0.2, rotation: 0, scaleFactor: 1 });
    const b = sh({ px: 0, py: 500, shakeX: 0, z: 0.2, rotation: 0, scaleFactor: 1 });
    expect(b.y - 500).toBeCloseTo(a.y, 6);
  });
});

describe("elevation: экранный подъём выводится из высоты", () => {
  it("выше по z — выше по ЭКРАНУ, то есть Y уменьшается", () => {
    expect(screenLift(0, 100)).toBeCloseTo(0, 6);
    expect(screenLift(0.2, 100)).toBeLessThan(0);
    expect(screenLift(0.4, 100)).toBeLessThan(screenLift(0.2, 100));
  });

  // Карта при дыхании не меняет ни размер, ни слой — значит и высоту. Это экранная декорация, и
  // тень на неё не реагирует: иначе она меняет размер под предметом, который не изменился.
  it("дыхание — ЭКРАННОЕ смещение, а не высота", () => {
    expect(bobOffset(-1, 0.1, 200)).toBeCloseTo(-20, 6); // вверх по экрану
    expect(bobOffset(1, 0.1, 200)).toBeCloseTo(20, 6);
    expect(bobOffset(0, 0.1, 200)).toBeCloseTo(0, 6);
  });

  it("высота плана: лежащий — ноль, поднятый — превышение масштаба над лежащим", () => {
    expect(zFromScale(1)).toBe(0);
    expect(zFromScale(LIFT_SCALE)).toBeCloseTo(LIFT_SCALE - 1, 6);
    expect(zFromScale(0.9)).toBe(0); // масштаб МЕНЬШЕ лежащего — это не «под столом», а просто ноль
  });
});

// Поза и дыхание — РАЗНЫЕ оси: поза говорит, где предмет, дыхание — шевелится ли он там. Поза
// задаёт только умолчание, и любое из значений перебивается явным.
describe("elevation: дыхание — своя ось, поза задаёт лишь умолчание", () => {
  it("по умолчанию дышит поднятый, а лежащий и удерживаемый — нет", () => {
    expect(idleBobs("lifted")).toBe(true);
    expect(idleBobs("rest")).toBe(false);
    expect(idleBobs("held")).toBe(false);
  });

  it("явное значение перебивает умолчание позы — в обе стороны", () => {
    expect(idleBobs("rest", true)).toBe(true);
    expect(idleBobs("lifted", false)).toBe(false);
  });
});
