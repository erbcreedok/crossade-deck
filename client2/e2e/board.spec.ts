import { test, expect, type Page } from "@playwright/test";

// Игровая зона (борд): фигуры-карты в слотах, драг между слотами (BoardZone.dropAt), фигуры
// заперты в рамке (clamp). Логический слот фигуры берём из хука (boardFigures[].key).
test.describe("песочница — игровая зона (борд)", () => {
  test.use({ viewport: { width: 900, height: 5800 } }); // высокий — видны все нижние борды (+ Поле сверху)

  interface Hooks {
    boardFigures: { id: string; key: string; x: number; y: number }[];
    boardSlots: { key: string; x: number; y: number }[];
    selMode: boolean;
    selection: string[];
    selButtons: { label: string; x: number; y: number }[];
    selFigures: { id: string; x: number; y: number }[];
    boards: { title: string; figures: { id: string; key: string; x: number; y: number }[]; slots: { key: string; x: number; y: number }[]; onOccupied: string; onOccupiedAt: { x: number; y: number }[] }[];
    selMultiAt: { x: number; y: number }[];
    selSortAt: { x: number; y: number }[];
    cardW: number;
    draggingId: string | null;
  }
  const hooks = (page: Page): Promise<Hooks> =>
    page.evaluate(() => (window as unknown as { __fd: { testHooks(): Hooks } }).__fd.testHooks());
  const fig = (h: Hooks, id: string) => h.boardFigures.find((f) => f.id === id)!;

  test.beforeEach(async ({ page }) => {
    await page.goto("/free-desk");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  const dragTo = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }, hold = false) => {
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 14 });
    if (!hold) await page.mouse.up();
  };

  test("фигура переезжает в пустой слот (логический key меняется)", async ({ page }) => {
    const h = await hooks(page);
    const a = h.boardFigures[0]!; // первая фигура первого борда
    const occupied = new Set(h.boardFigures.map((f) => f.key));
    const empty = h.boardSlots.find((s) => !occupied.has(s.key))!; // первый свободный слот
    expect(empty).toBeTruthy();
    await dragTo(page, a, empty);
    await page.waitForTimeout(500);
    const g = await hooks(page);
    expect(fig(g, a.id).key).toBe(empty.key); // переехала
  });

  test("фигура заперта в рамке — клампится, не убегает за край", async ({ page }) => {
    const h = await hooks(page);
    const a = h.boardFigures[0]!;
    const rightmost = Math.max(...h.boardSlots.map((s) => s.x));
    await dragTo(page, a, { x: a.x + 4000, y: a.y }, true); // тянем далеко вправо и держим
    const g = await hooks(page);
    await page.mouse.up();
    expect(g.draggingId).toBe(a.id);
    expect(fig(g, a.id).x).toBeLessThan(rightmost + h.cardW); // прижата к рамке, не на +4000
  });

  // zIndex — приватное поле движка (byId), но это ЕДИНСТВЕННЫЙ способ проверить визуальный
  // z-порядок в реальном e2e (не headless-vitest); window.__fd — тот же e2e-хук, что и testHooks.
  const zIndexOf = (page: Page, id: string): Promise<number | undefined> =>
    page.evaluate((cid) => (window as unknown as { __fd: { byId: Map<string, { root: { zIndex: number } }> } }).__fd.byId.get(cid)?.root.zIndex, id);

  test("merge на занятый слот: новая карта визуально СВЕРХУ стопки (регрессия z-order-бага)", async ({ page }) => {
    const h = await hooks(page);
    const mb = h.boards.find((b) => b.title === "свободно (merge)")!;
    const a = mb.figures.find((f) => f.key === "0,0")!; // одиночная карта
    const target = mb.slots.find((s) => s.key === "0,2")!; // занят 2 картами
    await dragTo(page, a, target);
    await page.waitForTimeout(500);
    const occupants = (await hooks(page)).boards.find((b) => b.title === "свободно (merge)")!.figures.filter((f) => f.key === "0,2");
    expect(occupants.map((f) => f.id)).toContain(a.id);
    const zs = await Promise.all(occupants.map((f) => zIndexOf(page, f.id)));
    const aZ = zs[occupants.findIndex((f) => f.id === a.id)]!;
    expect(aZ, "перенесённая карта — выше остальных в своём слоте").toBe(Math.max(...(zs as number[])));
  });

  test("swap на занятый слот: обе фигуры меняются местами (логика onOccupied)", async ({ page }) => {
    const h = await hooks(page);
    const sb = h.boards.find((b) => b.title.includes("пятнашки"))!;
    const a = sb.figures.find((f) => f.key === "0,0")!;
    const b2 = sb.figures.find((f) => f.key === "0,1")!;
    await dragTo(page, a, b2);
    await page.waitForTimeout(400);
    const g = (await hooks(page)).boards.find((b) => b.title.includes("пятнашки"))!;
    expect(g.figures.find((f) => f.id === a.id)!.key).toBe("0,1");
    expect(g.figures.find((f) => f.id === b2.id)!.key).toBe("0,0");
  });

  test("card-пресет «шахматы — съесть»: дроп на занятый слот съедает фигуру (capture)", async ({ page }) => {
    const h = await hooks(page);
    const cb = h.boards.find((b) => b.title === "шахматы — съесть (capture)")!;
    const k = cb.figures.find((f) => f.key === "0,0")!;
    const target = cb.slots.find((s) => s.key === "0,2")!;
    const victim = cb.figures.find((f) => f.key === "0,2")!;
    await dragTo(page, k, target);
    await page.waitForTimeout(600);
    const g = (await hooks(page)).boards.find((b) => b.title === "шахматы — съесть (capture)")!;
    expect(g.figures.find((f) => f.id === k.id)!.key).toBe("0,2"); // атакующий занял слот
    expect(g.figures.some((f) => f.id === victim.id)).toBe(false); // жертва съедена
  });

  test("борд из ФИГУР (Piece): конь переезжает и СЪЕДАЕТ пешку (capture)", async ({ page }) => {
    let h = await hooks(page);
    let cb = h.boards.find((b) => b.title.includes("ФИГУР"))!;
    let idx = h.boards.indexOf(cb);
    const knight = cb.figures.find((f) => f.key === "0,0")!; // ♞
    const empty = cb.slots.find((s) => s.key === "0,1")!;
    await dragTo(page, knight, empty); // переезд в пустой слот
    await page.waitForTimeout(400);
    h = await hooks(page);
    expect(h.boards[idx]!.figures.find((f) => f.id === knight.id)!.key).toBe("0,1");

    // теперь съесть пешку в (0,2)
    cb = h.boards[idx]!;
    const kNow = cb.figures.find((f) => f.id === knight.id)!;
    const pawn = cb.figures.find((f) => f.key === "0,2")!;
    const pawnSlot = cb.slots.find((s) => s.key === "0,2")!;
    await dragTo(page, kNow, pawnSlot);
    await page.waitForTimeout(1000); // capture → сжечь → reap
    const g = await hooks(page);
    const gcb = g.boards[idx]!;
    expect(gcb.figures.find((f) => f.id === knight.id)!.key).toBe("0,2"); // конь занял слот
    expect(gcb.figures.some((f) => f.id === pawn.id)).toBe(false); // пешка съедена
  });

  test("СМЕШАННЫЙ стек: карта+шахмата+фишка в одном слоте; фигуру можно вынести", async ({ page }) => {
    const h = await hooks(page);
    const mb = h.boards.find((b) => b.title.includes("СМЕШАН"))!;
    const idx = h.boards.indexOf(mb);
    expect(mb.figures.filter((f) => f.key === "0,0")).toHaveLength(3); // 3 РАЗНОТИПНЫХ фигуры в одном слоте
    const top = mb.figures.find((f) => f.id === "mix-0,0-2")!; // верх стопки (фишка)
    const slot1 = mb.slots.find((s) => s.key === "0,1")!;
    await dragTo(page, top, slot1);
    await page.waitForTimeout(400);
    const g = await hooks(page);
    expect(g.boards[idx]!.figures.find((f) => f.id === "mix-0,0-2")!.key).toBe("0,1"); // вынесли фишку
    expect(g.boards[idx]!.figures.filter((f) => f.key === "0,0")).toHaveLength(2); // в слоте осталось 2
  });

  // Изолированный мультиселект (selection.ts).
  const clickAt = async (page: Page, p: { x: number; y: number }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.click(box.x + p.x, box.y + p.y);
  };
  const btn = (h: Hooks, label: string) => h.selButtons.find((b) => b.label === label)!;

  test("выделение: вход в режим, тап-выбор (тоггл), снять", async ({ page }) => {
    let h = await hooks(page);
    expect(h.selMode).toBe(false);
    await clickAt(page, btn(h, "выделение")); // вход в режим
    h = await hooks(page);
    expect(h.selMode).toBe(true);

    await clickAt(page, h.selFigures[0]!); // выбрать первую
    await clickAt(page, h.selFigures[1]!); // и вторую
    h = await hooks(page);
    expect(h.selection.sort()).toEqual([h.selFigures[0]!.id, h.selFigures[1]!.id].sort());

    await clickAt(page, h.selFigures[0]!); // тоггл первой — снять
    h = await hooks(page);
    expect(h.selection).toEqual([h.selFigures[1]!.id]);

    await clickAt(page, btn(h, "снять"));
    h = await hooks(page);
    expect(h.selection).toEqual([]); // набор пуст
    expect(h.selMode).toBe(true); // но режим остался
  });

  test("value-правило (цвет): красную нельзя на чёрную, можно на красную", async ({ page }) => {
    const h = await hooks(page);
    const rb = h.boards.find((b) => b.title.includes("свой цвет"))!;
    const idx = h.boards.indexOf(rb);
    // rule-борд: (0,0)=6♥ red, (0,1)=7♠ black, (0,2)=8♦ red
    const red = rb.figures.find((f) => f.key === "0,0")!;
    const blackSlot = rb.slots.find((s) => s.key === "0,1")!;

    await dragTo(page, red, blackSlot); // красную на чёрную — отказ
    await page.waitForTimeout(400);
    let g = await hooks(page);
    expect(g.boards[idx]!.figures.find((f) => f.id === red.id)!.key).toBe("0,0"); // осталась

    const redSlot = rb.slots.find((s) => s.key === "0,2")!;
    await dragTo(page, red, redSlot); // красную на красную — принято
    await page.waitForTimeout(400);
    g = await hooks(page);
    expect(g.boards[idx]!.figures.find((f) => f.id === red.id)!.key).toBe("0,2"); // переехала
  });

  test("пасьянс-правила: Q♥ на A♣-фундамент нельзя, на K♠-стол можно", async ({ page }) => {
    const h = await hooks(page);
    const rb = h.boards.find((b) => b.title.includes("пасьянс"))!;
    const idx = h.boards.indexOf(rb);
    const q = rb.figures.find((f) => f.key === "0,1")!; // Q♥
    const kSlot = rb.slots.find((s) => s.key === "0,0")!; // K♠ (стол)
    const foundSlot = rb.slots.find((s) => s.key === "0,3")!; // A♣ (фундамент)

    await dragTo(page, q, foundSlot); // Q♥ на фундамент A♣ — нельзя (масть/ранг)
    await page.waitForTimeout(400);
    let g = await hooks(page);
    expect(g.boards[idx]!.figures.find((f) => f.id === q.id)!.key).toBe("0,1"); // осталась

    await dragTo(page, q, kSlot); // Q♥ на K♠ — можно (стол: на 1 ниже, разный цвет)
    await page.waitForTimeout(400);
    g = await hooks(page);
    expect(g.boards[idx]!.figures.find((f) => f.id === q.id)!.key).toBe("0,0"); // легла на стол
  });

  test("драг НАБОРА: выделил две → потащил одну → обе переехали в целевой слот", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, btn(h, "выделение"));
    h = await hooks(page);
    await clickAt(page, h.selFigures[0]!); // выбрать A♦ (0,0)
    await clickAt(page, h.selFigures[1]!); // выбрать 7♣ (0,1)
    h = await hooks(page);
    expect(h.selection).toHaveLength(2);
    const board = h.boards.find((b) => b.title.includes("выделение"))!; // select-борд
    const empty = board.slots.find((s) => s.key === "0,3")!; // пустой слот
    // тащим выделенную фигуру (первую) в пустой слот — за ней едет весь набор
    const f0 = h.selFigures[0]!;
    await dragTo(page, f0, empty);
    await page.waitForTimeout(500);
    const g = await hooks(page);
    const sb = g.boards.find((b) => b.title.includes("выделение"))!;
    const at03 = sb.figures.filter((f) => f.key === "0,3").map((f) => f.id).sort();
    expect(at03).toEqual([f0.id, h.selFigures[1]!.id].sort()); // обе в (0,3)
    expect(g.selection).toEqual([]); // набор сброшен после переноса
  });

  test("ИЗОЛЯЦИЯ: в режиме выделения нельзя выбрать фигуру ЧУЖОЙ зоны", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, btn(h, "выделение"));
    // тап по фигуре первого борда (не selZone) — не должна попасть в набор
    await clickAt(page, { x: h.boardFigures[0]!.x, y: h.boardFigures[0]!.y });
    h = await hooks(page);
    expect(h.selection).toEqual([]); // чужая зона не выделяется
  });

  test("«дурак — стопка ≤2»: maxSize реально ограничивает — 3-я карта на занятый(2) слот отклонена", async ({ page }) => {
    const h = await hooks(page);
    const durak = h.boards.find((b) => b.title.includes("дурак"))!;
    const a = durak.figures.find((f) => f.key === "0,0")!;
    const target = durak.slots.find((s) => s.key === "0,1")!;
    await dragTo(page, a, target); // 0,0 -> 0,1 (теперь 2 карты, maxSize=2 достигнут)
    await page.waitForTimeout(400);
    let g = await hooks(page);
    let d = g.boards.find((b) => b.title.includes("дурак"))!;
    expect(d.figures.filter((f) => f.key === "0,1")).toHaveLength(2);

    const c = d.figures.find((f) => f.key === "0,2")!;
    const target2 = d.slots.find((s) => s.key === "0,1")!;
    await dragTo(page, c, target2); // 3-я карта на уже полный (2/2) слот — должна остаться на месте
    await page.waitForTimeout(400);
    g = await hooks(page);
    d = g.boards.find((b) => b.title.includes("дурак"))!;
    expect(d.figures.filter((f) => f.key === "0,1")).toHaveLength(2); // не выросло
    expect(d.figures.find((f) => f.id === c.id)!.key).toBe("0,2"); // осталась на месте
  });

  test("«монополия — кольцо»: 8 слотов по окружности, фигура переезжает в пустой слот кольца", async ({ page }) => {
    const h = await hooks(page);
    const ring = h.boards.find((b) => b.title.includes("монополия"))!;
    expect(ring.slots).toHaveLength(8);
    const a = ring.figures.find((f) => f.key === "ring0")!;
    const target = ring.slots.find((s) => s.key === "ring1")!; // соседний пустой слот кольца
    await dragTo(page, a, target);
    await page.waitForTimeout(400);
    const g = await hooks(page);
    const gring = g.boards.find((b) => b.title.includes("монополия"))!;
    expect(gring.figures.find((f) => f.id === a.id)!.key).toBe("ring1");
  });

  test("Segmented-тумблер «на занятый слот»: клик «swap» реально меняет поведение дропа", async ({ page }) => {
    const h = await hooks(page);
    const free = h.boards.find((b) => b.title === "свободно (merge)")!;
    expect(free.onOccupied).toBe("merge");
    const swapBtn = free.onOccupiedAt[1]!; // порядок options: merge/swap/capture/reject
    await clickAt(page, swapBtn);
    await page.waitForTimeout(150);
    let g = await hooks(page);
    let gfree = g.boards.find((b) => b.title === "свободно (merge)")!;
    expect(gfree.onOccupied).toBe("swap");

    // теперь дроп на занятый слот должен СВАПНУТЬ, а не смёржить
    const a = gfree.figures.find((f) => f.key === "0,0")!;
    const target = gfree.slots.find((s) => s.key === "0,2")!; // занят 2 картами
    const victims = gfree.figures.filter((f) => f.key === "0,2").map((f) => f.id);
    await dragTo(page, a, target);
    await page.waitForTimeout(400);
    g = await hooks(page);
    gfree = g.boards.find((b) => b.title === "свободно (merge)")!;
    // swap меняет содержимое слотов ЦЕЛИКОМ: цель получает только переехавшую карту, а прежний
    // жилец (обе карты) — исходный слот дракнутой. Не 3 карты в 0,2 (это было бы merge).
    expect(gfree.figures.filter((f) => f.key === "0,2")).toHaveLength(1);
    expect(gfree.figures.find((f) => f.id === a.id)!.key).toBe("0,2");
    expect(victims.map((id) => gfree.figures.find((f) => f.id === id)!.key)).toEqual(["0,0", "0,0"]);
  });

  test("демо выделения: тумблер «мультиселект: выкл» — вход в режим выделения блокируется", async ({ page }) => {
    const h = await hooks(page);
    expect(h.selMultiAt.length).toBeGreaterThan(0);
    await clickAt(page, h.selMultiAt[1]!); // "выкл"
    await page.waitForTimeout(150);
    await clickAt(page, btn(h, "выделение"));
    const g = await hooks(page);
    expect(g.selMode).toBe(false); // конфиг контейнера отключил мультиселект — режим не включился
  });

  test("демо выделения: тумблер «сорт набора: выбор» — набор выносится в порядке выбора, не по номиналу", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, h.selSortAt[1]!); // "выбор" вместо "номинал"
    await page.waitForTimeout(150);
    await clickAt(page, btn(h, "выделение"));
    h = await hooks(page);
    // selFigures[0]=A♦(0,0), [1]=7♣(0,1), [2]=Q♠(0,2) — выбираем в обратном порядке (Q♠ затем A♦)
    await clickAt(page, h.selFigures[2]!);
    await clickAt(page, h.selFigures[0]!);
    h = await hooks(page);
    const board = h.boards.find((b) => b.title.includes("выделение"))!;
    const empty = board.slots.find((s) => s.key === "0,3")!;
    await dragTo(page, h.selFigures[2]!, empty);
    await page.waitForTimeout(500);
    const g = await hooks(page);
    const sb = g.boards.find((b) => b.title.includes("выделение"))!;
    const order03 = sb.figures.filter((f) => f.key === "0,3").map((f) => f.id);
    expect(order03).toEqual([h.selFigures[2]!.id, h.selFigures[0]!.id]); // порядок выбора (Q♠, затем A♦), не по рангу
  });

  test("СМЕШАННЫЙ борд: дроп НА занятый смешанный слот — мёржится (onOccupied=merge)", async ({ page }) => {
    const h = await hooks(page);
    const mb = h.boards.find((b) => b.title.includes("СМЕШАН"))!;
    const before = mb.figures.filter((f) => f.key === "0,0").length;
    expect(before).toBe(3); // карта+шахмата+фишка
    const outsider = mb.figures.find((f) => f.key === "0,1")!;
    const target = mb.slots.find((s) => s.key === "0,0")!;
    await dragTo(page, outsider, target);
    await page.waitForTimeout(400);
    const g = await hooks(page);
    const gmb = g.boards.find((b) => b.title.includes("СМЕШАН"))!;
    expect(gmb.figures.filter((f) => f.key === "0,0")).toHaveLength(4); // добавилась поверх (merge)
    expect(gmb.figures.find((f) => f.id === outsider.id)!.key).toBe("0,0");
  });
});
