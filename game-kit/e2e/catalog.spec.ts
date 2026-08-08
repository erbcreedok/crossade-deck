// Ids follow docs/test-plan.md — a failing id names the scenario and the state.
//
// These tests compare PICTURES against each other, never against a stored baseline. A baseline
// would have to be looked at by a human to be worth anything, and a screenshot nobody looked at
// is a file that gets blessed on every failure. Two scenes that MUST differ, and two that must
// not, prove the renderer is doing its job without anyone signing off a golden image.

import { expect, test, type Locator, type Page } from "@playwright/test";

const IFRAME = (id: string, globals = "") =>
  `/iframe.html?id=${id}&viewMode=story${globals ? `&globals=${globals}` : ""}`;

/**
 * Two clips of the SAME frame: the middle of the canvas, and an equal rectangle beside it that
 * is known to be empty. Everything is compared inside ONE page load, because comparing two
 * navigations turned out to be a coin toss — a WebGL frame is not guaranteed to be on the glass
 * when a capture of the next document lands, and the suite then blames the code.
 *
 * The offset is 220px — TEN steps of the stage's 22px dotted grid — so both clips catch the
 * pattern at the same phase. Off-phase they would differ by the dots alone, and the "a box
 * draws nothing" test would pass for a reason that has nothing to do with boxes.
 */
const GRID = 22;
const SIDE = GRID * 10;

async function centreAndBeside(page: Page, canvas: Locator): Promise<[Buffer, Buffer]> {
  const box = (await canvas.boundingBox())!;
  const y = box.y + box.height / 2 - SIDE / 2;
  const x = box.x + box.width / 2 - SIDE / 2;
  const shot = (left: number) => page.screenshot({ clip: { x: left, y, width: SIDE, height: SIDE } });
  return [await shot(x), await shot(x - SIDE)];
}

/**
 * The middle of the canvas alone, for comparisons that stay on ONE page (an interaction) or
 * that were shown to survive a navigation. Away from the corner where the scene prints its
 * note: that note is ordinary DOM over the stage, and a full-element capture would differ
 * between two scenes because of a SENTENCE.
 */
async function middle(page: Page, canvas: Locator): Promise<Buffer> {
  const box = (await canvas.boundingBox())!;
  return page.screenshot({
    clip: { x: box.x + box.width / 2 - SIDE / 2, y: box.y + box.height / 2 - SIDE / 2, width: SIDE, height: SIDE },
  });
}

async function openScene(page: Page, id: string, globals = ""): Promise<Locator> {
  await page.goto(IFRAME(id, globals));
  // The scene raises this only after the renderer is up AND a frame has been presented. The
  // alternative is a sleep, which is how a browser suite turns flaky and then gets ignored.
  await page.locator("[data-painted]").first().waitFor({ state: "attached" });
  return page.locator("canvas").first();
}

test("e2e.pixi-actually-paints — the one claim no headless layer can make", async ({ page }) => {
  // The middle of the plate scene must differ from the empty stage beside it. Nothing above
  // this line can make that claim: the plan is a pure function, and jsdom has no WebGL, so
  // "a square was planned" and "a square is on the glass" are two different statements.
  const [middle, beside] = await centreAndBeside(page, await openScene(page, "start-atoms-surfaced--plate"));
  expect(middle.equals(beside)).toBe(false);
});

test("e2e.a-box-alone-draws-nothing — the ladder's claim, on real glass", async ({ page }) => {
  // The other half of the same argument, and the one the catalog is built to teach: a box is
  // REAL and INVISIBLE. Its middle has to be pixel-identical to the empty stage next to it.
  const [middle, beside] = await centreAndBeside(page, await openScene(page, "start-atoms-bounded--box"));
  expect(middle.equals(beside)).toBe(true);
});

test("e2e.hud-unit-drives-the-picture — the etalon is a size, and it is visible", async ({ page }) => {
  const canvas = await openScene(page, "start-atoms-surfaced--plate");
  await page.locator("[data-hud-unit]").selectOption("34");
  const small = await middle(page, canvas);
  await page.locator("[data-hud-unit]").selectOption("60");
  const large = await middle(page, canvas);
  expect(small.equals(large)).toBe(false);
});

test("e2e.layout-decides-the-picture — free and row differ in one word", async ({ page }) => {
  // The two stories build the SAME tree, down to the children's poses. Only the layout's name
  // differs, so an identical picture would mean the layout was never consulted.
  const free = await middle(page, await openScene(page, "start-atoms-container--free"));
  const row = await middle(page, await openScene(page, "start-atoms-container--row"));
  expect(free.equals(row)).toBe(false);
});

test("e2e.theme-reaches-the-canvas — a viewer setting is not just CSS", async ({ page }) => {
  // The canvas has no cascade: a palette token is resolved to a colour by the renderer itself.
  // If the theme stopped short of it, the page would go light and the cards would not.
  const dark = await middle(page, await openScene(page, "start-atoms-surfaced--plate", "theme:dark"));
  const light = await middle(page, await openScene(page, "start-atoms-surfaced--plate", "theme:light"));
  expect(dark.equals(light)).toBe(false);
});

test("e2e.story-smoke — every story opens without a word in the console", async ({ page, request }) => {
  const index = (await (await request.get("/index.json")).json()) as {
    entries: Record<string, { id: string; type: string }>;
  };
  const stories = Object.values(index.entries).filter((e) => e.type === "story");
  expect(stories.length).toBeGreaterThan(0);

  const complaints: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") complaints.push(`${page.url()} :: ${m.text()}`);
  });
  page.on("pageerror", (e) => complaints.push(`${page.url()} :: ${e.message}`));

  for (const story of stories) {
    await openScene(page, story.id);
  }
  expect(complaints).toEqual([]);
});

