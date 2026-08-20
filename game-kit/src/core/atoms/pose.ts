// POSER — what a zone decides about an arriving load's REST, one grain at a time.
//
// A pose at rest has grains — where it sits, which way it is turned, which side is up — and the
// owner's law (`docs/scenarios/pose.md`) is that a zone answers each of them SEPARATELY, with one
// of exactly three answers:
//
//   DERIVE — take what the arrangement says.   A grid straightens, a fan splays.
//   STAMP  — impose a number, history ignored. The discard lies face down; the mat squares up.
//   KEEP   — take what the load brought in.    The free desk remembers the 15° a finger left.
//
// That triple replaces three older mechanisms at once — the "stamping zone", the "keeper zone", and
// reading the load's PREVIOUS owner to break a tie. The last one is the one worth naming: a rule
// that consults where a piece came FROM is a rule about a trajectory, and a trajectory exists only
// for whoever watched it. A viewer who joins afterwards, or a server after a reconnect, sees a
// different answer to the same question. So a zone reads STATE (its own rules, the chain it hangs
// in, the shared config) and never the road travelled.
//
// The three are RECORDS IN A REGISTRY, not a union of three names. That is not ceremony: scenario F
// needs a game to write its own — a sandbox whose "open desk" switch makes the face-down stack lay
// its cards face UP, a poker hand that opens at showdown — and a fourth answer must cost a
// `registerGrain` call in a game's own file, never a branch in here (CANONS §1, `guard.no-kind`).
//
// IN FLIGHT IS NOT AT REST. While a gesture owns a piece its turn is local, per-frame and predicted;
// it goes over no wire. This file answers only the other question — where the piece comes to rest
// once the gesture lets go — and that answer is authoritative. HOW it travels there (instantly, or
// after lying askew for five seconds) is `settle`, and lives with the clock.

import { defineAtom } from "../atom.js";
import { fieldsOf, type Node } from "../node.js";
import { facing, type Facing } from "./flippable.js";

/** What a grain record is told. Three numbers, and never the road the load travelled. */
export interface GrainInput {
  /** What the ARRANGEMENT says for this grain. `undefined` — it has no opinion about the turn. */
  readonly laid: number | undefined;
  /** What the load CARRIES IN: the value the gesture left it at. `undefined` — it carries none. */
  readonly carried: number | undefined;
  /** The rule's own number — the angle a `stamp` imposes. Ignored by rules that read no number. */
  readonly value: number;
}

/** A rule for one grain: a pure function, so two clients resolving the same pose agree. */
export type GrainRecord = (input: GrainInput) => number;

/**
 * One grain's rule, as DATA on the zone: a registry name plus the single number the record reads.
 *
 * A name and a number, rather than `"stamp:0"` in one string, because the kit already spells a
 * parametric record that way everywhere else (`Coated`, `ParametricPaint`) and because a number
 * packed into a string is a number somebody has to parse back out.
 */
export interface GrainRule {
  /** Registry name: `derive`, `stamp`, `keep`, or a record a game registered itself. */
  readonly rule: string;
  /** The number the record reads. Zero where the rule reads none. */
  readonly value: number;
}

/** Take what the arrangement said. Nothing said means straight — which is what a grid means. */
export const derive = (): GrainRule => ({ rule: "derive", value: 0 });
/** Impose this number, whatever arrived. */
export const stamp = (value: number): GrainRule => ({ rule: "stamp", value });
/** Accept what the load brought in. Registered in BOTH registries — a grain keeps the same way. */
export const keep = (): GrainRule => ({ rule: "keep", value: 0 });
/** Show the face here, whatever arrived. The `side` grain's stamp. */
export const up = (): GrainRule => ({ rule: "up", value: 0 });
/** Show the back here, whatever arrived. */
export const down = (): GrainRule => ({ rule: "down", value: 0 });

const GRAINS = new Map<string, GrainRecord>();

export function registerGrain(name: string, record: GrainRecord): void {
  GRAINS.set(name, record);
}

