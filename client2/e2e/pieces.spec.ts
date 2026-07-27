import { test, expect, type Page } from "@playwright/test";

// Ряд «Фишки и фигуры»: не-карточные элементы (Piece) на том же драге/тенях/метках, что и карты.
// Доказательство, что абстракция generic — withDragger/withAnchor и зоны работают на фишках и
// шахматах без единой строчки «для фишек».
test.describe("песочница — фишки и фигуры", () => {
  test.use({ viewport: { width: 900, height: 2200 } }); // «Фигуры» теперь после Карт/Кнопок/Дропзон, ниже по странице

  interface Hooks {
    zones: Record<string, { x: number; y: number }>;
    pieces: { id: string; x: number; y: number }[];
    pieceCount: number;
    soloVis: { label: string; dragger: boolean; anchor: boolean; x: number; y: number }[];
    pileGrip: { x: number; y: number } | null;
    cardW: number;
    draggingId: string | null;
  }
  const hooks = (page: Page): Promise<Hooks> =>
    page.evaluate(() => (window as unknown as { __fd: { testHooks(): Hooks } }).__fd.testHooks());
  const pieceOf = (h: Hooks, id: string) => h.pieces.find((p) => p.id === id)!;

  test.beforeEach(async ({ page }) => {
    await page.goto("/free-desk");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  // Координаты хука — относительно КАНВАСА; мышь бьёт по странице → прибавляем bbox канваса.
  const dragTo = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }, hold = false) => {
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 12 });
    if (!hold) await page.mouse.up();
  };

  test("ряд: 4 фишки + конь + пешка + стопка из 6 фишек; метки на соло-карте и коне", async ({ page }) => {
    const h = await hooks(page);
    // Фигуры РЯДА (без фигур бордов chessb-*/mix-*): 6 одиночных + 6 в стопке.
    const rowPieces = h.pieces.filter((p) => !p.id.startsWith("chessb") && !p.id.startsWith("mix-"));
    expect(rowPieces.length).toBe(12);
    for (const id of ["chip-5", "chip-25", "chip-100", "chip-500", "chess-knight", "chess-pawn"]) {
      expect(h.pieces.some((p) => p.id === id)).toBe(true);
    }
    expect(h.pieces.filter((p) => p.id.startsWith("pile-"))).toHaveLength(6);
    expect(h.pileGrip).not.toBeNull(); // у стопки фишек есть грип целиком
    // Метка generic: не только стопка — соло-карта и одиночный конь тоже её носят.
    expect(h.soloVis.map((s) => s.label)).toEqual(["карта", "конь"]);
    for (const s of h.soloVis) {
      expect(s.dragger).toBe(true); // в покое драггер виден
      expect(s.anchor).toBe(false); // якорь пока молчит
    }
  });

  test("драг фишки двигает сцену (тот же драг, что у карты — не «для фишек»)", async ({ page }) => {
    const h = await hooks(page);
    const chip = pieceOf(h, "chip-25");
    const box = (await page.locator("canvas").boundingBox())!;
    const clip = { x: box.x + chip.x - 80, y: box.y + chip.y - 80, width: 260, height: 200 };
    const before = await page.screenshot({ clip });
    await dragTo(page, chip, { x: chip.x + 140, y: chip.y + 40 }, true);
    await page.waitForTimeout(120);
    const during = await page.screenshot({ clip });
    await page.mouse.up();
    expect(Buffer.compare(before, during)).not.toBe(0);
  });

  test("фишку можно СЖЕЧЬ (Burnable) — исчезает из ряда", async ({ page }) => {
    const h = await hooks(page);
    await dragTo(page, pieceOf(h, "chip-100"), h.zones["СЖЕЧЬ"]!);
    await page.waitForTimeout(1000); // догореть + reap
    const g = await hooks(page);
    expect(g.pieceCount).toBe(h.pieceCount - 1);
    expect(g.pieces.some((p) => p.id === "chip-100")).toBe(false);
  });

  test("фишку НЕЛЬЗЯ перевернуть (не Flippable) — зона игнорит, фишка на месте", async ({ page }) => {
    const h = await hooks(page);
    await dragTo(page, pieceOf(h, "chip-100"), h.zones["ПЕРЕВОРОТ"]!);
    await page.waitForTimeout(700);
    const g = await hooks(page);
    expect(g.pieceCount).toBe(h.pieceCount); // ничего не уничтожено и не «съедено»
    const back = pieceOf(g, "chip-100");
    expect(Math.abs(back.x - pieceOf(h, "chip-100").x)).toBeLessThan(6); // вернулась домой
  });

  test("стопка фишек тянется ЦЕЛИКОМ за грип (GroupDrag на фишках, как пачка карт)", async ({ page }) => {
    const h = await hooks(page);
    const grip = h.pileGrip!;
    const box = (await page.locator("canvas").boundingBox())!;
    const clip = { x: box.x + grip.x - 120, y: box.y + grip.y - 200, width: 240, height: 240 };
    const before = await page.screenshot({ clip });
    await dragTo(page, grip, { x: grip.x + 40, y: grip.y + 160 }, true);
    await page.waitForTimeout(140);
    const during = await page.screenshot({ clip });
    await page.mouse.up();
    expect(Buffer.compare(before, during)).not.toBe(0);
  });

  test("стопку фишек можно сжечь целиком — все 6 уходят", async ({ page }) => {
    const h = await hooks(page);
    await dragTo(page, h.pileGrip!, h.zones["СЖЕЧЬ"]!);
    await page.waitForTimeout(1100);
    const g = await hooks(page);
    expect(g.pieceCount).toBe(h.pieceCount - 6); // вся стопка фишек сгорела
    expect(g.pieces.some((p) => p.id.startsWith("pile-"))).toBe(false);
  });

  test("стопку фишек НЕ перевернуть (фишки не Flippable) — вся возвращается", async ({ page }) => {
    const h = await hooks(page);
    await dragTo(page, h.pileGrip!, h.zones["ПЕРЕВОРОТ"]!);
    await page.waitForTimeout(700);
    const g = await hooks(page);
    expect(g.pieceCount).toBe(h.pieceCount); // флип пачки проигнорирован
  });

  test("сожжённый конь: его драггер гаснет, якорь «когда пусто» загорается (метка на фигуре)", async ({ page }) => {
    const h = await hooks(page);
    await dragTo(page, pieceOf(h, "chess-knight"), h.zones["СЖЕЧЬ"]!);
    await page.waitForTimeout(1000);
    const g = await hooks(page);
    expect(g.pieces.some((p) => p.id === "chess-knight")).toBe(false); // конь сгорел
    const knight = g.soloVis.find((s) => s.label === "конь")!;
    expect(knight.dragger).toBe(false); // тянуть больше нечего
    expect(knight.anchor).toBe(true); // якорь «когда пусто» показался
  });

  test("соло-карта тянется за СВОЮ метку (withDragger на одиночной карте)", async ({ page }) => {
    const h = await hooks(page);
    const grip = h.soloVis.find((s) => s.label === "карта")!; // x,y = позиция грип-метки
    await dragTo(page, grip, { x: grip.x + 60, y: grip.y + 120 }, true);
    const g = await hooks(page);
    await page.mouse.up();
    expect(g.draggingId).toBe("solo-card"); // схвачена именно соло-карта через метку
  });

  // Остальные элементы ряда (chip-25/chip-100/конь) уже покрыты выше индивидуально — эти три
  // раньше существовали только «по факту наличия», без собственного драг/сжечь теста.
  for (const id of ["chip-5", "chip-500", "chess-pawn"]) {
    test(`«${id}» тянется индивидуально (тот же generic-драг)`, async ({ page }) => {
      const h = await hooks(page);
      const p = pieceOf(h, id);
      await dragTo(page, p, { x: p.x + 60, y: p.y + 40 }, true);
      const g = await hooks(page);
      await page.mouse.up();
      expect(g.draggingId).toBe(id);
    });

    test(`«${id}» можно сжечь — исчезает из ряда`, async ({ page }) => {
      const h = await hooks(page);
      await dragTo(page, pieceOf(h, id), h.zones["СЖЕЧЬ"]!);
      await page.waitForTimeout(1000);
      const g = await hooks(page);
      expect(g.pieces.some((p) => p.id === id)).toBe(false);
    });
  }
});
