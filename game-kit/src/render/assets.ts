// THE ASSET REGISTRY — what a layer's `image` points AT.
//
// Same shape as the surface and layout registries, and for the same reason: a node carries a
// short, stable NAME, and what the name is worth is decided in one place. Swap the record
// behind `cards/back` and every card in the room turns over at once, with nothing walked.
//
// AN ASSET DECLARES ITS SIZE, IN UNITS.
//
// Not in pixels, and not "whatever the file turns out to be". Two reasons, and both are load
// bearing:
//
//   - the PLAN has to be pure. Fitting a picture into an area needs the picture's proportions,
//     and if those only arrive when the file has downloaded, then the geometry depends on the
//     network and cannot be computed by a test. Declared up front, it is arithmetic.
//   - a unit is what the model measures in. An asset that knows only its pixels would be a
//     different size on every screen, which is the one thing units exist to prevent.
//
// So `w` and `h` say how big the picture is MEANT to be — at `fit: "original"` that is exactly
// the size it is drawn, and at `repeat` it is the size of one tile. What resolution the file
// happens to have is the renderer's business and nobody else's.

export interface AssetRecord {
  /** Where the picture comes from: a URL, a path, a data URI. The renderer resolves it. */
  readonly src: string;
  /** The picture's own size, in UNITS. */
  readonly w: number;
  readonly h: number;
}

const ASSETS = new Map<string, AssetRecord>();

export function registerAsset(name: string, record: AssetRecord): void {
  ASSETS.set(name, record);
}

/**
 * `undefined` for a name nobody registered. Skipped rather than thrown, exactly as a dangling
 * surface reference is: a missing picture must not take the scene down with it, and the layer
 * below is still worth seeing.
 */
export function assetRecord(name: string): AssetRecord | undefined {
  return ASSETS.get(name);
}

export function assetNames(): readonly string[] {
  return [...ASSETS.keys()];
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetAssets(): void {
  ASSETS.clear();
}