export function grainRecord(name: string): GrainRecord | undefined {
  return GRAINS.get(name);
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetGrains(): void {
  GRAINS.clear();
  SIDES.clear();
  WATCHED.clear();
}

/**
 * The three supplied answers, under the names a zone's rules use. Called by the consumer rather
 * than run on import, for the reason `installStockLayouts` gives: a module with a side effect is a
 * module whose import ORDER matters, and that debt is always called in at the worst moment.
 */
export function installStockGrains(): void {
  registerGrain("derive", ({ laid }) => laid ?? 0);
  registerGrain("stamp", ({ value }) => value);
  registerGrain("keep", ({ carried }) => carried ?? 0);
  // The side's two stamps are named for what they SHOW, so they read as the plain words they are.
  registerSide("up", () => "up");
  registerSide("down", () => "down");
  registerSide("keep", ({ carried, turned }) => xor(carried, turned));
  // The other axis. `same` is the open desk, `back` the strict game, `opposite` a hand held
  // outwards — and the difference between the last two only shows once ONE card is turned: a
  // back-rule table still sees a back, this one sees a face.
  registerWatched("same", ({ owner }) => owner);
  registerWatched("back", ({ owner, mine }) => (mine ? owner : "down"));
  registerWatched("opposite", ({ owner, mine }) => (mine ? owner : xor(owner, "down")));
}

/**
 * What a SIDE record is told. Not a number, so it is a second registry rather than a cast — and the
 * design asked for two anyway, because the axes differ: this one is "how the side lands", the one
 * still to come is "what everyone ELSE is shown of it".
 */
export interface SideInput {
  /** The load's OWN side as it arrives: its bit alone, no owner's turn folded in. `keep` reads it. */
  readonly carried: Facing;
  /** Which way the ZONE lies — `down` when the zone itself is turned over, like a closed deck. */
  readonly turned: Facing;
  /** The zone, for a record that reads STATE: the chain it hangs in, a phase on the board above. */
  readonly zone: Node;
}

/**
 * A rule for the side. It answers WHAT THE OWNER SHOULD SEE, not which bit to write — the caller
 * writes it with `setFacing` once the load has changed owner, and that folds the zone's own turn
 * back in. So a stamp is the plain word it looks like: `up` means the owner sees a face, here,
 * whether or not this zone is itself upside down.
 */
export type SideRecord = (input: SideInput) => Facing;

const SIDES = new Map<string, SideRecord>();

export function registerSide(name: string, record: SideRecord): void {
  SIDES.set(name, record);
}

export function sideRecord(name: string): SideRecord | undefined {
  return SIDES.get(name);
}

/**
 * Two sides read together — the XOR the whole `side` grain rests on. Same answers `up` because a
 * card the right way up in a zone the right way up shows its face; differ and it is the back.
 *
 * The kit does not enforce this anywhere: `Flippable.turns` SUMS along the chain, so the parity of
 * a card inside a turned stack already is this. That is why a closed deck is a turned ZONE and not
 * a pile of turned cards — pull one out into an untouched hand and the face shows, with nothing
 * written to the card at all.
 */
function xor(a: Facing, b: Facing): Facing {
  return a === b ? "up" : "down";
}

/**
 * What a WATCHER record is told: the side the zone's owner sees, and whether the one looking is
 * that owner. A pure function of those two, so every client resolves the same picture.
 */
export interface WatchedInput {
  readonly owner: Facing;
  readonly mine: boolean;
}

/** How everyone ELSE relates to the owner's side — the second axis of facing. */
export type WatchRecord = (input: WatchedInput) => Facing;

const WATCHED = new Map<string, WatchRecord>();

export function registerWatched(name: string, record: WatchRecord): void {
  WATCHED.set(name, record);
}

export function watchedRecord(name: string): WatchRecord | undefined {
  return WATCHED.get(name);
}

export interface PoserFields {
  /** How the turn comes to rest here. */
  readonly angle: GrainRule;
  /** Which side is up once it lands. */
  readonly side: GrainRule;
  /**
   * What everyone ELSE is shown of that side: `same`, `back`, `opposite`, or a game's own record.
   * `""` — the zone says nothing and every seat sees what is there.
   *
   * NOT the same question as privacy. `Private` answers "is this card in your picture at all";
   * this answers "which side of it do you see" — a hand may be perfectly visible to the whole
   * table and still show its owner faces and everyone else backs.
   */
  readonly others: string;
  /**
   * Whose zone this is. Read ONLY by `others` today, which is why it sits here rather than in an
   * atom of its own; when a second reader arrives — a consent rule comparing an actor's seat to a
   * hand's owner — that is the moment to give it one.
   *
   * A zone with no owner and an `others` rule is a contradiction the design names: there is nobody
   * for the others to be relative to. It resolves as "everyone is the owner", so the rule is inert.
   */
  readonly owner: string;
}

/**
 * The rules a zone applies to what lands in it.
 *
 * REQUIRES `Container`, because a rule about an arriving load says nothing where nothing can
 * arrive — and an atom whose requirement is unmet is ABSENT, so such a zone imposes nothing at all.
 *
 * Every grain defaults to KEEP, so composing this atom and naming one grain changes ONLY that
 * grain. The other default was tried on paper and is worse: a `Poser` that derives by default would
 * quietly straighten a turn nobody asked it to touch, and the surprise would land on whoever added
 * an unrelated rule months later.
 */
export const Poser = defineAtom<PoserFields>({
  name: "Poser",
  requires: ["Container"],
  defaults: { angle: { rule: "keep", value: 0 }, side: { rule: "keep", value: 0 }, others: "", owner: "" },
  classes: { angle: "own", side: "own", others: "own", owner: "own" },
});

/** What the load BRINGS IN. Absent means it carries nothing to say about that grain. */
export interface CarriedPose {
  readonly angle?: number | undefined;
  /** The load's OWN side — its bit alone, as `Flippable` holds it, with no owner's turn added. */
  readonly side?: Facing | undefined;
}

/**
 * What the ARRANGEMENT says. Only the turn, because that is the only grain a layout can speak to
 * today: `place` returns points, and no registered arrangement has an opinion about a side. The day
 * a fan wants to splay its cards, its angle joins `place` and this type is where it arrives.
 */
export interface LaidPose {
  readonly angle?: number | undefined;
}

/** The resolved rest — every grain answered, because a piece at rest is somewhere definite. */
export interface RestPose {
  readonly angle: number;
  /** What the OWNER should see. Written with `setFacing` after the load has changed owner. */
  readonly side: Facing;
}

/** One grain, resolved. An unregistered name is SKIPPED — see `restPose`. */
function resolveGrain(rule: GrainRule, laid: number | undefined, carried: number | undefined): number {
  return grainRecord(rule.rule)?.({ laid, carried, value: rule.value }) ?? carried ?? 0;
}

/**
 * Where a load comes to REST in this zone: the zone's rules read against what the arrangement said
 * (`laid`) and what the gesture brought in (`carried`).
 *
 * A pure function of three data inputs and nothing else. It touches no tree and no clock, so the
 * same three inputs give the same pose on every client — which is the whole reason a rest pose can
 * be authoritative while the flight towards it stays local.
 *
 * A zone with no rules, and a rule naming a record nobody registered, both come out the same way:
 * the load keeps what it carried. That is the canon's two halves meeting — absence is the refusal,
 * and an unregistered name is skipped rather than thrown, so one bad string in a spec costs one
 * grain of one pose instead of the scene.
 */
export function restPose(zone: Node, carried: CarriedPose, laid: LaidPose): RestPose {
  const turned = facing(zone);
  const side = carried.side ?? "up";
  const rules = fieldsOf<PoserFields>(zone, "Poser");
  if (!rules) return { angle: carried.angle ?? 0, side: xor(side, turned) };
  const record = sideRecord(rules.side.rule);
  return {
    angle: resolveGrain(rules.angle, laid.angle, carried.angle),
    side: record ? record({ carried: side, turned, zone }) : xor(side, turned),
  };
}
