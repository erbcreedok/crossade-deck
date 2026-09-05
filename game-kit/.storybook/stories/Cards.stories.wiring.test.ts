// A regression on the round-table rewrite (`57f78678`): the `stacking` knob rode along on
// `CardsArgs`/`STACK_KNOBS` and the panel drew it, but `liveCards` handed `grabScene` a literal
// `false` for it instead of `a.stacking` — so `regrip` never ran on this page (`gestureScene.ts`'s
// `settle` returns before it, `if (!stacking) return`), no handle was ever drawn, and a "stack" was
// never squared up when lifted or aimed as one run when dropped: it read as a scatter and a run that
// never gathered, because the run and the gather never formed in the first place.
//
// The kit's own stack-lift/gather/formation machinery is exercised elsewhere (`gestureScene.test.ts`,
// `StackMerging.stories.ts`'s page); what THIS page had wrong was never asking for it. Read as raw
// source, because the bug was one literal in one call and no behavioural test through two mirrored
// hosts and a live pointer would name it any more precisely than the line itself.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(fileURLToPath(new URL("./Cards.stories.ts", import.meta.url)), "utf8");

describe("Cards.stories wiring", () => {
  it("cards.stacking-knob-reaches-grabScene — the panel's switch is the switch grabScene reads, not a stub", () => {
    const call = SOURCE.slice(SOURCE.indexOf("grabScene("), SOURCE.indexOf("grabScene(") + 400);
    // `stacking` is the 4th argument, right after the release feel — the same slot every other
    // stacking-capable page on the shelf reads its own arg from (`StackMerging.stories.ts`, `a.stacking`).
    expect(call).toContain("a.stacking");
  });
});
