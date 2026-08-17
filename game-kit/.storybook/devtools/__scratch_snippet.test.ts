// SCRATCH — verification only, deleted after the review run.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memberOf, storySource } from "./storySource.js";

const HERE = new URL("./", import.meta.url).pathname;

/** The text of one exported story object literal, as Storybook's source extraction hands it over. */
function storyText(file: string, exportName: string): string {
  const src = readFileSync(join(HERE, "../stories", file), "utf8");
  const at = src.indexOf(`export const ${exportName}`);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error("no literal");
}

describe("scratch: what the docs snippet actually shows", () => {
  it("draggable Drag snippet", () => {
    const code = storyText("Draggable.stories.ts", "Drag");
    const out = storySource.transform(code, {
      args: { id: "card", face: "accent", onReject: "home", carry: "rigid", lift: 1.06, lean: 15 },
    });
    console.log("=== DRAGGABLE DRAG SNIPPET ===\n" + out + "\n=== END ===");
    expect(out.length).toBeGreaterThan(0);
  });

  it("private Hands snippet", () => {
    const code = storyText("Private.stories.ts", "Hands");
    const out = storySource.transform(code, { args: { seat: "north" } });
    console.log("=== PRIVATE HANDS SNIPPET ===\n" + out + "\n=== END ===");
    expect(out.length).toBeGreaterThan(0);
  });

  it("piles snippet", () => {
    const code = storyText("PresetsPiles.stories.ts", "Piles");
    const out = storySource.transform(code, { args: { count: 4 } });
    console.log("=== PILES SNIPPET ===\n" + out + "\n=== END ===");
    expect(out.length).toBeGreaterThan(0);
  });

  it("memberOf sanity", () => {
    const code = storyText("Draggable.stories.ts", "Drag");
    expect(memberOf(code, "render")).toBeTruthy();
  });
});
