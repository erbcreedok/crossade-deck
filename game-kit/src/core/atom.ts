// ATOMS — the composable interfaces a node is assembled from.
//
// An atom is a small contract with one law. It is NOT a base class and nothing extends
// anything: a node is assembled, never subclassed. See CANONS.md §"Node".
//
// A requirement says what an atom LACKS, not who its parent in a hierarchy is. That is why
// it can be an ALTERNATIVE: `Surfaced` needs an AREA, and an area comes either from an own
// size (`Bounded`) or from the extent of the content (`Container`). Demanding `Bounded`
// there would outlaw the tabletop, which has a surface and no footprint of its own.

/**
 * One requirement. A plain name must be present; an array is satisfied by ANY of its
 * members. All entries must hold — so the shape is "all of these groups, any within a group".
 */
export type Requirement = string | readonly string[];

export interface AtomDef<Fields extends object = object> {
  /** Name as it appears in caps() and in the catalog. Unique across the registry. */
  readonly name: string;
  /** What must already be there. Empty = nothing. */
  readonly requires: readonly Requirement[];
  /** Field defaults. The spec is DATA: no functions may live here. */
  readonly defaults: Fields;
}

export interface Atom<Fields extends object = object> {
  readonly def: AtomDef<Fields>;
  readonly fields: Fields;
}

const REGISTRY = new Map<string, AtomDef>();

/** Declare an atom. Registering twice under one name is a programming error, not a merge. */
export function defineAtom<Fields extends object>(def: AtomDef<Fields>): (fields?: Partial<Fields>) => Atom<Fields> {
  if (REGISTRY.has(def.name)) throw new Error(`atom "${def.name}" is already defined`);
  assertSerializable(def.name, def.defaults);
  REGISTRY.set(def.name, def as AtomDef);
  return (fields?: Partial<Fields>) => {
    if (fields) assertSerializable(def.name, fields);
    return { def, fields: { ...def.defaults, ...fields } };
  };
}

export function atomDef(name: string): AtomDef | undefined {
  return REGISTRY.get(name);
}

export function allAtoms(): readonly AtomDef[] {
  return [...REGISTRY.values()];
}

/** Test seam only: the registry is process-wide, and suites must not leak into each other. */
export function resetAtoms(): void {
  REGISTRY.clear();
}

/** Is a requirement met by this set of names? An array entry is satisfied by any member. */
export function requirementMet(req: Requirement, present: ReadonlySet<string>): boolean {
  return typeof req === "string" ? present.has(req) : req.some((r) => present.has(r));
}

/** Human-readable requirement, for the inspector and for failure messages. */
export function requirementLabel(def: AtomDef): string {
  return def.requires.map((r) => (typeof r === "string" ? r : r.join(" or "))).join(" + ");
}

/**
 * A spec holds only data. A function in it would neither travel the wire nor be saved, and
 * behaviour is attached by NAMING a registry entry instead. Guarded here rather than by a
 * scan alone, because the scan cannot see a value built at runtime.
 */
function assertSerializable(atomName: string, fields: object): void {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "function") {
      throw new Error(`atom "${atomName}": field "${key}" is a function — a spec is data only`);
    }
  }
}
