// @vitest-environment jsdom
import { installTheme, DEFAULT_VIEWER } from "game-kit";
import { beforeEach, describe, expect, it } from "vitest";
import { curtain } from "./curtain.js";

describe("the desk is covered until it knows where it is looking from", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    installTheme(document, DEFAULT_VIEWER.theme);
  });

  it("curtain.covers-the-desk-until-raised — a first frame from nobody's side is not shown", () => {
    const stage = document.createElement("div");
    document.body.appendChild(stage);
    const cover = curtain(stage, "#173d2d");
    expect(cover.down(), "the desk is hidden the moment it is stood up").toBe(true);
    const sheet = stage.firstElementChild as HTMLElement;
    expect(sheet.style.position).toBe("absolute");
    expect(sheet.style.inset, "over the whole region, not a corner of it").toBe("0");
    expect(sheet.style.background, "the hub's own colour, not a hole in the page").not.toBe("");

    cover.raise();
    expect(cover.down()).toBe(false);
    expect(stage.children.length, "and it leaves nothing behind over the felt").toBe(0);
    cover.raise(); // every way the join settles calls it; the second is not an error
    expect(cover.down()).toBe(false);
  });
});
