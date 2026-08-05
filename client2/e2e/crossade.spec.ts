import { test, expect, type Page } from "@playwright/test";

// Crossade на общем слое сцены (этап 7 CROSSADE-DESIGN.md), по образцу solitaire.spec.ts: канвас не
// отдаёт ни DOM-узлов, ни ролей — вся геометрия через дев-хук `window.__cro` (CrossadeGame.tsx).
// Хук указывает то на ЛОББИ (CrossadeLobbyScene — кнопки), то на СТОЛ (CrossadeScene — слоты/карты/
// действия): CrossadeGame монтирует их по очереди в одно и то же место, «join» лобби сносит его и
// поднимает стол.
//
// Каждый тест — СВОЯ комната: заход по кнопке «тестовый стол (боты)» = client().create(TEST_ROOM),
// а не joinById — новая навигация страницы всегда создаёт новый test_room с ботами.
//
// Сервер для этих тестов — ОТДЕЛЬНЫЙ dev-инстанс на :2678 (playwright.config.ts webServer), не
// дефолтный :2567 — чтобы не зависеть от того, поднят ли у владельца свой сервер локально.

interface LobbyHooks {
  buttons: { label: string; x: number; y: number }[];
  error: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TableHooks {
  slots: Record<string, Rect>;
  cards: Record<string, { x: number; y: number; faceUp: boolean; state: string }>;
  seats: Record<string, { x: number; y: number; text: string }>;
  topbar: Record<string, Rect>;
  actions: Record<string, Rect & { visible: boolean }>;
  notice: string;
  zoom: number;
}

type Win = { __cro: { testHooks(): LobbyHooks | TableHooks } };

function isTable(h: LobbyHooks | TableHooks): h is TableHooks {
  return "slots" in h;
}

const rawHooks = (page: Page): Promise<LobbyHooks | TableHooks> =>
  page.evaluate(() => (window as unknown as Win).__cro.testHooks());

async function tableHooks(page: Page): Promise<TableHooks> {
  const h = await rawHooks(page);
  if (!isTable(h)) throw new Error("__cro всё ещё лобби, не стол");
  return h;
}

/** Дожидаемся, пока хук переключится с лобби на стол (комната создана, CrossadeScene смонтирована).
 *  Полёты пружиной и сетевой круг «create → join → первый снимок» щедро укладываются в 15с. */
async function waitForTable(page: Page): Promise<TableHooks> {
  await expect
    .poll(async () => isTable(await rawHooks(page)), { timeout: 15000 })
    .toBe(true);
  await waitForSteadyBoard(page);
  return tableHooks(page);
}

/** Дождаться, пока ГЕОМЕТРИЯ стола перестанет ехать.
 *
 *  Хук переключается на стол по первому снимку, а вписывание доски (fitBoard) успевает переложить
 *  камеру ещё раз — на непрогретом бандле это происходит уже ПОСЛЕ того, как тест прочитал слоты.
 *  Жест, посчитанный по прежним числам, ведёт мышь мимо места: карта поднимается и возвращается
 *  домой, что от «раздача не работает» неотличимо. Тот же приём, что `waitForSteadyCamera` у
 *  сценариев витрины. Не валим тест по таймауту: лучше вести жест по тому, что есть, — падение
 *  тогда покажет настоящую причину, а не «не дождался». */
async function waitForSteadyBoard(page: Page, timeoutMs = 4000): Promise<void> {
  const stamp = async (): Promise<string> => {
    const h = await rawHooks(page);
    if (!isTable(h)) return "";
    const r = h.slots.deck;
    return [h.zoom, r?.x, r?.y, r?.w, Object.keys(h.slots).length].map((n) => Math.round(Number(n) || 0)).join("/");
  };
  const started = Date.now();
  let prev = "";
  for (;;) {
    const now = await stamp();
    if (now && now === prev) return;
    prev = now;
    if (Date.now() - started > timeoutMs) return;
    await page.waitForTimeout(120);
  }
}

/** Зайти в тестовый стол (боты) со свежего лобби: своя чистая комната на каждый вызов. */
async function enterTestTable(page: Page): Promise<TableHooks> {
  await page.goto("/crossade");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  const lobby = await rawHooks(page);
  if (isTable(lobby)) throw new Error("ожидали лобби на свежей навигации, увидели стол");
  const btn = lobby.buttons.find((b) => b.label === "тестовый стол (боты)");
  if (!btn) throw new Error("нет кнопки «тестовый стол (боты)» в лобби");
  await page.mouse.click(btn.x, btn.y);
  return waitForTable(page);
}

/** Счёт места из подписи seatLabels: "Имя[ ♛]\nN" (scene.ts#syncSeats). */
function seatCount(text: string): number {
  const n = Number(text.split("\n").at(-1));
  if (!Number.isFinite(n)) throw new Error(`не число в подписи места: ${JSON.stringify(text)}`);
  return n;
}

/** Своё место — единственное среди seat:* не «bot-N» (боты — TestRoom, server/src/bots.ts).
 *  Возвращает id СЛОТА ("seat:sessionId") — см. crossade/tree.ts#seatSlots. */
function selfSeatId(h: TableHooks): string {
  const id = Object.keys(h.slots).find((k) => k.startsWith("seat:") && !k.startsWith("seat:bot-"));
  if (!id) throw new Error("своё место не найдено среди слотов");
  return id;
}

/** h.seats (подписи мест, scene.ts#syncSeats) индексирован ГОЛЫМ sessionId, а h.slots (дропзоны,
 *  тот же tree.ts) — префиксом "seat:" — два разных источника с разным ключом на один и тот же
 *  sessionId. Помогает не перепутать при чтении счёта по id слота. */
const seatLabelOf = (h: TableHooks, slotId: string): string => h.seats[slotId.slice("seat:".length)]!.text;

const center = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Карты своей руки на экране: слот "hand" всегда есть в дереве (даже пустой), а карты руки лежат
 *  в его РЯДУ — той же экранной Y, что и центр слота (linear() по оси x, см. crossade/tree.ts). */
function handCardsOf(h: TableHooks): Array<[string, { x: number; y: number; faceUp: boolean; state: string }]> {
  const rowY = center(h.slots.hand!).y;
  return Object.entries(h.cards)
    .filter(([, c]) => Math.abs(c.y - rowY) < 5)
    .sort((a, b) => a[1].x - b[1].x);
}

/** Драг мышью — общий приём всего проекта (см. solitaire.spec.ts): down → move шагами → up. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.mouse.up();
}

// Полёт пружиной по проекту — 1–2с (CLAUDE.md/solitaire.spec.ts); тайминги ниже щедрее этого.
const FLIGHT = 1600;

test.describe("Crossade", () => {
  // Аккаунт — в localStorage (net/account.ts#ACCOUNT_STORAGE_KEY); чистим ДО того, как страница
  // успеет что-то в него записать (addInitScript выполняется раньше любого скрипта приложения).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test("лобби → стол: 4 места (я + три бота), у всех счёт 0", async ({ page }) => {
    const h = await enterTestTable(page);
    const seatIds = Object.keys(h.slots).filter((id) => id.startsWith("seat:"));
    expect(seatIds).toHaveLength(4);
    for (const id of seatIds) {
      expect(seatCount(seatLabelOf(h, id)), id).toBe(0);
    }
  });

  test("раздача драгом: верхняя карта колоды → место бота, счёт бота стал 1, notice пуст", async ({ page }) => {
    const h = await enterTestTable(page);
    const deckC = center(h.slots.deck!);
    const botSeatC = center(h.slots["seat:bot-1"]!);

    await drag(page, deckC, botSeatC);
    await page.waitForTimeout(FLIGHT);

    const after = await tableHooks(page);
    expect(seatCount(seatLabelOf(after, "seat:bot-1"))).toBe(1);
    expect(after.notice).toBe("");
  });

  test("ГОУ! → взять карту: в руке 1 открытая, счёт своего места 1", async ({ page }) => {
    const h = await enterTestTable(page);

    await page.mouse.click(h.actions.go!.x, h.actions.go!.y);
    await page.waitForTimeout(500);

    const afterGo = await tableHooks(page);
    const deckC = center(afterGo.slots.deck!);
    // Тап (down/up БЕЗ движения) по верхней карте колоды: тянуть некуда, дроп резолвится "мимо
    // слота" → freeMode интерпретирует это как "взять" (scene.ts#resolveDrop).
    await page.mouse.click(deckC.x, deckC.y);
    await page.waitForTimeout(FLIGHT);

    const after = await tableHooks(page);
    const self = selfSeatId(after);
    expect(seatCount(seatLabelOf(after, self))).toBe(1);

    const hand = handCardsOf(after);
    expect(hand).toHaveLength(1);
    expect(hand[0]![1].faceUp).toBe(true);
  });

  test("драг в сброс: своя рука пуста, счёт места 0", async ({ page }) => {
    const h = await enterTestTable(page);

    await page.mouse.click(h.actions.go!.x, h.actions.go!.y);
    await page.waitForTimeout(500);
    const afterGo = await tableHooks(page);
    const deckC = center(afterGo.slots.deck!);
    await page.mouse.click(deckC.x, deckC.y); // взять верхнюю карту в руку (freeMode)
    await page.waitForTimeout(FLIGHT);

    const withCard = await tableHooks(page);
    const hand = handCardsOf(withCard);
    expect(hand).toHaveLength(1);
    const [, card] = hand[0]!;
    const discardC = center(withCard.slots.discard!);

    await drag(page, { x: card.x, y: card.y }, discardC);
    await page.waitForTimeout(FLIGHT);

    const after = await tableHooks(page);
    const self = selfSeatId(after);
    expect(seatCount(seatLabelOf(after, self))).toBe(0);
    expect(handCardsOf(after)).toHaveLength(0);
  });

  test("реордер держится: перестановка внутри своей руки", async ({ page }) => {
    const h = await enterTestTable(page);
    const self = selfSeatId(h);
    const selfSeatC = center(h.slots[self]!);

    // Раздать себе ДВЕ карты драгом (в лобби, дилер — это мы: первый живой игрок в test_room).
    await drag(page, center(h.slots.deck!), selfSeatC);
    await page.waitForTimeout(FLIGHT);
    const afterFirst = await tableHooks(page);
    await drag(page, center(afterFirst.slots.deck!), selfSeatC);
    await page.waitForTimeout(FLIGHT);

    const before = await tableHooks(page);
    const hand = handCardsOf(before);
    expect(hand).toHaveLength(2);
    const [leftId, left] = hand[0]!;
    const [rightId, right] = hand[1]!;

    // Тащим ЛЕВУЮ карту внутрь слота hand, ПРАВЕЕ второй — но не за пределы бокса дропзоны
    // (dropTarget мерит его точно по картам, см. slot/slot.ts#within): чуть за центр правой карты,
    // с запасом от её правого края. Шаг между картами уже несёт масштаб экрана (zoom), поэтому
    // смещение считаем ДОЛЕЙ шага, а не «голым» пикселем.
    const step = right.x - left.x;
    const dropX = right.x + step * 0.25;
    await drag(page, { x: left.x, y: left.y }, { x: dropX, y: right.y });
    await page.waitForTimeout(FLIGHT);

    const after = await tableHooks(page);
    const reordered = handCardsOf(after);
    expect(reordered).toHaveLength(2);
    expect(reordered.map(([id]) => id)).toEqual([rightId, leftId]);
  });
});
