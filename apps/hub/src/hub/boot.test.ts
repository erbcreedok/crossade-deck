// THE FIRST SCREEN HAS TO BE IN THE DOCUMENT, OR IT IS NOT FIRST.
//
// The temptation with a boot screen is to build it where the rest of the code is — a module, a
// component, something that imports a palette. Every one of those arrives with the bundle, which is
// the thing being waited for: a loading screen that loads is a contradiction, and on the hub it is
// an expensive one, because the shelf's card faces are 52 files.
//
// So the law is about WHERE it lives, and a scan is the only way to keep it: nothing in the page's
// own behaviour would change the day somebody moves it into TypeScript "to tidy up", and nobody
// would notice until a cold phone showed a white rectangle for a second and a half.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = readFileSync(join(process.cwd(), "index.html"), "utf8");
const MAIN = readFileSync(join(process.cwd(), "src/main.ts"), "utf8");

describe("hub.the-cross-is-in-the-page", () => {
  it("ships in the document, drawn inline, fetching nothing", () => {
    expect(PAGE, "the boot screen is markup, not a module").toContain('id="boot"');
    expect(PAGE, "and the cross is an inline path").toMatch(/<path[^>]*class="line"[^>]*d="M36 10/);
    // NOTHING IS FETCHED FOR IT. An `<img>`, a font or a stylesheet would put the one screen that
    // must not wait behind exactly the wait it covers.
    const boot = PAGE.slice(PAGE.indexOf('<div id="boot">'), PAGE.indexOf('<div id="shell"'));
    expect(boot.includes("<img"), "no image").toBe(false);
    expect(boot.includes("url("), "no fetched paint").toBe(false);
    expect(boot.includes("src="), "nothing loaded at all").toBe(false);
  });

  it("the line runs the outline in fractions of it, not in pixels", () => {
    // `pathLength="1"` is what keeps the dash independent of the drawing: redraw the cross at
    // another size and the line's speed is unchanged, because the dash was never in user units.
    expect(PAGE).toContain('pathLength="1"');
    expect(PAGE, "the line is red").toMatch(/\.line \{[^}]*stroke: #e0483f/);
    expect(PAGE, "and it runs, rather than appearing").toMatch(/animation: crusade \d+ms linear infinite/);
    expect(PAGE, "a player who asked for stillness gets the cross without the run").toMatch(
      /prefers-reduced-motion: reduce\) \{\s*#boot \.line \{ animation: none;/,
    );
  });

  it("comes down on a painted frame, not on a timer of its own", () => {
    // THROUGH `afterPaint` AND NOT BY HAND: the hub names `requestAnimationFrame` in exactly one
    // file (`hub.one-clock`), and this screen is not an exception to it — it is the caller that
    // first tried to be one, and was caught by that guard on the way in.
    expect(MAIN, "the wait is asked of the one file that owns frames").toContain("afterPaint(() => {");
    const beat = readFileSync(join(process.cwd(), "src/hub/beat.ts"), "utf8");
    expect(beat, "two frames — the second is the one actually on the glass").toMatch(
      /requestAnimationFrame\(\(\) => requestAnimationFrame\(then\)\)/,
    );
    const raise = MAIN.slice(MAIN.indexOf("function raiseBoot"));
    expect(raise, "and only after the shelf is up").toContain("boot.classList.add(\"gone\")");
    expect(MAIN.indexOf("startHub(chrome, stage)"), "the shelf is started first").toBeLessThan(MAIN.indexOf("raiseBoot();"));
  });

  it("is shown long enough to be seen, and never longer than it has to be", () => {
    // A WARM CACHE BOOTS IN ~200ms, and a screen that comes and goes inside that reads as a fault.
    // The floor is not a delay added to the load: `Math.max(0, …)` is what makes a slow boot pay
    // nothing for it.
    expect(MAIN).toMatch(/const BOOT_LEAST_MS = (\d+);/);
    expect(Number(/const BOOT_LEAST_MS = (\d+);/.exec(MAIN)?.[1]), "long enough to be seen").toBeGreaterThanOrEqual(300);
    expect(MAIN, "and the time already spent counts towards it").toContain("Math.max(0, BOOT_LEAST_MS - waited)");
    expect(MAIN, "measured from the page, which is when the player saw it").toContain("const waited = performance.now();");
  });

  it("is removed, not hidden — a sheet over the page eats every press", () => {
    expect(MAIN).toContain("boot.remove()");
  });
});
