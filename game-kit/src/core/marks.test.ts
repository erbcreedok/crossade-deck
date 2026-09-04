import { beforeEach, describe, expect, it } from "vitest";
import { installStockMarks, markNames, markRecord, registerMark, resetMarks } from "./marks.js";

describe("Marks registry", () => {
  beforeEach(() => {
    resetMarks();
  });

  it("marks.register-and-reset — registers and resets mark records", () => {
    expect(markNames()).toEqual([]);
    registerMark("custom", { icon: "mark.custom" });
    expect(markRecord("custom")).toEqual({ icon: "mark.custom" });
    expect(markNames()).toEqual(["custom"]);

    resetMarks();
    expect(markNames()).toEqual([]);
    expect(markRecord("custom")).toBeUndefined();
  });

  it("marks.install-stock-seven — installs the seven stock marks", () => {
    installStockMarks();
    const expected = ["lifted", "moved", "captured", "removed", "flipped", "shuffled", "thrown"];
    expect(markNames()).toEqual(expected);

    for (const name of expected) {
      expect(markRecord(name)).toEqual({ icon: `mark.${name}` });
    }
  });
});
