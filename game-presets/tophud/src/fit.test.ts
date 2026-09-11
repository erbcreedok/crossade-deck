// THE GUARD: `tophud.name-is-the-only-thing-that-shrinks`.

import { describe, expect, it } from "vitest";
import { fitTitle, nameCap } from "./fit.js";
import { TOP_HUD_LOOK, topHudLook } from "./look.js";

const PHONE = 390;
/** The way out and a full row of people, as the strip actually measures them on a phone. */
const ask = (titleWant: number, over: Partial<{ backWidth: number; peopleWidth: number }> = {}) => ({
  glass: PHONE,
  backWidth: 36,
  peopleWidth: TOP_HUD_LOOK.tight * TOP_HUD_LOOK.avatar,
  titleWant,
  ...over,
});

describe("tophud.name-is-the-only-thing-that-shrinks", () => {
  it("влезло — никого не трогаем", () => {
    const fit = fitTitle(ask(80), TOP_HUD_LOOK);
    expect(fit.titleMax).toBeUndefined();
    expect(fit.dropped).toBe(false);
  });

  it("не влезло — название ужимается ровно до оставшегося, и ни выход, ни люди не уступают", () => {
    const one = ask(400);
    const fit = fitTitle(one, TOP_HUD_LOOK);
    expect(fit.dropped).toBe(false);
    expect(fit.titleMax).toBe(fit.room);
    // Оставшееся — это то, что осталось ПОСЛЕ выхода и людей: они места не отдают.
    expect(fit.room).toBe(PHONE - 2 * TOP_HUD_LOOK.side - one.backWidth - one.peopleWidth - 2 * TOP_HUD_LOOK.gap);
  });

  it("осталось меньше порога — название убирается целиком, а не обрезается", () => {
    const fit = fitTitle(ask(400, { peopleWidth: 300 }), TOP_HUD_LOOK);
    expect(fit.dropped).toBe(true);
    expect(fit.titleMax).toBeUndefined();
  });

  it("порог — ручка, и сдвинутый порог сдвигает решение", () => {
    const tight = ask(400, { peopleWidth: 260 });
    expect(fitTitle(tight, topHudLook({ minTitle: 40 })).dropped).toBe(false);
    expect(fitTitle(tight, topHudLook({ minTitle: 120 })).dropped).toBe(true);
  });

  it("без выхода название получает его место — это и есть стендалон", () => {
    const withBack = fitTitle(ask(400), TOP_HUD_LOOK);
    const alone = fitTitle(ask(400, { backWidth: 0 }), TOP_HUD_LOOK);
    expect(alone.room).toBe(withBack.room + 36 + TOP_HUD_LOOK.gap);
  });

  it("имя не просит больше своей доли экрана", () => {
    expect(nameCap(PHONE, TOP_HUD_LOOK)).toBe(Math.round(PHONE * TOP_HUD_LOOK.nameShare));
  });
});
