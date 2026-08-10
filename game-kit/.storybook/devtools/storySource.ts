// SHOW CODE — what a reader is supposed to copy.
//
// The HTML renderer's default snippet is the DOM the story RETURNED: a wall of divs with
// inline styles, which is output, not source. `type: "code"` switches the block to the story's
// own text instead — but that text is a STORY: an object literal with `render` and `args` and
// catalog bookkeeping, none of which anyone writes in a game. A reader copying it gets a
// Storybook story, not a scene.
//
// So the story is UNWRAPPED here: arguments become the constants they stand for, the render
// body becomes the program, and the catalog's own shell (`scene`) becomes the kit's real door
// (`mount`). What is left is code that would run.

/**
 * Names a reader can import verbatim, and the door they come through.
 *
 * The atoms belong on this list as much as the functions do — `Bounded({ … })` is a call, and a
 * snippet that used one under an import line that did not mention it was a snippet that would
 * not run.
 */
const KIT_API = [
  "node",
  "add",
  "byId",
  "localIds",
  "mount",
  "inspect",
  "installTheme",
  "attachPainter",
  "registerSurface",
  "registerAsset",
  "Bounded",
  "Surfaced",
  // The shape helpers: a snippet that says `star(5, 0.9, 0.42)` has to import `star`.
  "rect",
  "roundedRect",
  "circle",
  "ellipse",
  "polygon",
  "star",
  "polyline",
  "fromSvgPath",
  // A line, the little tree an arrow is, and the registry that has to be filled before either
  // end can be named.
  "line",
  "arrow",
  "installStockHeads",
  "transformShape",
  "Transformable",
  "Container",
  // The pose dealers: a snippet that says `fan(5, { spread: 60 })` has to import `fan`.
  "fan",
  "stack",
  "cascade",
];

/**
 * CATALOG HELPERS THAT STAND FOR A VALUE, and what that value actually is.
 *
 * A story's render is driven by the panel, so it cannot write a shape out — it calls something
 * that turns a row of flat controls into one. `shapeOf(a)` is honest code and a useless
 * snippet: the reader does not have `shapeOf`, and the one thing they came here to see is what
 * a `bounds` value LOOKS like.
 *
 * So the call is replaced by its result, computed from the arguments the story is showing right
 * now. Move a control and the snippet changes with the picture — which is the same promise the
 * rest of the panel already makes.
 *
 * Registered from the catalog rather than imported here: this module knows how to rewrite a
 * snippet and must not learn what a shape is.
 */
const INLINE = new Map<string, (args: Record<string, unknown>) => unknown>();

export function registerSnippetValue(name: string, of: (args: Record<string, unknown>) => unknown): void {
  INLINE.set(name, of);
}

/**
 * Source, already written. A registered value normally comes back as DATA and is printed as a
 * literal; this says "print these characters" — for the case where the honest answer is a call
 * rather than the thing the call returns.
 */
const RAW = Symbol("raw");

export function raw(code: string): unknown {
  return { [RAW]: code };
}

/** Catalog bookkeeping: true of the story, and says nothing about the kit. */
const BOOKKEEPING = ["parameters", "gkDoc", "gkDocStory", "argTypes", "tags", "name"];

function importsFor(code: string): string[] {
  const used = KIT_API.filter((n) => new RegExp(`\\b${n}\\s*\\(`).test(code));
  return used.length ? [`import { ${used.join(", ")} } from "game-kit"`, ""] : [];
}

/**
 * Which characters are TEXT rather than syntax — inside a string, a template or a comment.
 * Without this a comma in a name or a brace in a comment ends a member early, and the snippet
 * comes out cut in half: wrong in a way that still looks like code.
 */
