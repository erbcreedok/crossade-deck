// ACCEPTRULE — a serializable predicate over an element and the container it is offered to.
//
// One mechanism gates every drop-into-a-zone: a rule is DATA (no functions), so it travels the
// wire into multiplayer and is read the same on every client. Behaviour is a NAMED registry
// entry elsewhere; this is just the yes/no/ask a zone answers when something hovers it.
//
// The verdict is THREE-VALUED. `ask` means "the client cannot decide alone" — a preview treats
// it as allow, and a real request to the server is born only if `ask` survives to the top. So a
// chip over someone else's hand raises neither a reaction nor a request: the form check denies
// first, and `and` lets deny win before any `ask` is reached.
//
// The four leaf predicates, in the order the design prefers them:
//   { can: "flip" }              — a CAPABILITY. Most durable: not tied to a sort's name.
//   { has: "card" }              — a TRAIT, flat data. Honest when the game truly is about a sort.
//   { eq: [path, x] } / { lt }   — a VALUE over declared paths. Relational card rules need it.
//   { flag: "eaten" }            — a runtime STATE, read as a truthy value by the same machine.
// Combined by { and } , { or } , { not }. See docs/design/container.md and NIGHT-DECISIONS.md.

export type Verdict = "allow" | "deny" | "ask";

/** What the evaluator knows about one element — built from a node by `subjectOf`, never the node. */
export interface Subject {
  readonly caps: ReadonlySet<string>;
  readonly values: Readonly<Record<string, unknown>>;
  readonly traits: ReadonlySet<string>;
  /** A reference to the element's box (`Owned.box`), for `el.box` paths. */
  readonly box?: string;
  /** The element set it belongs to, for `el.set` paths. */
  readonly set?: string;
}

/** What the evaluator knows about the container being dropped ONTO. */
export interface TargetSubject {
  readonly count: number;
  /** The top element, or `undefined` for an empty pile — then `target.top.*` is a missing path. */
  readonly top?: Subject;
  /** Whose zone it is, when it says. Absent is a zone belonging to nobody, and the path is missing. */
  readonly owner?: string;
}

/** Who is doing it. Absent where nobody said — a move made by the game itself, or an old caller. */
export interface ActorSubject {
  readonly seat: string;
}

export interface AcceptContext {
  readonly el: Subject;
  readonly target: TargetSubject;
  /**
   * THE ONE ASKING. Without it "my own hand takes it, someone else's asks" cannot be written as a
   * rule at all, and the difference would have to live in a runtime — which is exactly where a rule
   * stops travelling and stops being the same for every client.
   */
  readonly actor?: ActorSubject;
}

/** A literal, or a `{ path }` — but a bare string that begins `el.`/`target.` IS read as a path. */
export type Operand = string | number | boolean | { readonly path: string };

export type AcceptRule =
  | { readonly can: string }
  | { readonly has: string }
  | { readonly eq: readonly [string, Operand] }
  | { readonly lt: readonly [string, Operand] }
  | { readonly flag: string }
  | { readonly ask: AcceptRule }
  | { readonly and: readonly AcceptRule[] }
  | { readonly or: readonly AcceptRule[] }
  | { readonly not: AcceptRule };

const MISSING = Symbol("missing-path");

/** Resolve a dotted path against the context. `MISSING` when the path does not exist — a drop
 *  compared with a missing path is DENIED, never asked and never an error (empty pile, absent field). */
function resolvePath(path: string, ctx: AcceptContext): unknown | typeof MISSING {
  const parts = path.split(".");
  if (parts[0] === "target") {
    if (parts[1] === "count" && parts.length === 2) return ctx.target.count;
    if (parts[1] === "owner" && parts.length === 2) return ctx.target.owner ?? MISSING;
    if (parts[1] === "top") return readSubject(ctx.target.top, parts.slice(2));
    return MISSING;
  }
  if (parts[0] === "el") return readSubject(ctx.el, parts.slice(1));
  if (parts[0] === "actor" && parts[1] === "seat" && parts.length === 2) return ctx.actor?.seat ?? MISSING;
  return MISSING;
}

