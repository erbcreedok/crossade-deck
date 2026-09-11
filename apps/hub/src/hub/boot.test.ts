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
    // THREE MOVES, AND BOTH ENDS MOVE. The dash is how LONG the stroke is, the offset is WHERE it
    // lies: growing is the head running out from a tail left at home, travelling is both ends moving
    // at one length, gathering is the tail coming in to a head already at the end. A single-value
    // dasharray — the whole outline, drawn by offset alone — is the animation this replaced.
    const frames = PAGE.slice(PAGE.indexOf("@keyframes crusade"), PAGE.indexOf("prefers-reduced-motion"));
    expect(frames, "it starts a twentieth long, at the crown").toMatch(/0%\s*\{ stroke-dasharray: 0\.05 1; stroke-dashoffset: 0;/);
    expect(frames, "grows to two fifths with the tail still home").toMatch(/45%\s*\{ stroke-dasharray: 0\.40 1; stroke-dashoffset: 0;/);
    expect(frames, "travels at that length to the end of the outline").toMatch(/80%\s*\{ stroke-dasharray: 0\.40 1; stroke-dashoffset: -0\.60;/);
    expect(frames, "and gathers to a twentieth, head home").toMatch(/100%\s*\{ stroke-dasharray: 0\.05 1; stroke-dashoffset: -0\.95;/);
    // THE HEAD LANDS EXACTLY ON THE END at both of the last two frames: tail + length = 1. Off by a
    // hundredth and the stroke either overshoots the crown or stops short of it, and on a 400ms loop
    // that reads as a stutter nobody can place.
    expect(0.6 + 0.4, "the head reaches the end as the travel finishes").toBeCloseTo(1, 10);
    expect(0.95 + 0.05, "…and is still there when the tail arrives").toBeCloseTo(1, 10);
    // IT NEVER DISAPPEARS: the next turn opens at the length the last one closed at.
    expect(frames.match(/stroke-dasharray: 0\.05 1/g)?.length, "starts and ends a twentieth long").toBe(2);
    expect(PAGE, "the loop is 800ms and each phase carries its own easing").toMatch(/animation: crusade 800ms infinite/);
    // REAL CURVES, NOT THE KEYWORDS. `ease-out` and `ease-in-out` are gentle by reputation; the
    // growth is the move the eye follows all the way through, and it wants a curve that is soft at
    // BOTH ends rather than only at one.
    expect(frames, "the growth eases in and out").toContain("cubic-bezier(.65, 0, .35, 1)");
    expect(frames, "the travel is dead steady").toContain("animation-timing-function: linear");
    expect(frames, "the gathering eases to a stop").toContain("cubic-bezier(.4, 0, .2, 1)");

    // THE GROWING IS THE SLOW PART, AND IT IS SLOW BY ARITHMETIC. The head covers 0.35 of the
    // outline while the stroke grows and 0.60 while it travels; give those phases 45% and 35% of the
    // loop and the head moves better than twice as fast once it is up to length — which is the
    // whole of the ask, and is a property of the SPLIT, not of the easing. A curve alone only
    // borrows speed from one end of a phase and pays it back at the other, so it cannot make one
    // phase slower than another; only the numbers below can, and that is why they are checked.
    const GROW_TIME = 0.45, TRAVEL_TIME = 0.80 - 0.45;
    const GROW_PATH = 0.40 - 0.05, TRAVEL_PATH = 1 - 0.40;
    expect(TRAVEL_PATH / TRAVEL_TIME, "the head travels at better than twice its growing speed").toBeGreaterThan(
      2 * (GROW_PATH / GROW_TIME),
    );
    expect(GROW_TIME, "and the growing gets the larger share of the loop").toBeGreaterThan(TRAVEL_TIME);
    // NOTHING UNDER IT: the path is what the line is for, and a track drawn beneath gives the shape
    // away before the line has earned it.
    expect(PAGE.includes("class=\"ghost\""), "no second path under the line").toBe(false);
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
