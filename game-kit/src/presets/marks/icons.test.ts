import { beforeEach, describe, expect, it } from "vitest";
import { assetRecord, resetAssets } from "../../render/assets.js";
import { installStockMarkIcons } from "./icons.js";

describe("Mark icons presets", () => {
  beforeEach(() => {
    resetAssets();
  });

  it("icons.register-stock-mark-assets — registers seven mark icons as 0.36 unit svg assets", () => {
    installStockMarkIcons();

    const names = ["lifted", "moved", "captured", "removed", "flipped", "shuffled", "thrown"];
    for (const name of names) {
      const record = assetRecord(`mark.${name}`);
      expect(record).toBeDefined();
      expect(record!.w).toBe(0.36);
      expect(record!.h).toBe(0.36);
      expect(record!.src).toContain("data:image/svg+xml");
      expect(decodeURIComponent(record!.src)).toContain("<svg");
    }
  });
});