function readSubject(subject: Subject | undefined, rest: readonly string[]): unknown | typeof MISSING {
  if (!subject) return MISSING; // an empty pile has no top: `target.top.*` is missing, not null
  if (rest.length === 1 && rest[0] === "box") return subject.box ?? MISSING;
  if (rest.length === 1 && rest[0] === "set") return subject.set ?? MISSING;
  if (rest[0] === "values" && rest.length === 2) {
    const key = rest[1]!;
    return key in subject.values ? subject.values[key] : MISSING;
  }
  return MISSING;
}

/** An operand is a literal unless it is a `{ path }` or a bare string that names a path root. */
function resolveOperand(op: Operand, ctx: AcceptContext): unknown | typeof MISSING {
  if (typeof op === "object") return resolvePath(op.path, ctx);
  if (typeof op === "string" && (op.startsWith("el.") || op.startsWith("target.") || op.startsWith("actor."))) return resolvePath(op, ctx);
  return op;
}

/** The verdict of one rule against one context. Pure and total: it never throws (validate first). */
export function evaluate(rule: AcceptRule, ctx: AcceptContext): Verdict {
  if ("can" in rule) return ctx.el.caps.has(rule.can) ? "allow" : "deny";
  if ("has" in rule) return ctx.el.traits.has(rule.has) ? "allow" : "deny";
  if ("flag" in rule) return ctx.el.values[rule.flag] ? "allow" : "deny";

  if ("eq" in rule || "lt" in rule) {
    const [pathA, opB] = "eq" in rule ? rule.eq : rule.lt;
    const a = resolvePath(pathA, ctx);
    const b = resolveOperand(opB, ctx);
    if (a === MISSING || b === MISSING) return "deny"; // a comparison with a missing path is a quiet no
    if ("eq" in rule) return a === b ? "allow" : "deny";
    return typeof a === "number" && typeof b === "number" && a < b ? "allow" : "deny";
  }

  if ("ask" in rule) {
    // A preview leans yes; the server must confirm. Inner deny still denies — nothing to ask about.
    return evaluate(rule.ask, ctx) === "deny" ? "deny" : "ask";
  }

  if ("and" in rule) {
    let sawAsk = false;
    for (const r of rule.and) {
      const v = evaluate(r, ctx);
      if (v === "deny") return "deny"; // deny dominates
      if (v === "ask") sawAsk = true;
    }
    return sawAsk ? "ask" : "allow";
  }
  if ("or" in rule) {
    let sawAsk = false;
    for (const r of rule.or) {
      const v = evaluate(r, ctx);
      if (v === "allow") return "allow"; // allow dominates
      if (v === "ask") sawAsk = true;
    }
    return sawAsk ? "ask" : "deny";
  }
  // not — the validator has already refused `not` over anything that can ask, so this is total.
  const v = evaluate(rule.not, ctx);
  return v === "allow" ? "deny" : "allow";
}

/** Could this rule ever return `ask`? Static, so the validator can refuse `not` over one that can. */
function canYieldAsk(rule: AcceptRule): boolean {
  if ("ask" in rule) return true;
  if ("and" in rule) return rule.and.some(canYieldAsk);
  if ("or" in rule) return rule.or.some(canYieldAsk);
  if ("not" in rule) return canYieldAsk(rule.not);
  return false;
}

/**
 * Refuse the one shape the algebra cannot mean: `not` over something that can `ask`. "Do not ask"
 * is nonsense, so it is a build error, not a runtime surprise. Throws with the offending shape.
 */
export function validateRule(rule: AcceptRule): void {
  if ("not" in rule) {
    if (canYieldAsk(rule.not)) throw new Error(`AcceptRule: 'not' over a rule that can 'ask' is forbidden`);
    validateRule(rule.not);
  } else if ("ask" in rule) validateRule(rule.ask);
  else if ("and" in rule) rule.and.forEach(validateRule);
  else if ("or" in rule) rule.or.forEach(validateRule);
}

/** The preview answer: a hover shows welcome when the verdict is not a flat deny (`ask` reads yes). */
export function previewAllows(rule: AcceptRule, ctx: AcceptContext): boolean {
  return evaluate(rule, ctx) !== "deny";
}

/** A real request to the server is born only when `ask` survives to the top of the rule. */
export function needsRequest(rule: AcceptRule, ctx: AcceptContext): boolean {
  return evaluate(rule, ctx) === "ask";
}
