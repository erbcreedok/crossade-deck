import { describe, expect, it } from "vitest";
import { readBuild, sortBuilds } from "./builds.js";

describe("ночные сборки", () => {
  it("номер — только целое положительное", () => {
    expect(readBuild("1468")).toBe(1468);
    expect(readBuild("0")).toBeNull();
    expect(readBuild("-3")).toBeNull();
    expect(readBuild("1.5")).toBeNull();
    expect(readBuild("../../etc")).toBeNull();
    expect(readBuild(1468 as unknown)).toBeNull();
  });

  it("свежая сборка сверху, мусор из папки выброшен", () => {
    expect(sortBuilds(["1468", ".DS_Store", "1470", "1469"])).toEqual([1470, 1469, 1468]);
  });
});
