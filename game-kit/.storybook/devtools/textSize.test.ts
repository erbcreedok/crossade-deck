// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { pinTextSize } from "./textSize.js";

// From the project root, not from `import.meta.url`: under jsdom the module URL carries no
// directory, and a path built on it silently resolved to `/` — the read failed loudly here,
// but the same trick in a scan would have quietly found nothing to check.
const read = (rel: string): string => readFileSync(join(process.cwd(), ".storybook", rel), "utf8");

beforeEach(() => {
  document.head.innerHTML = "";
});

describe("the type is the size it was written", () => {
  it("textSize.pins-the-root — the boost is switched off, with the prefix the phones want", () => {
    pinTextSize(document);
    const css = document.head.textContent ?? "";
    expect(css).toContain("-webkit-text-size-adjust:100%");
    expect(css).toContain("text-size-adjust:100%");
  });

  it("textSize.pins-once — a second call is a no-op, not a second identical rule", () => {
    // The preview installs it at module load and the manager on its own boot; anything that
    // re-runs either would otherwise stack rules in the head forever.
    pinTextSize(document);
    pinTextSize(document);
    expect(document.head.querySelectorAll("style").length).toBe(1);
  });

  it("textSize.both-documents — the manager and the preview each pin their own", () => {
    // THIS is the guard that matters. The catalog is two documents sharing no stylesheet, so
    // pinning one leaves the bug in the other — where it reads as a different bug entirely,
    // because only one half of the screen jumps. Missed the manager the first time round.
    for (const file of ["manager.tsx", "preview.ts"]) {
      expect(read(file), file).toMatch(/pinTextSize\(document\)/);
    }
  });
});
