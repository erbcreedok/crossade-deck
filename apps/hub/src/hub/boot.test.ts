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
    // THE DESIGN PROJECT'S OWN CROSS — a cross pattée, arms flaring to their tips, and not the plus
    // this started life as. Its twelve points are the outline of the two octagons the design draws
    // it with; a redraw that loses the flare has lost the mark, so the corners are named here.
    expect(PAGE, "and the cross is an inline path").toMatch(/<path[^>]*class="line"[^>]*d="M50 0 L80 0 L66 34/);
    // STARTED AT THE CROWN, not at a corner: the outline's own first point is the top-LEFT of the
    // upper arm, and a line grown from there is lopsided at both ends. The top edge is cut in half
    // at (50,0) and the closing stroke brings the line home to where it left.
    expect(PAGE, "the line leaves from the top centre").toMatch(/d="M50 0 /);
    expect(PAGE, "…and the closing stroke comes back to it along the top edge").toMatch(/L34 34 L20 0 Z"/);
    expect(PAGE, "twelve corners after the start, closed").toMatch(/d="M50 0(?: L\d+ \d+){12} Z"/);
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
    // A HEAD, THEN A TAIL — drawn, held, eaten, held. Both ends are animated, so both the dash (how
    // LONG the stroke is) and the offset (WHERE it lies) are keyed, in fractions of the outline.
    const frames = PAGE.slice(PAGE.indexOf("@keyframes crusade"), PAGE.indexOf("prefers-reduced-motion"));
    expect(frames, "it opens with nothing drawn, at the crown").toMatch(/0%\s*\{ stroke-dasharray: 0 1; stroke-dashoffset: 0;/);
    expect(frames, "the head has run the whole outline by 40%").toMatch(/40%\s*\{ stroke-dasharray: 1 1; stroke-dashoffset: 0;/);
    expect(frames, "…and the whole cross is HELD, unchanged, to 50%").toMatch(/50%\s*\{ stroke-dasharray: 1 1; stroke-dashoffset: 0;/);
    expect(frames, "then the tail runs the same road and empties it").toMatch(/90%\s*\{ stroke-dasharray: 0 1; stroke-dashoffset: -1;/);
    expect(frames, "…and empty is HELD to the end").toMatch(/100%\s*\{ stroke-dasharray: 0 1; stroke-dashoffset: -1;/);

    // THE HELD MOMENTS ARE THE POINT. Without them the head's arrival and the tail's departure land
    // on one frame and the eye reads a continuous scribble instead of a cross being drawn. They are
    // a tenth of the loop each, and the two runs four tenths each: 400 + 100 + 400 + 100.
    expect(PAGE, "the loop is a second").toMatch(/animation: crusade 1000ms infinite/);
    const HEAD = 0.40, HOLD_FULL = 0.50 - 0.40, TAIL = 0.90 - 0.50, HOLD_EMPTY = 1 - 0.90;
    expect(HEAD, "the head's run and the tail's are the same length of time").toBeCloseTo(TAIL, 10);
    expect(HOLD_FULL, "and so are the two pauses").toBeCloseTo(HOLD_EMPTY, 10);
    expect(HOLD_FULL, "each pause is a quarter of a run — long enough to read as a stop").toBeCloseTo(HEAD / 4, 10);

    // BOTH RUNS CARRY THE SAME CURVE, eased at both ends: slow away, slow up to the finish.
    expect(frames.match(/cubic-bezier\(\.65, 0, \.35, 1\)/g)?.length, "the head and the tail move alike").toBe(2);
    expect(frames, "and a pause is a pause, not a slow crawl").toContain("animation-timing-function: linear");

    // THE EMPTY PAUSE IS EMPTY. A round cap draws a zero-length dash as a DOT, and it sat on the
    // crown for the whole pause until the stroke was switched off outright — measured in the
    // browser before the fix, and the reason `stroke-opacity` is keyed at all.
    expect(frames, "lit while there is something to draw").toMatch(/89\.5%\s*\{ stroke-opacity: 1; \}/);
    expect(frames, "and switched off for the empty hold").toMatch(/90%\s*\{[^}]*stroke-opacity: 0;/);
    expect(frames, "…still off at the end, so the loop restarts dark").toMatch(/100%\s*\{[^}]*stroke-opacity: 0;/);
    expect(PAGE, "the caps stay round — they are what makes the ends read as ends").toMatch(/stroke-linecap: round/);
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