function litMask(code: string): boolean[] {
  const mask = new Array<boolean>(code.length).fill(false);
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (c === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") mask[i++] = true;
    } else if (c === "/" && next === "*") {
      const end = code.indexOf("*/", i + 2);
      const stop = end < 0 ? code.length : end + 2;
      while (i < stop) mask[i++] = true;
    } else if (c === '"' || c === "'" || c === "`") {
      mask[i++] = true;
      while (i < code.length) {
        if (code[i] === "\\") {
          mask[i++] = true;
          mask[i++] = true;
          continue;
        }
        const closes = code[i] === c;
        mask[i++] = true;
        if (closes) break;
      }
    } else {
      i += 1;
    }
  }
  return mask;
}

/** The same text with every literal blanked, so a regex sees syntax only. */
function plainOf(code: string, mask: boolean[]): string {
  return [...code].map((c, i) => (mask[i] && c !== "\n" ? " " : c)).join("");
}

/** Where the value of a top-level member starts and ends: `render: <here>`, balanced. */
function spanOf(code: string, name: string): { start: number; end: number; from: number } | undefined {
  const mask = litMask(code);
  const plain = plainOf(code, mask);
  const at = plain.search(new RegExp(`(^|[\\s{,])${name}\\s*:`, "m"));
  if (at < 0) return undefined;
  const from = plain.indexOf(name, at);
  let i = plain.indexOf(":", from) + 1;
  const start = i;
  let depth = 0;
  for (; i < code.length; i += 1) {
    if (mask[i]) continue;
    const c = code[i];
    if (c === "{" || c === "[" || c === "(") depth += 1;
    else if (c === "}" || c === "]" || c === ")") {
      if (depth === 0) break; // the closing brace of the object itself
      depth -= 1;
    } else if (c === "," && depth === 0) break;
  }
  return { start, end: i, from };
}

/** The text of one member's value, or `undefined` when the member is not there. */
export function memberOf(code: string, name: string): string | undefined {
  const span = spanOf(code, name);
  return span ? code.slice(span.start, span.end).trim() : undefined;
}

/**
 * Remove a member and its value, braces balanced. Left in the snippet, catalog bookkeeping
 * would be copied into a reader's own code as if it were part of building a scene.
 */
export function stripMember(code: string, name: string): string {
  const span = spanOf(code, name);
  if (!span) return code;
  const after = code[span.end] === "," ? span.end + 1 : span.end;
  return `${code.slice(0, span.from)}${code.slice(after)}`
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/\{\s*,/g, "{")
    .replace(/\n\s*\n/g, "\n");
}

/** Top-level `name: value` pairs of an object literal, in the order they were written. */
function membersOf(objText: string): Array<{ name: string; value: string }> {
  const inner = objText.trim().replace(/^\{/, "").replace(/\}$/, "");
  const mask = litMask(inner);
  const plain = plainOf(inner, mask);
  const out: Array<{ name: string; value: string }> = [];
  let depth = 0;
  let cut = 0;
  const push = (piece: string): void => {
    // The colon has to be at DEPTH ZERO. Taking the first one anywhere splits `...spread(x, { a:
    // 1 })` at the colon INSIDE it, and the snippet came out as `const ...spread(x, { a = 1 }`
    // — invalid in a way that still looks like code, which is the worst kind of wrong.
    const colon = topLevelColon(piece);
    if (colon > 0) {
      out.push({ name: piece.slice(0, colon).trim(), value: piece.slice(colon + 1).trim() });
    } else if (piece.trim()) {
      // A spread, or shorthand: no name to give it, and dropping it would quietly change the
      // scene the snippet builds. Carried through whole, under its own text.
      out.push({ name: "", value: piece.trim() });
    }
  };
  for (let i = 0; i < inner.length; i += 1) {
    if (mask[i]) continue;
    const c = plain[i];
    if (c === "{" || c === "[" || c === "(") depth += 1;
    else if (c === "}" || c === "]" || c === ")") depth -= 1;
    else if (c === "," && depth === 0) {
      push(inner.slice(cut, i));
      cut = i + 1;
    }
  }
  push(inner.slice(cut));
  // A nameless member is a SPREAD and is kept — it carries values the scene is built from, and
  // dropping it changes the snippet's picture without saying so. What goes is a piece that is
  // only a comment.
  return out.filter((m) => (m.name ? !m.name.startsWith("//") : Boolean(m.value)));
}

