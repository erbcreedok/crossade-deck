// MARKS REGISTRY — what a mark's name points AT.
//
// A mark names a registry record `{ icon: string }`, where `icon` is an asset name.
// Rules are data: adding a new mark is a registration record, not an engine modification.

export interface MarkRecord {
  /** The asset name pointing to the mark's icon drawing. */
  readonly icon: string;
}

const MARKS = new Map<string, MarkRecord>();

export function registerMark(name: string, record: MarkRecord): void {
  MARKS.set(name, record);
}

export function markRecord(name: string): MarkRecord | undefined {
  return MARKS.get(name);
}

export function markNames(): readonly string[] {
  return [...MARKS.keys()];
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetMarks(): void {
  MARKS.clear();
}

/** The 7 stock marks shipped with the kit. Called by the consumer, not on import. */
export function installStockMarks(): void {
  registerMark("lifted", { icon: "mark.lifted" });
  registerMark("moved", { icon: "mark.moved" });
  registerMark("captured", { icon: "mark.captured" });
  registerMark("removed", { icon: "mark.removed" });
  registerMark("flipped", { icon: "mark.flipped" });
  registerMark("shuffled", { icon: "mark.shuffled" });
  registerMark("thrown", { icon: "mark.thrown" });
}