test("e2e.bounds-layer-reveals-the-box — the invisible becomes visible, on demand", async ({ page }) => {
  // `Bounded/Box` is the scene that draws nothing at all. Pressing the toggle has to put an
  // outline on the glass where the model always said a box was — and nothing above this line
  // can show that, because nothing above this line draws.
  const canvas = await openScene(page, "start-atoms-bounded--box");
  const [before, beside] = await centreAndBeside(page, canvas);
  expect(before.equals(beside)).toBe(true); // nothing there yet, as the ladder promises

  await page.locator("[data-debug-bounds]").click();
  const [after] = await centreAndBeside(page, canvas);
  expect(after.equals(before)).toBe(false);
});

test("e2e.toolbar-fits-a-phone — every control on the row, on the narrowest screen", async ({ page }) => {
  // The row grew a second control and the etalon select, sized to its longest option, pushed
  // it clean off the screen. Nothing headless can see that: it is a layout answer, and it only
  // goes wrong at a width nobody develops at.
  await page.setViewportSize({ width: 390, height: 844 });
  await openScene(page, "start-atoms-bounded--box");

  const bar = page.locator("[data-scene-toolbar]").first();
  const box = (await bar.boundingBox())!;
  for (const control of ["[data-hud-unit]", "[data-debug-bounds]"]) {
    const rect = (await page.locator(control).first().boundingBox())!;
    expect(rect.x, control).toBeGreaterThanOrEqual(box.x - 0.5);
    expect(rect.x + rect.width, control).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
  // And the row does not hide the overflow by scrolling instead.
  expect(await bar.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
});

test("e2e.controls-are-there-and-live — an atom's fields are its arguments", async ({ page }) => {
  // The panel promised in half the comments in this repo did not exist: only addon-docs was
  // installed, and no story declared a single argument. This is the check that says otherwise.
  await page.goto("/?path=/story/start-atoms-surfaced--plate");
  const panel = page.locator("#storybook-panel-root");
  await panel.getByText("Controls", { exact: false }).first().waitFor({ timeout: 30000 });

  // And it is not the empty "this story is not configured" state: the fields are listed.
  await expect(panel.getByText("surface", { exact: true }).first()).toBeVisible({ timeout: 30000 });
});

test("e2e.a-rebuild-does-not-leak-a-context — a slider is dragged, not clicked once", async ({ page }) => {
  // Storybook rebuilds the story on every argument change and never retires the old element.
  // A browser gives out about a dozen WebGL contexts, so an undisposed scene per step is a
  // catalog that dies partway through a drag.
  await page.goto("/iframe.html?id=start-atoms-bounded--box&viewMode=story&args=w:2");
  await page.locator("[data-painted]").first().waitFor({ state: "attached" });

  const warnings: string[] = [];
  page.on("console", (m) => /context/i.test(m.text()) && warnings.push(m.text()));

  for (const w of [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 1.2, 2.4, 3.6, 0.8, 1.6, 2.8, 3.2]) {
    await page.goto(`/iframe.html?id=start-atoms-bounded--box&viewMode=story&args=w:${w}`);
    await page.locator("[data-painted]").first().waitFor({ state: "attached" });
  }

  // One canvas on the page at the end, and nothing complaining about lost contexts.
  expect(await page.locator("canvas").count()).toBe(1);
  expect(warnings).toEqual([]);
});

test("e2e.id-is-an-input — a node is NAMED, and the catalog lets you name one", async ({ page }) => {
  // The Node page argues that an id comes from outside — the spec, or the world's orchestrator
  // — and never from a counter hidden inside `node()`. A text control makes that operable
  // instead of merely asserted, so it is checked the way a reader would check it: type a name,
  // read the tree.
  //
  // Through the MANAGER, not the channel: the scene publishes while it is being built, so a
  // listener attached afterwards waits for an event that has already gone by.
  await page.goto("/?path=/story/start-basics-node--bare&args=id:discard");
  const panel = page.locator("#storybook-panel-root");
  await panel.getByText("Node tree").first().click();
  await expect(panel.getByText("discard", { exact: false }).first()).toBeVisible({ timeout: 30000 });
});

test("e2e.sidebar-is-the-ladder — the tree teaches in dependency order", async ({ page }) => {
  // Sorting happens in the MANAGER, so no headless test can see it: `index.json` carries the
  // stories in discovery order and knows nothing about how they are shown. This is the only
  // place the reader's actual first impression is checked.
  await page.goto("/");
  const tree = page.locator("#storybook-explorer-tree");
  await tree.waitFor();

  // Groups arrive collapsed apart from the selected branch; open every one so the whole ladder
  // is on screen at once.
  for (const name of ["Basics", "Atoms"]) {
    const group = tree.getByText(name, { exact: true });
    if (await group.count()) await group.first().click();
  }

  const labels = (await tree.locator("a, button").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  const at = (name: string) => labels.indexOf(name);

  expect(at("Basics")).toBeGreaterThanOrEqual(0);
  expect(at("Basics")).toBeLessThan(at("Atoms"));
  const rungs = ["Bounded", "Surfaced", "Transformable", "Container"].map(at);
  expect(rungs.every((i) => i >= 0)).toBe(true);
  expect(rungs).toEqual([...rungs].sort((a, b) => a - b));
});
