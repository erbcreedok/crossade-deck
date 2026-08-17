// THE CLASSIC SKIN — the appearance the dice wear: one face surface per (kind, value). A skin is a
// VALUE, registered into the engine's surface and asset registries exactly like the kit's own
// `installStock*` functions and the cards add-on's skin. Swap the record behind a name and every die
// showing that face changes at once, nothing walked — the reason a look is a record, not a field.

import { registerAsset, registerSurface, type SurfaceRecord } from "game-kit";
import { DIE_KINDS, DIE_SIZE, dieSpec, type DieKind } from "./kinds.js";
import { faceSvg } from "./textures/dice.js";

/** The face surface name for a kind showing a value — stable and speaking. */
export function faceSurface(kind: DieKind, value: number): string {
  return `dice/${kind}/classic/${value}`;
}

/** A surface that is just one texture, filled to cover the die and clipped to the kind's corner. */
function imageSurface(image: string, radius: number): SurfaceRecord {
  return { layers: [{ image, fit: "cover" }], radius };
}

/**
 * Register the classic look for every kind and every face. Idempotent — calling again re-registers
 * the same names, which is how a hot reload cannot stack copies.
 */
export function installDiceSkin(): void {
  for (const kind of DIE_KINDS) {
    const spec = dieSpec(kind);
    for (let value = 1; value <= spec.sides; value++) {
      const name = faceSurface(kind, value);
      registerAsset(name, { src: faceSvg(kind, value), w: DIE_SIZE, h: DIE_SIZE });
      registerSurface(name, imageSurface(name, spec.radius));
    }
  }
}
