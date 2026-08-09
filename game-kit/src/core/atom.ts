// ATOMS — the composable interfaces a node is assembled from.
//
// An atom is a small contract with one law. It is NOT a base class and nothing extends
// anything: a node is assembled, never subclassed. See CANONS.md §"Node".
//
// A requirement says what an atom LACKS, not who its parent in a hierarchy is. That is why
// it can be an ALTERNATIVE: `Surfaced` needs an AREA, and an area comes either from an own
// size (`Bounded`) or from the extent of the content (`Container`). Demanding `Bounded`
// there would outlaw the desk, which has a surface and no footprint of its own.

/**
 * One requirement. A plain name must be present; an array is satisfied by ANY of its
 * members. All entries must hold — so the shape is "all of these groups, any within a group".
 */
export type Requirement = string | readonly string[];

/**
 * There are exactly FOUR, and there is no fifth. A name alone does not say enough about a
 * field: until its inheritance rule is declared, every reader works it out again, and that is
 * how `z` came to argue with the shadow three times in client1.
 *  - own       — never inherited; no value means no field.
 *  - fromOwner — not set here → the nearest set value up the chain. Override = set it.
 *  - addsUp    — the sum along the chain. It cannot be cancelled, only added to.
 *  - multiplies — the PRODUCT along the chain. Scale is the one field that composes this way:
 *                a half-size hand holding a half-size card shows it at a quarter, and no sum
 *                says that. Like `addsUp` it cannot be cancelled, only multiplied into.
 *  - rootOnly  — the field does not exist on a child; asking is meaningless.
 */
export type InheritClass = "own" | "fromOwner" | "addsUp" | "multiplies" | "rootOnly";

export interface AtomDef<Fields extends object = object> {
  /** Name as it appears in caps() and in the catalog. Unique across the registry. */
  readonly name: string;
  /** What must already be there. Empty = nothing. */
  readonly requires: readonly Requirement[];
  /** Field defaults. The spec is DATA: no functions may live here. */
  readonly defaults: Fields;
  /**
   * The inheritance class of EVERY field, declared once here and read everywhere. Enforced at
   * definition time rather than by a scan alone: a scan cannot see an atom built at runtime,
   * and a field that quietly defaults to `own` is the bug this field exists to prevent.
   */
  readonly classes: { readonly [K in keyof Fields]-?: InheritClass };
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
  assertClassed(def);
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

/**
 * The declared class of one field. Unknown atom or unknown field is `undefined` — the caller
 * decides what that means, because "no such field" and "a field with no rule" are different
 * failures and only the second one is a bug here.
 */
export function classOf(atom: string, field: string): InheritClass | undefined {
  const def = REGISTRY.get(atom);
  return def ? (def.classes as Record<string, InheritClass>)[field] : undefined;
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
/**
 * Every default field must declare a class, and nothing may declare one for a field that does
 * not exist — a rule attached to a misspelled name is a rule nobody applies.
 */
function assertClassed(def: AtomDef<object>): void {
  const declared = def.classes as Record<string, InheritClass>;
  for (const key of Object.keys(def.defaults)) {
    if (!declared[key]) {
      throw new Error(`atom "${def.name}": field "${key}" declares no inheritance class`);
    }
  }
  for (const key of Object.keys(declared)) {
    if (!(key in def.defaults)) {
      throw new Error(`atom "${def.name}": class declared for unknown field "${key}"`);
    }
  }
}

function assertSerializable(atomName: string, fields: object): void {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "function") {
      throw new Error(`atom "${atomName}": field "${key}" is a function — a spec is data only`);
    }
  }
}
