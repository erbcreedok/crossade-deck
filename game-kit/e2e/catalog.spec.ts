// Ids follow docs/test-plan/ — one file per layer — a failing id names the scenario and the state.
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

/**
 * Open anything the index lists, including a page that has no scene at all.
 *
 * The prose pages (Introduction, Getting Started) carry an empty story underneath them, because
 * a docs entry without one does not exist as far as Storybook is concerned. Waiting for a
 * painted frame there would hang until the timeout and report it as a broken story.
 */
async function openEntry(page: Page, id: string): Promise<void> {
  await page.goto(IFRAME(id));
  await page.waitForLoadState("domcontentloaded");
  // ASK WHETHER THERE IS A SCENE AT ALL before waiting for one to paint. A prose page has no
  // canvas and never will, so waiting on the painted flag there is four seconds of nothing —
  // and the smoke test pays it once per page. With the Engine section that alone pushed the run
  // past its timeout, and the failure read as a broken story rather than as arithmetic.
  const hasScene = await page
    .locator("canvas")
    .first()
    .waitFor({ state: "attached", timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (!hasScene) return;
  await page
    .locator("[data-painted]")
    .first()
    .waitFor({ state: "attached", timeout: 4000 })
    .catch(() => undefined);
}

test("e2e.pixi-actually-paints — the one claim no headless layer can make", async ({ page }) => {
  // The middle of the plate scene must differ from the empty stage beside it. Nothing above
  // this line can make that claim: the plan is a pure function, and jsdom has no WebGL, so
  // "a square was planned" and "a square is on the glass" are two different statements.
  const [middle, beside] = await centreAndBeside(page, await openScene(page, "atoms-surfaced--plate"));
  expect(middle.equals(beside)).toBe(false);
});

test("e2e.a-box-alone-draws-nothing — the ladder's claim, on real glass", async ({ page }) => {
  // The other half of the same argument, and the one the catalog is built to teach: a box is
  // REAL and INVISIBLE. Its middle has to be pixel-identical to the empty stage next to it.
  //
  // The outline is switched OFF first, because this section starts it on — a page about the
  // invisible that opens on an empty stage reads as broken. Off, the claim is unchanged: what
  // the hairline showed was tooling, not the box.
  const canvas = await openScene(page, "atoms-bounded--point");
  await page.locator("[data-debug-bounds]").click();
  const [middle, beside] = await centreAndBeside(page, canvas);
  expect(middle.equals(beside)).toBe(true);
});

test("e2e.hud-unit-drives-the-picture — the etalon is a size, and it is visible", async ({ page }) => {
  const canvas = await openScene(page, "atoms-surfaced--plate");
  await page.locator("[data-hud-unit]").selectOption("34");
  const small = await middle(page, canvas);
  await page.locator("[data-hud-unit]").selectOption("60");
  const large = await middle(page, canvas);
  expect(small.equals(large)).toBe(false);
});

test("e2e.layout-decides-the-picture — free and row differ in one word", async ({ page }) => {
  // The two stories build the SAME tree, down to the children's poses. Only the layout's name
  // differs, so an identical picture would mean the layout was never consulted.
  const free = await middle(page, await openScene(page, "atoms-container--free"));
  const row = await middle(page, await openScene(page, "atoms-container--row"));
  expect(free.equals(row)).toBe(false);
});

test("e2e.theme-reaches-the-canvas — a viewer setting is not just CSS", async ({ page }) => {
  // The canvas has no cascade: a palette token is resolved to a colour by the renderer itself.
  // If the theme stopped short of it, the page would go light and the cards would not.
  const dark = await middle(page, await openScene(page, "atoms-surfaced--plate", "theme:dark"));
  const light = await middle(page, await openScene(page, "atoms-surfaced--plate", "theme:light"));
  expect(dark.equals(light)).toBe(false);
});

test("e2e.grid-reaches-the-glass — a ruler nobody can see is not a ruler", async ({ page }) => {
  // Same argument as the bounds layer: the plan can say "nine lines" and be perfectly right
  // while nothing reaches the canvas. Only the glass settles it.
  //
  // `Bounded/Point` because it starts with the outline ON and paints nothing else, so the only
  // thing that can change between these two captures is the grid.
  const canvas = await openScene(page, "atoms-bounded--point");
  const before = await middle(page, canvas);
  await page.locator("[data-debug-grid]").click();
  const after = await middle(page, canvas);
  expect(before.equals(after)).toBe(false);

  // And it goes away again. A layer that only ever appears would pass a test that never turned
  // it off — the same hole the bounds test had.
  await page.locator("[data-debug-grid]").click();
  expect((await middle(page, canvas)).equals(before)).toBe(true);
});

test("e2e.bounds-layer-reveals-the-box — the invisible becomes visible, on demand", async ({ page }) => {
  // `Bounded/Path` draws nothing at all, and its box is a real nonzero shape — the toggle has to
  // put an outline on the glass where the model always said a box was, and take it away again.
  //
  // The section starts the outline ON, so the round trip runs the other way round. Both halves
  // are asserted: a toggle that only ever adds would pass a test that never turned it off.
  const canvas = await openScene(page, "atoms-bounded--path");
  const [shown] = await centreAndBeside(page, canvas);

  await page.locator("[data-debug-bounds]").click();
  const [hidden, beside] = await centreAndBeside(page, canvas);
  expect(hidden.equals(beside)).toBe(true); // nothing there, as the ladder promises
  expect(hidden.equals(shown)).toBe(false);

  await page.locator("[data-debug-bounds]").click();
  const [again] = await centreAndBeside(page, canvas);
  expect(again.equals(shown)).toBe(true);
});

test("e2e.the-origin-is-the-middle-of-the-block — chrome does not push the scene down", async ({ page }) => {
  // The origin of a scene is the centre of the VIEW, so anything that takes height out of the
  // view moves the whole picture. The toolbar used to be a grid track above it: the square
  // everything is measured from sat half a row below the middle of the block, 15px at this
  // size and more on a phone, where the row is taller. Only a browser can see it — jsdom has
  // no layout, and the plan is right either way.
  const canvas = await openScene(page, "atoms-surfaced--plate");
  const block = page.locator("[data-painted]").first();
  const outer = (await block.boundingBox())!;

  // Where the paint actually landed, read off the glass rather than assumed from the plan.
  const painted = await canvas.evaluate((view: HTMLCanvasElement) => {
    const copy = document.createElement("canvas");
    copy.width = view.width;
    copy.height = view.height;
    const g = copy.getContext("2d")!;
    g.drawImage(view, 0, 0);
    const px = g.getImageData(0, 0, copy.width, copy.height).data;
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = 0; y < copy.height; y += 1) {
      for (let x = 0; x < copy.width; x += 1) {
        if (px[(y * copy.width + x) * 4 + 3]! > 8) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    const scale = view.getBoundingClientRect().width / view.width; // backing px to css px
    const rect = view.getBoundingClientRect();
    return { x: rect.x + ((minX + maxX) / 2) * scale, y: rect.y + ((minY + maxY) / 2) * scale };
  });

  // Within a pixel, not exactly: a bbox measured from pixels counts both edge columns, so a
  // perfectly centred square reads half a pixel light. The fault this guards against was 15.
  expect(Math.abs(painted.x - (outer.x + outer.width / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(painted.y - (outer.y + outer.height / 2))).toBeLessThanOrEqual(1);
});

test("e2e.toolbar-fits-a-phone — every control on the row, on the narrowest screen", async ({ page }) => {
  // The row grew a second control and the etalon select, sized to its longest option, pushed
  // it clean off the screen. Nothing headless can see that: it is a layout answer, and it only
  // goes wrong at a width nobody develops at.
  await page.setViewportSize({ width: 390, height: 844 });
  await openScene(page, "atoms-bounded--point");

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
  // `Plate` writes the whole record, so its panel is the fullest one in the catalog — the
  // record's fields and the shape's, every one of them a control a reader can reach.
  await page.goto("/?path=/story/atoms-surfaced--plate");
  const panel = page.locator("#storybook-panel-root");
  await panel.getByText("Controls", { exact: false }).first().waitFor({ timeout: 30000 });

  // And it is not the empty "this story is not configured" state: the fields are listed.
  await expect(panel.getByText("radius", { exact: true }).first()).toBeVisible({ timeout: 30000 });
});

test("e2e.a-rebuild-does-not-leak-a-context — a slider is dragged, not clicked once", async ({ page }) => {
  // Storybook rebuilds the story on every argument change and never retires the old element.
  // A browser gives out about a dozen WebGL contexts, so an undisposed scene per step is a
  // catalog that dies partway through a drag.
  await page.goto("/iframe.html?id=presets-bounds--rect&viewMode=story&args=w:2");
  await page.locator("[data-painted]").first().waitFor({ state: "attached" });

  const warnings: string[] = [];
  page.on("console", (m) => /context/i.test(m.text()) && warnings.push(m.text()));

  for (const w of [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 1.2, 2.4, 3.6, 0.8, 1.6, 2.8, 3.2]) {
    await page.goto(`/iframe.html?id=presets-bounds--rect&viewMode=story&args=w:${w}`);
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
  await page.goto("/?path=/story/basics-node--bare&args=id:discard");
  const panel = page.locator("#storybook-panel-root");
  await panel.getByText("Node tree").first().click();
  await expect(panel.getByText("discard", { exact: false }).first()).toBeVisible({ timeout: 30000 });
});

test("e2e.a-dead-link-lands-somewhere — a name that is gone is not a dead end", async ({ page }) => {
  // Storybook remembers the last story a reader had open, in localStorage, per browser. This
  // address used to serve a DIFFERENT catalog, so anyone who visited it before still asks for a
  // story that no longer exists — and on a phone, where the sidebar is collapsed, the error
  // page is a white screen with no way out. The same holds for every link ever shared.
  await page.goto("/?path=/docs/mechanics-boards--docs");
  await page.waitForFunction(() => window.location.search.includes("start-"), null, { timeout: 30000 });

  // And where it lands is the Introduction — the first entry of the ladder, which is exactly
  // where somebody arriving on a broken link should find themselves. Not a working URL merely:
  // a page with something on it.
  expect(page.url()).toContain("introduction");
  const preview = page.frameLocator("iframe#storybook-preview-iframe");
  await expect(preview.locator("body")).toContainText("game-kit", { timeout: 30000 });
});

test("e2e.code-sits-beside-controls — story mode answers 'and how do I write this'", async ({ page }) => {
  // In docs mode the block under the canvas answers it; in story mode nothing did, and a live
  // scene is where the question is loudest — the reader is looking at the result with no way
  // back to the lines that made it.
  await page.goto("/?path=/story/basics-root--with-children");
  const panel = page.locator("#storybook-panel-root");
  await panel.getByText("Code", { exact: true }).first().click();

  // The kit's own door, not the catalog's shell: `scene` exists on this website and nowhere
  // else, so a snippet naming it is a snippet nobody can run.
  await expect(panel.locator("pre")).toContainText("mount(document.querySelector", { timeout: 30000 });
  await expect(panel.locator("pre")).not.toContainText("scene(");
});

test("e2e.code-survives-a-late-opening — a panel behind a drawer still has something in it", async ({ page }) => {
  // On a phone the panel section is CLOSED at load: this panel mounts when the reader opens the
  // drawer, long after the story rendered. While the snippet arrived as an event it was gone by
  // then — delivered once, to whoever was already listening — and the panel came up empty with
  // its copy button sitting over nothing. The desktop test above could never have caught it:
  // there the panel is mounted before the story renders.
  await page.setViewportSize({ width: 390, height: 844 });
  // The panel is asked for BY ID in the URL rather than by clicking its tab. On a phone the tab
  // strip scrolls, so an installed addon can push a tab out of view — clicking it then succeeds
  // against something nobody can see, and the failure reads as "the panel is empty" rather than
  // "the panel was never opened". That is exactly what installing `addon-interactions` did here.
  await page.goto("/?path=/story/basics-node--bare&addonPanel=game-kit%2Fviewer%2Fcode");
  await page.locator('button[title="Open addon panel"]').click();
  const panel = page.locator("#storybook-panel-root");
  await expect(panel.locator("pre")).toContainText("mount(document.querySelector", { timeout: 30000 });
});

test("e2e.code-is-read-not-decoded — colour, and a copy button that stays put", async ({ page }) => {
  // Two complaints about the same panel, and both were the cost of a second implementation of a
  // block Storybook already has: a grey wall of text, and a copy button positioned against the
  // SCROLLING content, so it sailed off with the code the moment anyone scrolled.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?path=/story/basics-root--with-children&addonPanel=game-kit%2Fviewer%2Fcode");
  await page.locator('button[title="Open addon panel"]').click();
  const panel = page.locator("#storybook-panel-root");

  // Highlighted: a wall of one colour is a listing nobody reads.
  await expect(panel.locator("span.token").first()).toBeVisible({ timeout: 30000 });

  const copy = panel.locator("button", { hasText: /^copy$/i }).first();
  const before = (await copy.boundingBox())!;
  await panel.evaluate((root) => {
    root.querySelectorAll("pre, [class*=scroll]").forEach((el) => {
      el.scrollLeft = 300;
      el.scrollTop = 100;
    });
  });
  const after = (await copy.boundingBox())!;
  expect([Math.round(after.x), Math.round(after.y)]).toEqual([Math.round(before.x), Math.round(before.y)]);
});

test("e2e.new-data-keeps-the-viewer — an argument is not a reason to reset the canvas", async ({ page }) => {
  // Set the etalon and the bounds layer, then change something else entirely. Both are the
  // VIEWER plane — who is looking — and an argument is the data being looked at. They used to
  // reset together, because a re-render rebuilt the whole shell around them.
  // Through the manager, because that is where a control lives: the story is re-rendered in
  // place, which is the case that was broken. A fresh page load resets everything anyway and
  // would prove nothing.
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/?path=/story/presets-bounds--rect");
  const preview = page.frameLocator("iframe#storybook-preview-iframe");
  await preview.locator("[data-painted]").first().waitFor({ state: "attached", timeout: 30000 });

  await preview.locator("[data-hud-unit]").selectOption("34");
  // Off, not on: this section starts it on, and a toggle left at its default would prove
  // nothing about surviving a re-render.
  await preview.locator("[data-debug-bounds]").click();

  const width = page.locator("#storybook-panel-root #control-w");
  await width.fill("2");
  await width.press("Enter");

  await expect(preview.locator("[data-hud-unit]")).toHaveValue("34");
  await expect(preview.locator("[data-debug-bounds]")).toHaveAttribute("aria-pressed", "false");
  // And the new data did arrive: the note under the scene is re-read on every draw.
  await expect(preview.locator("[data-scene-toolbar]")).toBeVisible();
});

test("e2e.the-card-keeps-its-own-type — the docs sheet stops at sb-unstyled", async ({ page }) => {
  // A docs page restyles everything inside it BY TAG — a rule per tag, wrapped in :where() — so
  // it beats a font a parent merely passes down. The tab heads came out in the docs body font
  // at 16px while the button around them said mono 11px, and the tree needed a rule of its own
  // to stay readable. `sb-unstyled` on the card takes the whole subtree out of that sheet.
  await page.goto("/?path=/docs/basics-node--docs");
  const preview = page.frameLocator("iframe#storybook-preview-iframe");
  await expect(preview.locator("[data-inspector-tree]").first()).toBeVisible({ timeout: 30000 });

  const type = await page.frames()[1]!.evaluate(() => {
    const read = (sel: string) => {
      const cs = getComputedStyle(document.querySelector(sel)!);
      return `${cs.fontFamily.split(",")[0]} ${cs.fontSize}`;
    };
    // The tree's own span, not just its box: the docs sheet reaches descendants, so a check on
    // the container alone would pass while the text inside it was still restyled.
    return { tab: read('[role="tab"]'), span: read("[data-inspector-tree] span") };
  });
  expect(type.tab).toBe("ui-monospace 11px");
  expect(type.span).toBe("ui-monospace 12px");
});

test("e2e.the-manager-wears-the-tokens — a panel is drawn with var() and nothing else", async ({ page }) => {
  // Every size and colour in our panels is `var(--gk-…)`. The stylesheet used to be installed
  // from the settings component's effect, and on a phone the sidebar is CLOSED at load — so it
  // never mounted, and every one of those values resolved to nothing. The visible symptom was
  // the copy button in the top-left corner: `right: var(--gk-space-m)` with nothing behind it
  // is not a position. Read WITHOUT opening the sidebar, because opening it hides the bug.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?path=/story/basics-node--bare");
  await expect
    .poll(
      () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--gk-space-m").trim()),
      { timeout: 30000 },
    )
    .not.toBe("");
});

test("e2e.docs-has-controls-too — one card, two views of the same story", async ({ page }) => {
  // Story mode gives a reader knobs and no prose; docs gave prose and no knobs. The page
  // somebody actually learns from is the one with both, and they share a card because they are
  // two ways of looking at one scene rather than two features.
  await page.goto("/?path=/docs/atoms-bounded--docs");
  const preview = page.frameLocator("iframe#storybook-preview-iframe");
  // The scene here PAINTS, so its card and its listing start folded: the page is prose first,
  // and a card that opens itself under every canvas pushes the next paragraph below the fold.
  // The listing hides behind its toggle — asserted through the toggle's own label, because
  // `.docblock-source` is also what a PROSE code fence renders as, and those stay visible.
  const tabs = preview.getByRole("tab", { name: "controls" });
  await tabs.first().waitFor({ timeout: 30000 });
  await expect(preview.locator("[data-inspector-tree]")).toHaveCount(0);
  await expect(preview.getByRole("button", { name: "Show code" }).first()).toBeVisible();
  await expect(preview.getByRole("button", { name: "Hide code" })).toHaveCount(0);

  // Every card on the page, not the first: a section may hold several stories, and a hidden
  // tree is REMOVED from the DOM — so `.first()` quietly slides to the next card's tree and the
  // assertion passes or fails for a reason that has nothing to do with the claim. Picking a
  // view is asking to see it, so a tab click also unfolds the card.
  for (let i = 0; i < (await tabs.count()); i += 1) await tabs.nth(i).click();

  await expect(preview.locator("[data-story-controls]").first()).toBeVisible();
  // One body at a time: two views sharing a card means switching, not stacking.
  await expect(preview.locator("[data-inspector-tree]")).toHaveCount(0);
});

test("e2e.a-bare-canvas-opens-its-tree — a scene that paints nothing shows its proof", async ({ page }) => {
  // `Basics/Node` draws nothing on purpose — a bare node has no paint — and a docs page where
  // every block starts folded would read as a page that failed to load. A bare-canvas story
  // opens its card ON THE TREE (the one place the scene is visible) and keeps its listing open.
  await page.goto("/?path=/docs/basics-node--docs");
  const preview = page.frameLocator("iframe#storybook-preview-iframe");
  await expect(preview.locator("[data-inspector-tree]").first()).toBeVisible({ timeout: 30000 });
  // "Hide code", not a class: an expanded listing is what offers to hide itself.
  await expect(preview.getByRole("button", { name: "Hide code" }).first()).toBeVisible();
});

test("e2e.a-docs-page-never-scrolls-sideways — on the narrowest screen there is", async ({ page }) => {
  // One block that refuses to shrink widens the WHOLE document, and then everything above it
  // is pushed off-screen too: prose, canvas and code all shifted by a table three blocks down.
  // That is what the controls table did on a phone. Wide content scrolls inside its own box.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?path=/docs/basics-node--docs");
  const preview = page.frameLocator("iframe#storybook-preview-iframe");
  await preview.getByRole("tab", { name: "controls" }).first().click();
  await expect(preview.locator("[data-story-controls]").first()).toBeVisible({ timeout: 30000 });

  const overflow = await page.frames()[1]!.evaluate(() => {
    const doc = document.documentElement;
    return { page: doc.scrollWidth - doc.clientWidth, body: document.body.scrollWidth - doc.clientWidth };
  });
  // A pixel or two of rounding is not a sideways page; a table's worth of it is.
  expect(overflow.page).toBeLessThanOrEqual(2);
  expect(overflow.body).toBeLessThanOrEqual(2);
});

test("e2e.a-prose-table-is-readable-and-stays-in-its-box", async ({ page }) => {
  // A table written in prose is styled by Storybook's own docs sheet — from its LIGHT theme. On
  // the dark catalog every second row came out white with dark text on it: half the table
  // unreadable and the other half looking like a mistake. Nothing above caught it, because the
  // rules that existed colour TEXT and a zebra stripe is a background.
  //
  // Both halves of the fix are checked here: the cells read like the prose around them, and four
  // columns on a phone scroll inside the table rather than widening the document.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?path=/docs/engine-sizes--docs");
  const preview = page.frameLocator("iframe#storybook-preview-iframe");
  const cell = preview.locator(".sbdocs-content table td").first();
  await expect(cell).toBeVisible({ timeout: 30000 });

  const seen = await page.frames()[1]!.evaluate(() => {
    const doc = document.documentElement;
    const td = document.querySelector(".sbdocs-content table td")!;
    const p = document.querySelector(".sbdocs-content p")!;
    const table = document.querySelector(".sbdocs-content table")!;
    return {
      cell: getComputedStyle(td).color,
      prose: getComputedStyle(p).color,
      rowBg: getComputedStyle(td.parentElement!).backgroundColor,
      tableOverflows: table.scrollWidth > table.clientWidth + 1,
      pageOverflow: doc.scrollWidth - doc.clientWidth,
    };
  });

  // The claim is not "some colour" but "the SAME colour the prose has" — a cell dimmed by one
  // step is exactly the defect that survives a glance.
  expect(seen.cell, JSON.stringify(seen)).toBe(seen.prose);
  // And the stripe is not the light theme's white leaking through.
  expect(seen.rowBg, JSON.stringify(seen)).not.toBe("rgb(255, 255, 255)");
  expect(seen.pageOverflow, "the table widened the document").toBeLessThanOrEqual(2);
});

test("e2e.a-page-fetches-only-its-own-prose — the split is a promise about the network", async ({ page }) => {
  // The unit guards keep prose out of the static chunk, but they cannot see a page that
  // preloads its neighbours out of helpfulness. This is where the claim is actually settled:
  // what the browser asked the server for.
  // Built for production a bundle is a hashed chunk, not a recognisable .json — so counting
  // requests by name proves nothing. What is checked instead is what the words themselves
  // reached the browser: every script this page pulled, read back and searched.
  await page.goto("/?path=/docs/atoms-bounded--docs");
  const preview = page.frameLocator("iframe#storybook-preview-iframe");
  await expect(preview.locator("body")).toContainText("gives a node a box", { timeout: 30000 });

  const found = await page.frames()[1]!.evaluate(async () => {
    const urls = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((n) => n.endsWith(".js") || n.endsWith(".json"));
    const bodies = await Promise.all(urls.map((u) => fetch(u).then((r) => r.text()).catch(() => "")));
    const all = bodies.join("");
    // Phrases without markdown emphasis in them: the bundle stores `**Bounded** is the box`,
    // and only the rendered page reads as one sentence.
    return {
      own: all.includes("the area it occupies on the desk"),
      neighbour: all.includes("Nothing stands above the roots"),
    };
  });

  // The positive half is the test's own control: without it, a search that finds nothing would
  // "pass" just as happily if it were searching the wrong thing.
  expect(found.own).toBe(true);
  expect(found.neighbour).toBe(false);
});

test("e2e.sidebar-is-the-ladder — the tree teaches in dependency order", async ({ page }) => {
  // Sorting happens in the MANAGER, so no headless test can see it: `index.json` carries the
  // stories in discovery order and knows nothing about how they are shown. This is the only
  // place the reader's actual first impression is checked.
  await page.goto("/");
  const tree = page.locator("#storybook-explorer-tree");
  await tree.waitFor();

  const labels = (await tree.locator("a, button").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  const at = (name: string) => labels.indexOf(name);

  // THE GENRES, in the order a reader needs them: the lesson, the vocabulary, the reference,
  // what is already built out of it, and — last, and only for whoever works on the kit — the
  // explanation. A top-level section is drawn in caps by the manager, which is also how the roots
  // are told apart from the pages inside them.
  const sections = ["START", "BASICS", "ATOMS", "PRESETS", "ENGINE"].map(at);
  expect(sections.every((i) => i >= 0), `sections missing from ${JSON.stringify(labels)}`).toBe(true);
  expect(sections).toEqual([...sections].sort((a, b) => a - b));

  const rungs = ["Bounded", "Surfaced", "Transformable", "Container"].map(at);
  expect(rungs.every((i) => i >= 0)).toBe(true);
  expect(rungs).toEqual([...rungs].sort((a, b) => a - b));
});

/**
 * Every pixel the renderer actually put down, as a set of x/y strings. Read back from the live
 * canvas rather than compared to a baseline, for the same reason as everything else in this
 * file: a golden image nobody looks at is a file that gets blessed on every failure.
 */
async function paintedPixels(canvas: Locator): Promise<{ points: Set<string>; w: number; h: number }> {
  const data = await canvas.evaluate((view: HTMLCanvasElement) => {
    const copy = document.createElement("canvas");
    copy.width = view.width;
    copy.height = view.height;
    const g = copy.getContext("2d")!;
    g.drawImage(view, 0, 0);
    const px = g.getImageData(0, 0, copy.width, copy.height).data;
    const points: string[] = [];
    for (let y = 0; y < copy.height; y += 1) {
      for (let x = 0; x < copy.width; x += 1) {
        if (px[(y * copy.width + x) * 4 + 3]! > 8) points.push(`${x},${y}`);
      }
    }
    return { points, w: copy.width, h: copy.height };
  });
  return { points: new Set(data.points), w: data.w, h: data.h };
}

test("e2e.a-circle-is-painted-round — the contour reaches the paint", async ({ page }) => {
  // Until the plan carried points, every shape was drawn as a rounded rect: a circle came out
  // square however carefully the model described it. The corners of the bounding box are the
  // whole test — a round surface leaves them empty.
  const canvas = await openScene(page, "atoms-surfaced--plate&args=preset:circle;stroke:!false");
  const { points, w, h } = await paintedPixels(canvas);

  const xs = [...points].map((p) => Number(p.split(",")[0]));
  const ys = [...points].map((p) => Number(p.split(",")[1]));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  expect(x1 - x0).toBeGreaterThan(20);

  // A tenth of the way in from each corner of the bounding box, diagonally: inside a square,
  // outside a circle of the same extent.
  const inset = Math.round(Math.min(x1 - x0, y1 - y0) * 0.08);
  for (const [cx, cy] of [
    [x0 + inset, y0 + inset],
    [x1 - inset, y0 + inset],
    [x0 + inset, y1 - inset],
    [x1 - inset, y1 - inset],
  ]) {
    expect(points.has(`${cx},${cy}`), `corner ${cx},${cy} of ${w}x${h} is painted`).toBe(false);
  }
});

test("e2e.dashes-multiply-and-do-not-stretch — a border is not a picture of a border", async ({ browser }) => {
  // The rule the whole surface design turns on, and the one no unit test can prove is on the
  // glass. A wider card must show MORE dashes of the SAME size, not the same dashes stretched.
  const count = async (width: number): Promise<{ dashes: number; thickness: number }> => {
    // A WHOLE BROWSER CONTEXT per measurement, closed straight after.
    //
    // Two navigations in one page do not do: run this after the smoke test — which opens every
    // story, and every story takes a WebGL context — and the SECOND scene here came up blank
    // whichever width it was asked for. A browser hands out about a dozen contexts and then
    // starts taking them back, and navigating, even to about:blank, does not hand one back in
    // time. The reading was zero dashes and the fault looked like ours.
    const context = await browser.newContext({ viewport: { width: 900, height: 640 } });
    const page = await context.newPage();
    const canvas = await openScene(
      page,
      `atoms-surfaced--plate&args=w:${width};dash:!true;fill:stageBg;fillOpacity:0`,
    );
    const measured = await canvas.evaluate((view: HTMLCanvasElement) => {
      const copy = document.createElement("canvas");
      copy.width = view.width;
      copy.height = view.height;
      const g = copy.getContext("2d")!;
      g.drawImage(view, 0, 0);
      const px = g.getImageData(0, 0, copy.width, copy.height).data;
      const alpha = (x: number, y: number): number => px[(y * copy.width + x) * 4 + 3]!;

      // The FIRST row that has any paint — with a break, or this finds the last one and then
      // samples a row below the card, where there is nothing to count.
      let top = -1;
      for (let y = 0; y < copy.height && top < 0; y += 1) {
        for (let x = 0; x < copy.width; x += 1) {
          if (alpha(x, y) > 8) {
            top = y;
            break;
          }
        }
      }
      // A row inside the top border, clear of its own antialiased first line.
      const row = top + 2;
      let dashes = 0;
      let inRun = false;
      for (let x = 0; x < copy.width; x += 1) {
        const on = alpha(x, row) > 8;
        if (on && !inRun) dashes += 1;
        inRun = on;
      }
      // And how thick that border is, straight down through the middle of the first dash.
      let x0 = -1;
      for (let x = 0; x < copy.width && x0 < 0; x += 1) if (alpha(x, row) > 8) x0 = x;
      let thickness = 0;
      for (let y = row; y < copy.height && alpha(x0 + 2, y) > 8; y += 1) thickness += 1;
      return { dashes, thickness };
    });
    await context.close();
    return measured;
  };

  const narrow = await count(1.4);
  const wide = await count(3);
  // A blank canvas reads as "no dashes", which would pass half of what follows for the wrong
  // reason. Say so here instead.
  expect(narrow.thickness, "the narrow scene painted nothing").toBeGreaterThan(0);
  expect(wide.thickness, "the wide scene painted nothing").toBeGreaterThan(0);
  const note = JSON.stringify({ narrow, wide });
  expect(narrow.dashes, note).toBeGreaterThan(1);
  expect(wide.dashes, note).toBeGreaterThan(narrow.dashes + 1);
  // Same stroke, whatever the area: the count is what the extra width bought.
  expect(Math.abs(wide.thickness - narrow.thickness)).toBeLessThanOrEqual(1);
});

test("e2e.engine-keeps-its-scene-on-the-page — hidden from the ladder, not from the reader", async ({ page }) => {
  // `!dev` is how a scene stays in its section and out of the sidebar. It is one word, and the
  // failure it guards against is silent in both directions: the rung comes back, or the page
  // loses its only picture and reads as prose that describes something nobody can see.
  await page.goto("/?path=/docs/engine-baking-nodes--docs");
  const preview = page.frameLocator("iframe#storybook-preview-iframe");
  await expect(preview.locator("[data-painted]").first()).toBeAttached({ timeout: 30000 });
  await expect(preview.locator("canvas").first()).toBeVisible();

  const tree = page.locator("#storybook-explorer-tree");
  await tree.waitFor();
  const labels = (await tree.locator("a, button").allInnerTexts()).map((t) => t.trim());
  expect(labels).toContain("Baking nodes");
  expect(labels, "the scene took a rung of its own in the ladder").not.toContain("Baking");
});

test("e2e.a-snippet-names-nothing-of-this-website", async ({ page }) => {
  // The Code panel exists to be COPIED, so every identifier in it has to be one the reader has.
  // `Surfaced/Plate` printed `registerSurface(PLATE, recordOf(a))` over a const spread from
  // `...shapeArgs(), ...RECORD_ARGS` — four names that exist nowhere but in this catalog, in the
  // one place a page is asking to be taken away.
  //
  // Checked against a LIST rather than by eye: the failure is silent, it looks like code, and it
  // came back after being fixed once on the shape shelf.
  const preview = page.frameLocator("iframe#storybook-preview-iframe");
  const snippetOf = async (story: string): Promise<string> => {
    await page.goto(`/?path=/story/${story}`);
    await expect(preview.locator("[data-painted]").first()).toBeAttached({ timeout: 30000 });
    await page.getByRole("tab", { name: "Code" }).click();
    return page.locator("pre").first().innerText();
  };

  // EVERY SCENE ON THE SHELF, not the one it was first caught on. The three path scenes built
  // their arguments out of a shared const and printed its NAME — the same failure from the other
  // side, in a panel that looked no different for it.
  const local = ["shapeArgs", "RECORD_ARGS", "SHAPE_ARGS", "recordOf", "shapeOf", "PLATE", "PATH_ARGS"];
  for (const story of [
    "atoms-surfaced--plate",
    "atoms-surfaced--path",
    "atoms-surfaced--zone",
    "presets-components--arrow-head",
    "atoms-bounded--polygon",
    "presets-bounds--rect",
    "presets-components--arrow",
  ]) {
    const snippet = await snippetOf(story);
    for (const name of local) {
      expect(snippet.includes(name), `${story}: ${name} is a name only this catalog has:\n${snippet}`).toBe(false);
    }
  }

  const code = await snippetOf("atoms-surfaced--plate");
  // And what should be there: a real registry call with the record written out as a value.
  expect(code).toContain('registerSurface("story.plate", {');
  expect(code).toContain("layers:");
});

test("e2e.bakeable-keeps-its-stroke — the atom's whole visible consequence", async ({ browser }) => {
  // The one claim the Engine section rests on and no unit test can make: a node carrying
  // `Bakeable` wears the border it was AUTHORED with, while its scaled neighbour wears one the
  // matrix multiplied. The plan can be checked for a folded matrix; whether that reached the
  // glass is only answerable here.
  const context = await browser.newContext({ viewport: { width: 900, height: 640 } });
  const page = await context.newPage();
  const canvas = await openScene(page, "engine-baking-nodes--baking&args=scale:2");
  const measured = await canvas.evaluate((view: HTMLCanvasElement) => {
    const copy = document.createElement("canvas");
    copy.width = view.width;
    copy.height = view.height;
    const g = copy.getContext("2d")!;
    g.drawImage(view, 0, 0);
    const px = g.getImageData(0, 0, copy.width, copy.height).data;
    const alpha = (x: number, y: number): number => px[(y * copy.width + x) * 4 + 3]!;

    // OPAQUE pixels only. The surface fills at 0.35, the stroke paints solid, so a threshold
    // above the fill measures the border rather than the whole card — scanning for "any paint"
    // finds the fill's first row and then runs the full height of the card, twice, equally.
    const SOLID = 200;
    const thicknessIn = (from: number, to: number): number => {
      for (let y = 0; y < copy.height; y += 1) {
        for (let x = from; x < to; x += 1) {
          if (alpha(x, y) <= SOLID) continue;
          let run = 0;
          while (y + run < copy.height && alpha(x, y + run) > SOLID) run += 1;
          return run;
        }
      }
      return 0;
    };
    const half = Math.round(copy.width / 2);
    return { still: thicknessIn(0, half), moving: thicknessIn(half, copy.width) };
  });
  await context.close();

  const note = JSON.stringify(measured);
  // A blank canvas reads as two zeroes, which would satisfy an inequality for the wrong reason.
  expect(measured.still, `nothing was painted: ${note}`).toBeGreaterThan(0);
  expect(measured.moving, `nothing was painted: ${note}`).toBeGreaterThan(0);
  // At `scale: 2` the live border is the authored one DOUBLED, and that is the number, not just
  // an inequality: "thicker" would also pass if the matrix had scaled it by a tenth.
  expect(measured.moving / measured.still, note).toBeGreaterThan(1.6);
});

test("e2e.a-picture-reaches-the-glass — and fit decides how much of it", async ({ browser }) => {
  // Textures arrive asynchronously and the frame does not wait for them, so "the plan placed a
  // picture" and "a picture is on the glass" are two different statements — and only the second
  // one is worth anything. Each reading takes its own browser context: two WebGL contexts in one
  // page come up blank after the smoke test has spent the browser's allowance.
  const shot = async (args: string): Promise<Buffer> => {
    const context = await browser.newContext({ viewport: { width: 900, height: 640 } });
    const page = await context.newPage();
    const canvas = await openScene(page, `atoms-surfaced--plate&args=${args}`);
    // The picture lands a frame or two after the scene reports itself painted.
    await page.waitForTimeout(600);
    const buffer = await middle(page, canvas);
    await context.close();
    return buffer;
  };

  const plain = await shot("fill:sunkBg;stroke:!false");
  const withPicture = await shot("fill:sunkBg;stroke:!false;image:banner");
  expect(plain.equals(withPicture), "the picture changed nothing on the glass").toBe(false);

  // And `fit` is not decoration: the same picture in the same area, cropped instead of letterboxed.
  const covered = await shot("fill:sunkBg;stroke:!false;image:banner;fit:cover");
  expect(withPicture.equals(covered), "contain and cover drew the same thing").toBe(false);
});

test("e2e.controls-follow-the-language — a half-translated screen is the worst outcome", async ({ page }) => {
  // Control descriptions are the one piece of prose that cannot follow the switch on its own:
  // Storybook normalises `argTypes` once, while a story is prepared, and keeps whatever it read.
  // So the preview reloads on a language change — and this is the test that says it worked, and
  // that it terminated rather than reloading forever.
  await page.goto("/?path=/story/presets-bounds--rect");
  const panel = page.locator("#storybook-panel-root");
  await panel.getByText("Controls", { exact: false }).first().waitFor({ timeout: 30000 });
  await expect(panel).toContainText("in units", { timeout: 30000 });

  await page.evaluate(() => {
    (window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit(e: string, p: unknown): void } })
      .__STORYBOOK_ADDONS_CHANNEL__.emit("updateGlobals", { globals: { locale: "ru" } });
  });

  // The Russian half, and the English one gone: either alone would pass for the wrong reason.
  await expect(panel).toContainText("в юнитах", { timeout: 30000 });
  await expect(panel).not.toContainText("in units");
  expect(page.url()).toContain("locale:ru");
});

test("e2e.the-code-panel-scrolls — a snippet longer than the panel is still readable", async ({ page }) => {
  // The highlighter grows to its content and brings its own scroller inside; wrapped in a box
  // that was `height:100%; overflow:hidden` it simply overflowed, and the panel clipped it —
  // twenty-eight lines of source with no way to reach line fifteen. Nothing headless can see
  // that: it is a layout, and only a browser lays anything out.
  //
  // The PANEL is shortened rather than a story picked for being long. Picking one was a guess
  // that went wrong twice — `Surfaced/Plate` has the most controls in the catalog and the
  // shortest snippet of all (its arguments arrive as two spreads on one line), and a shape's
  // snippet changes length the moment its shape is written differently — and they got SHORTER
  // the day the shapes became helper calls, which is a good outcome that broke this test twice.
  // A short viewport makes the claim what it should have been all along: whatever is longer
  // than the panel scrolls, whatever the snippet happens to say today.
  await page.setViewportSize({ width: 900, height: 420 });
  await page.goto("/?path=/story/atoms-bounded--pawn");
  const panel = page.locator("#storybook-panel-root");
  await panel.getByRole("tab", { name: "Code" }).click();
  await expect(panel).toContainText("mount(", { timeout: 30000 });

  const scrolled = await panel.evaluate((root: HTMLElement) => {
    // The scroller HOLDING THE CODE, not merely the first scroller in the panel — the panel has
    // more than one, and taking whichever came first meant the test passed or failed on
    // something that was not the snippet at all.
    //
    // And in WHICHEVER direction the snippet overflows. A pasted SVG path is one very long
    // line, a record is thirty short ones; pinning the test to height meant it broke every time
    // a shape was written differently, which says nothing about whether the panel works.
    const boxes = [...root.querySelectorAll("*")].filter(
      (el) => (el.textContent ?? "").includes("mount(") && (el.scrollHeight > el.clientHeight + 4 || el.scrollWidth > el.clientWidth + 4),
    );
    const box = boxes[boxes.length - 1]; // innermost: the code, not the frame around it
    if (!box) return null;
    box.scrollTop = 120;
    box.scrollLeft = 120;
    return {
      moved: box.scrollTop > 0 || box.scrollLeft > 0,
      over: Math.max(box.scrollHeight - box.clientHeight, box.scrollWidth - box.clientWidth),
    };
  });

  expect(scrolled, "nothing in the code panel can scroll").not.toBeNull();
  expect(scrolled!.over).toBeGreaterThan(0);
  expect(scrolled!.moved).toBe(true);

  // And the snippet is code a reader could run: the catalog's own shell is not in it.
  await expect(panel).not.toContainText("scene(");
});

test("e2e.the-manager-watches-its-own-bundles — nothing is the failure mode", async ({ page }) => {
  // A stale manager reloads itself when the tab comes back and its own scripts have moved. The
  // check is only as good as the list it compares, and an empty list is not an error: it agrees
  // with itself forever. The first version selected `script[src]` — and Storybook's manager page
  // lists its bundles as `<link rel="modulepreload">`, so there was nothing to find.
  await page.goto("/?path=/story/atoms-bounded--point");
  await page.locator("#storybook-panel-root").waitFor({ timeout: 30000 });

  const watched = Number(await page.locator("html").getAttribute("data-gk-watched"));
  expect(watched).toBeGreaterThan(0);

  // And it does not reload on a quiet return: an unchanged server must be left alone, or the
  // catalog would blink every time a reader switched tabs.
  let loads = 0;
  page.on("load", () => (loads += 1));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(1500);
  expect(loads).toBe(0);
});

// THE TWO HEAVY PAGES, ONE AT A TIME.
//
// Serial not for the usual reason — neither test touches what the other looks at — but for the
// machine. The smoke walk opens every story in the catalog back to back, each one a WebGL
// context and a scene; the checks below open the manager and wait for IT to lay out before the
// preview inside has any width at all. Run at the same time, the walk starves the layout, the
// canvas stays one pixel wide for as long as a minute, and the suite reports a broken renderer.
//
// This is NOT the serialisation the config warns about: that one was an attempt to make a
// capture across two navigations reliable, and it did not work because the fault was in the
// capture. Here the fault is contention, and time is the only thing that separates them.
test.describe.serial("the heavy pages", () => {
  test("e2e.story-smoke — every story opens without a word in the console", async ({ page, request }) => {
    // The walk opens EVERY entry the index lists, so its budget grows with the catalog — and a
    // prose page still pays the 1.5s "is there a scene" probe before moving on. Sized so the
    // catalog can keep growing without this line moving again.
    test.setTimeout(120_000);

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
      await openEntry(page, story.id);
    }
    expect(complaints).toEqual([]);
  });

  test("e2e.checks-run-only-when-asked — the Tests section is the switch", async ({ page }) => {
    // Twenty rounds of add-and-remove on a real GPU, plus the frames each one waits for: the one
    // deliberately slow case in this suite, and the default 30s is not enough for it.
    test.setTimeout(120_000);

    // A CATALOG story carries no play at all — a reader turning a knob is not running a suite.
    await page.goto("/?path=/story/basics-node--bare&addonPanel=storybook%2Finteractions%2Fpanel");
    const panel = page.locator("#storybook-panel-root");
    // Through the preview IFRAME: the manager page holds the panel, the story lives a document
    // deeper, and a locator that never crosses that line reports "no scene" about a painted one.
    const preview = page.frameLocator("#storybook-preview-iframe");
    await expect(preview.locator("[data-painted]")).toBeVisible({ timeout: 30000 });
    await expect(panel.getByText("play.node.it-is-there")).toHaveCount(0);

    // A TESTS story runs its checks the moment it opens — opening the page is the request, and
    // the same steps a reader watches here are the ones this suite asserts on. EVERY step by
    // name, not only the last one: waiting on the final step alone would pass on a run that had
    // reordered or quietly dropped the three before it. Every RUNG the same way — a new Tests
    // page joins this list, or it is a suite nothing ever runs.
    const rungs: readonly [string, readonly string[]][] = [
      [
        "tests-node--lifecycle",
        ["play.node.it-is-there", "play.node.it-goes", "play.node.it-comes-back", "play.node.repeats"],
      ],
      ["tests-node--growth", ["play.node.a-scene-grown-while-starting-still-paints"]],
      [
        "tests-bounded--outline",
        [
          "play.bounded.the-outline-is-the-only-ink",
          "play.bounded.size-is-on-the-glass",
          "play.bounded.every-shape-draws-its-own-pattern",
          "play.bounded.no-box-no-ink",
        ],
      ],
      [
        "tests-surfaced--paint",
        [
          "play.surfaced.the-fill-is-the-box",
          "play.surfaced.nothing-to-paint-with-or-on",
          "play.surfaced.the-colour-is-the-record-s",
          "play.surfaced.the-border-is-its-own-ink",
          "play.surfaced.width-and-dashes-are-absolute",
          "play.surfaced.a-different-record-is-a-different-picture",
          "play.surfaced.the-paint-need-not-match-the-box",
          "play.surfaced.a-desk-takes-its-area-from-what-it-holds",
        ],
      ],
      [
        "tests-surfaced--area",
        [
          "play.surfaced.an-empty-desk-has-no-area",
          "play.surfaced.content-without-boxes-is-no-area",
          "play.surfaced.a-box-of-its-own-wins",
          "play.surfaced.the-layout-decides-the-area",
        ],
      ],
      [
        "tests-surfaced--openwork",
        [
          "play.surfaced.one-place-is-not-a-contour",
          "play.surfaced.the-contour-closes-itself",
          "play.surfaced.a-dash-has-ends-of-its-own",
          "play.surfaced.an-arrow-is-a-run-and-two-nodes",
          "play.surfaced.a-head-wears-its-own-record",
          "play.surfaced.the-pattern-lives-in-the-record",
        ],
      ],
      [
        "tests-transformable--motion",
        [
          "play.transformable.at-moves-the-picture-not-its-size",
          "play.transformable.the-pose-orders-itself",
          "play.transformable.a-right-angle-is-exact",
          "play.transformable.a-full-lap-changes-nothing",
          "play.transformable.scale-is-uniform-and-zero-erases",
        ],
      ],
      [
        "tests-transformable--chain",
        [
          "play.transformable.angle-adds-up-on-the-glass",
          "play.transformable.a-card-turns-about-its-hand",
          "play.transformable.scale-multiplies-on-the-glass",
          "play.transformable.a-layout-writes-at-on-the-glass",
          "play.transformable.a-reparented-card-answers-anew",
        ],
      ],
      [
        "tests-transformable--order",
        [
          "play.transformable.z-decides-the-cover-and-moves-no-box",
          "play.transformable.z-adds-up-through-the-stack",
          "play.transformable.equal-z-keeps-tree-order",
        ],
      ],
      [
        "tests-container--row",
        [
          "play.container.a-row-is-the-sum-of-its-parts",
          "play.container.the-gap-is-daylight",
          "play.container.a-lone-card-centres",
          "play.container.a-layout-swap-does-not-latch",
          "play.container.reserved-room-on-the-glass",
        ],
      ],
      [
        "tests-container--flow",
        [
          "play.container.an-added-card-reflows-the-row",
          "play.container.a-removal-closes-the-aisle",
          "play.container.order-is-the-tree-on-the-glass",
          "play.container.an-unknown-layout-keeps-the-scene",
        ],
      ],
      [
        "tests-container--spread",
        [
          "play.container.the-desk-wears-its-content",
          "play.container.the-area-is-a-size-not-an-address",
          "play.container.padding-is-air-around-the-wrap",
          "play.container.bare-children-leave-nothing",
        ],
      ],
      [
        "tests-tiltable--tap",
        [
          "play.tiltable.a-stop-turns-the-card",
          "play.tiltable.every-stop-is-its-own-picture",
          "play.tiltable.the-tap-clamps",
        ],
      ],
      [
        "tests-coated--play",
        [
          "play.coated.a-wash-changes-the-picture",
          "play.coated.the-level-is-the-picture",
          "play.coated.a-cast-greys-the-tree",
        ],
      ],
      [
        "tests-flippable--play",
        [
          "play.flippable.a-turn-shows-the-back",
          "play.flippable.re-flip-returns-the-front",
          "play.flippable.a-stack-turns-its-child",
          "play.flippable.content-swap-shows-another-subtree",
          "play.flippable.move-then-flip-mirrors-the-live-state",
          "play.flippable.params-change-on-the-fly",
        ],
      ],
      [
        "tests-draggable--drag",
        [
          "play.draggable.a-card-follows-the-finger",
          "play.draggable.a-refused-drop-flies-home",
          "play.draggable.stay-strands-the-card",
          "play.draggable.only-a-draggable-lifts",
        ],
      ],
      [
        "tests-shadowcaster--cast",
        [
          "play.shadow.the-fall-is-inked",
          "play.shadow.the-lamp-walks",
          "play.shadow.height-stretches-the-fall",
        ],
      ],
    ];
    for (const [story, steps] of rungs) {
      await page.goto(`/?path=/story/${story}&addonPanel=storybook%2Finteractions%2Fpanel`);
      for (const step of steps) {
        await expect(panel.getByText(step, { exact: false })).toBeVisible({ timeout: 60000 });
      }
      // And the panel says PASS rather than merely having run: a failed step is still a listed
      // step.
      await expect(panel.getByText(/Fail|Error|Exception/)).toHaveCount(0);
    }
  });

  test("e2e.checks-can-be-stepped — the pace belongs to the reader", async ({ page }) => {
    // Storybook's own step buttons replay the whole play from a remount, blind to the one
    // thing a reader pauses for: the state a step left on the glass. The strip on the canvas
    // paces the SAME steps instead — pause after each, next, back (an honest replay), to the
    // end — while the Interactions panel keeps ticking. Each transition below is a remount and
    // a fresh WebGL start, so the waits are generous.
    test.setTimeout(120_000);
    await page.goto("/?path=/story/tests-bounded--outline&addonPanel=storybook%2Finteractions%2Fpanel");
    const preview = page.frameLocator("#storybook-preview-iframe");

    // The default pace ran everything; the strip now offers the OTHER pace.
    await preview.locator("[data-checks-stepwise]").click({ timeout: 60000 });
    // The remounted run pauses AFTER its first step, and says which one it is standing on.
    const strip = preview.locator("[data-checks-strip]");
    await expect(strip).toHaveAttribute("data-checks-step", "1", { timeout: 60000 });
    // At the first step there is nothing to go back to, and the strip does not pretend.
    await expect(preview.locator("[data-checks-back]")).toHaveCount(0);

    await preview.locator("[data-checks-next]").click();
    await expect(strip).toHaveAttribute("data-checks-step", "2", { timeout: 60000 });

    // Back is a replay: the run comes back standing after step 1 again.
    await preview.locator("[data-checks-back]").click();
    await expect(strip).toHaveAttribute("data-checks-step", "1", { timeout: 60000 });

    // To the end: the rest runs without pausing, and the panel closes green.
    await preview.locator("[data-checks-to-end]").click();
    await expect(strip).not.toHaveAttribute("data-checks-step", /.*/, { timeout: 60000 });
    const panel = page.locator("#storybook-panel-root");
    await expect(panel.getByText("play.bounded.no-box-no-ink", { exact: false })).toBeVisible({ timeout: 60000 });
    await expect(panel.getByText(/Fail|Error|Exception/)).toHaveCount(0);
  });
});
