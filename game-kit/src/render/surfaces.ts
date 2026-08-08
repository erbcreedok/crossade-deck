// THE SURFACE REGISTRY — what `Surfaced.surface` points AT.
//
// It lives in `render/` because a record is made of colours and thicknesses, and the model
// must not know about either: `core` names a record, `render` knows what the name is worth.
//
// A record is the unit of restyling. Re-register `plate` without a border and every card in
// the room loses its border in one step while its box does not move a unit — the separation
// the catalog is built to show. Doing it with fields on the node would mean walking every
// node, and "the box stayed" would no longer prove anything.

export interface SurfaceRecord {
  /** Theme token name or a literal colour. Absent = nothing painted underneath. */
  readonly fill?: string;
  readonly border?: string;
  /** In UNITS, like every other measurement in the model — the host converts. */
  readonly borderWidth?: number;
  readonly radius?: number;
}

const SURFACES = new Map<string, SurfaceRecord>();

export function registerSurface(name: string, record: SurfaceRecord): void {
  SURFACES.set(name, record);
}

/**
 * `undefined` for a name nobody registered. The painter SKIPS such a node rather than
 * throwing: an unknown record is a content mistake, and taking the whole scene down over one
 * of them would hide every node that was fine. It is visible where it should be — the node
 * still reports its `surface` reference to the inspector, so the dangling name is readable.
 */
export function surfaceRecord(name: string): SurfaceRecord | undefined {
  return SURFACES.get(name);
}

export function surfaceNames(): readonly string[] {
  return [...SURFACES.keys()];
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetSurfaces(): void {
  SURFACES.clear();
}

/**
 * The stock records. `plate` is what `Surfaced` defaults to, so a node composed with no
 * arguments is visible rather than mysteriously blank; `bare` is the same plate with the
 * border taken away, which is what the catalog switches to in order to show that the box
 * outlives the look.
 */
// The tokens are the EXISTING ones, deliberately: the palette's rule is one job per token,
// and a `surfaceFill` holding exactly what `panelBg` holds would be the second token for one
// job that the rule forbids. When a real card face arrives its job genuinely differs, and it
// gets its own token then — not now, on speculation.
export function installStockSurfaces(): void {
  registerSurface("plate", { fill: "panelBg", border: "accent", borderWidth: 0.03, radius: 0.08 });
  registerSurface("bare", { fill: "panelBg", radius: 0.08 });
}
