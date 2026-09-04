// MARKS REGISTRY — what a mark's name points AT.
//
// A mark names a registry record `{ icon: string }`, where `icon` is an asset name.
// Rules are data: adding a new mark is a registration record, not an engine modification.

export interface MarkRecord {
  /** The asset name pointing to the mark's icon drawing. */
  readonly icon: string;
}

const MARKS = new Map<string, MarkRecord>();
const INKS = new Map<string, string>();

const DEFAULT_INKS: Readonly<Record<string, string>> = {
  south: "gold",
  north: "teal",
  east: "ruby",
  west: "emerald",
};

export function registerMark(name: string, record: MarkRecord): void {
  MARKS.set(name, record);
}

export function markRecord(name: string): MarkRecord | undefined {
  return MARKS.get(name);
}

export function markNames(): readonly string[] {
  return [...MARKS.keys()];
}

export function registerInk(seat: string, ink: string): void {
  INKS.set(seat, ink);
}

export function inkRecord(seat: string): string | undefined {
  return INKS.get(seat);
}

export function resetInks(): void {
  INKS.clear();
}

export function resolveInk(seat: string, policyInks?: Record<string, string>): string {
  if (policyInks && policyInks[seat] !== undefined) {
    return policyInks[seat]!;
  }
  const registered = INKS.get(seat);
  if (registered !== undefined) {
    return registered;
  }
  if (seat in DEFAULT_INKS) {
    return DEFAULT_INKS[seat]!;
  }
  return seat;
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetMarks(): void {
  MARKS.clear();
  resetInks();
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