/** The index of the `:` that separates a member's name from its value, or -1 for a spread. */
function topLevelColon(piece: string): number {
  const mask = litMask(piece);
  const plain = plainOf(piece, mask);
  let depth = 0;
  for (let i = 0; i < plain.length; i += 1) {
    if (mask[i]) continue;
    const c = plain[i];
    if (c === "{" || c === "[" || c === "(") depth += 1;
    else if (c === "}" || c === "]" || c === ")") depth -= 1;
    else if (c === ":" && depth === 0) return i;
  }
  return -1;
}

/**
 * What the render function calls its argument: `({ w, h })` destructured, or `(a)` whole.
 *
 * It decides how the story's `args` become code. Destructured, each one is a constant the body
 * already names; taken whole, the body says `a.w`, and a pile of loose constants would refer to
 * nothing. Assuming the first shape produced snippets that could not run — which is exactly the
 * failure the panel exists to prevent.
 */
function paramOf(render: string): string {
  const plain = plainOf(render, litMask(render));
  const arrow = plain.indexOf("=>");
  if (arrow < 0) return "";
  const head = render.slice(0, arrow).trim();
  return head.startsWith("(") ? head.slice(1, head.lastIndexOf(")")).trim() : head;
}

/** Shift a block back to column zero — a render body is indented by the story around it. */
function dedent(text: string): string {
  const lines = text.replace(/^\n+|\s+$/g, "").split("\n");
  const pads = lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length);
  const pad = pads.length ? Math.min(...pads) : 0;
  return lines.map((l) => l.slice(pad)).join("\n");
}

/** The program inside `render`, whether it was written as a block or as one expression. */
function bodyOf(render: string): string {
  const arrow = plainOf(render, litMask(render)).indexOf("=>");
  const body = (arrow < 0 ? render : render.slice(arrow + 2)).trim();
  return body.startsWith("{") ? dedent(body.slice(1, -1)) : body;
}

/**
 * `scene(x).el` is the CATALOG's shell — a view plus this canvas's toolbar. A game calls the
 * kit's own door, and that is the line the snippet must show: leaving `scene` in taught a name
 * that does not exist outside this website.
 */
function toMount(code: string): string {
  // Balanced, not a regex. A regex has to guess where the call ends, and every guess was wrong
  // in its own way: line-bound, it left a multi-line `return scene(…).el` verbatim — the
  // catalog's shell taught as the kit's door, and a bare top-level `return`, which does not
  // parse. Widened, it swallowed the scene's SECOND argument, a catalog option `mount` has
  // never heard of, and produced a call that would throw.
  //
  // Only the first argument crosses over, because only the first argument is the tree.
  let out = code;
  for (;;) {
    const at = plainOf(out, litMask(out)).indexOf("scene(");
    if (at < 0) return out;
    const open = at + "scene(".length;
    const mask = litMask(out);
    let depth = 0;
    let firstArgEnd = -1;
    let close = -1;
    for (let i = open; i < out.length; i += 1) {
      if (mask[i]) continue;
      const c = out[i];
      if (c === "(" || c === "{" || c === "[") depth += 1;
      else if (c === ")" || c === "}" || c === "]") {
        if (c === ")" && depth === 0) {
          close = i;
          break;
        }
        depth -= 1;
      } else if (c === "," && depth === 0 && firstArgEnd < 0) firstArgEnd = i;
    }
    if (close < 0) return out;
    const root = out.slice(open, firstArgEnd < 0 ? close : firstArgEnd).trim();
    // THE SECOND ARGUMENT IS NOT ALWAYS NOISE. It is the catalog's own scene options, and most
    // of them are — a debug outline is a viewer's business and belongs in no snippet. But `bake`
    // is a real decision a reader makes in their own code, and dropping it left two stories
    // whose snippets were identical while their pictures were not. That is worse than showing
    // nothing: it says the choice is not in the code.
    const options = firstArgEnd < 0 ? "" : out.slice(firstArgEnd + 1, close).trim();
    const bake = /(^|[{,\s])bake\s*:/.test(options) ? bakeOf(options) : "";
    // `.el` is how a scene is used; a `return` in front of it belongs to the story, not to a
    // program that mounts once at the top level.
    const tail = out.slice(close + 1);
    const after = tail.startsWith(".el") ? close + 4 : close + 1;
    const head = out.slice(0, at).replace(/return\s+$/, "");
    const rest = out.slice(after).replace(/^;/, "");
    // With a paint option the truth is two lines: the host, then what paints it. `mount` makes
    // a host and nothing else — the painter is attached, and that is where the choice lives.
    out = bake
      ? `${head}const host = mount(document.querySelector("#app")!, ${root})\nattachPainter(host, painter, { bake: ${bake} })${rest}`
      : `${head}mount(document.querySelector("#app")!, ${root})${rest}`;
  }
}

/** The value of the `bake` member, brace-balanced — it is usually an arrow function. */
function bakeOf(options: string): string {
  const mask = litMask(options);
  const plain = plainOf(options, mask);
  const at = plain.search(/(^|[{,\s])bake\s*:/);
  if (at < 0) return "";
  let i = plain.indexOf(":", at) + 1;
  const start = i;
  let depth = 0;
  for (; i < options.length; i += 1) {
    if (mask[i]) continue;
    const c = options[i];
    if (c === "{" || c === "[" || c === "(") depth += 1;
    else if (c === "}" || c === "]" || c === ")") {
      if (depth === 0) break;
      depth -= 1;
    } else if (c === "," && depth === 0) break;
  }
  return options.slice(start, i).trim();
}

/**
 * A story object becomes the program it stands for. Anything that is already plain code (a
 * snippet handed in whole) is left alone.
 */
export function unwrapStory(code: string, live?: Record<string, unknown>): string {
  const text = code.trim();
  if (!text.startsWith("{")) return text;

  const render = memberOf(text, "render");
  if (render === undefined) return BOOKKEEPING.reduce(stripMember, text).trim();

  const args = memberOf(text, "args");
  const param = paramOf(render);
  const written = bodyOf(render);
  const body = inlineValues(written, live);
  // Pruning is tied to the INLINING, not applied on principle. A body that still calls into its
  // arguments may reach them in ways no scan can see — a spread, a loop over the object — and
  // dropping a member there would change the scene while looking tidier. What inlining leaves
  // behind is different: those members provably have no reader left.
  const inlined = body !== written;
  // Arguments are the story's knobs, and in a program they are just the values the reader
  // chose. Named constants keep the body readable — and keep the two in step, because the body
  // goes on referring to them.
  //
  // Unless the body took the whole object under one name, in which case that is what it must
  // get: `const a = { … }`, exactly as written, spreads and all.
  const whole = param && !param.startsWith("{");
  const consts = (
    !args
      ? []
      : whole
        ? [inlined ? pruneConst(`const ${param} = ${args}`, body, param) : `const ${param} = ${args}`]
        : membersOf(args).map((m) => (m.name ? `const ${m.name} = ${m.value}` : m.value))
  ).filter(Boolean);
  const parts = consts.length ? [...consts, "", body] : [body];
  return parts.join("\n");
}

/**
 * A value as the source a reader would have typed. Not `JSON.stringify`: keys are bare, strings
 * take double quotes, and a long list of points is broken across lines rather than run off the
 * side of a panel that scrolls the wrong way.
 */
export function literal(value: unknown, indent = ""): string {
  if (value !== null && typeof value === "object" && RAW in (value as object)) {
    return (value as Record<symbol, string>)[RAW]!;
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || typeof value !== "object") return String(value);
  const pad = `${indent}  `;
  if (Array.isArray(value)) {
    const parts = value.map((v) => literal(v, pad));
    const oneLine = `[${parts.join(", ")}]`;
    if (oneLine.length + indent.length <= 96) return oneLine;
    // Packed four to a row while the elements are SMALL — a list of points reads as a list that
    // way, and one `{ x, y }` per line would be forty lines of nothing. Anything bigger goes one
    // per row: four curve segments on a line is a 230-character line, which is not a snippet a
    // reader scrolls, it is one they scroll sideways.
    const perRow = parts.every((part) => part.length <= 24) ? 4 : 1;
    const rows: string[] = [];
    for (let i = 0; i < parts.length; i += perRow) rows.push(`${pad}${parts.slice(i, i + perRow).join(", ")}`);
    return `[\n${rows.join(",\n")},\n${indent}]`;
  }
  const members = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${literal(v, pad)}`);
  const oneLine = `{ ${members.join(", ")} }`;
  return oneLine.length + indent.length <= 96 ? oneLine : `{\n${members.map((m) => `${pad}${m}`).join(",\n")},\n${indent}}`;
}

/** `shapeOf(a)` becomes the shape itself — see `INLINE` above for why. */
function inlineValues(code: string, args: Record<string, unknown> | undefined): string {
  if (!args) return code;
  let out = code;
  for (const [name, of] of INLINE) {
    // The whole call including its argument: the helper takes the args object, and there is
    // exactly one of those. Indented from the column the call sat in — a value printed from
    // column zero into the middle of a nested call comes out looking like a different block.
    out = out.replace(new RegExp(`\\b${name}\\(\\s*\\w+\\s*\\)`, "g"), (_m, at: number) => {
      const lineStart = out.lastIndexOf("\n", at) + 1;
      const indent = out.slice(lineStart, at).match(/^\s*/)![0];
      return literal(of(args), indent);
    });
  }
  return out;
}

/**
 * Members of a whole-object `const a = { … }` that the body never mentions.
 *
 * They arrive honestly — they are the story's arguments — and after a value is inlined they
 * become a lie: a reader edits `points` in the constant and nothing above it reads `a.points`
 * any more. What the body does not use is not part of the program.
 */
function pruneConst(consts: string, body: string, param: string): string {
  const at = consts.indexOf("{");
  if (!param || at < 0) return consts;
  const members = membersOf(consts.slice(at));
  // A SPREAD IS DROPPED ONLY WHEN NOTHING COULD HAVE COME FROM IT. Its members cannot be read
  // from the text, so the question is asked the other way round: if every `a.x` the body reads
  // is a member written out by name, then whatever the spread carries, nothing reads it.
  //
  // This is what `...shapeArgs(), ...RECORD_ARGS` was — two names a reader does not have, on the
  // first line of a snippet whose whole purpose is to be copied, standing for values that had
  // already been inlined further down.
  const named = new Set(members.filter((m) => m.name).map((m) => m.name));
  const reads = [...body.matchAll(new RegExp(`\\b${param}\\.(\\w+)`, "g"))].map((m) => m[1]!);
  const spreadFeedsNothing = reads.every((r) => named.has(r));
  const kept = members
    .filter((m) => (m.name ? body.includes(`${param}.${m.name}`) : !spreadFeedsNothing))
    .map((m) => (m.name ? `${m.name}: ${m.value}` : m.value));
  return kept.length ? `const ${param} = { ${kept.join(", ")} }` : "";
}

export const storySource = {
  type: "code" as const,
  language: "ts",
  // Storybook hands the story's CONTEXT alongside its text, and the arguments in it are the
  // ones on screen — which is what makes an inlined value follow the controls instead of
  // freezing whatever the file was written with.
  transform: (code: string, context?: { args?: Record<string, unknown> }): string => {
    const body = toMount(unwrapStory(code, context?.args)).trim();
    // A story whose source was not extracted must not silently show imports under nothing:
    // better an obviously empty snippet than a plausible wrong one.
    return body ? [...importsFor(body), body].join("\n") : body;
  },
};
