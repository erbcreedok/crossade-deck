// SHOW CODE — what a reader is supposed to copy.
//
// The HTML renderer's default snippet is the DOM the story RETURNED: a wall of divs with
// inline styles, which is output, not source. Nobody writes that, and nobody can learn the
// kit from it. `type: "code"` switches the block to the story's own text, the same lines that
// are in the `.stories.ts` file.
//
// Two things that text does NOT show, because the catalog supplies them, and without which
// the snippet reads as magic — where the names come from, and where the result meets the
// page. The transform puts both back.

/** Names a reader can import verbatim, and the door they come through. */
const KIT_API = ["node", "add", "byId", "localIds", "mount", "inspect", "installTheme"];
/** The catalog's own shell: a view plus its toolbar. Not part of the kit's API. */
const CATALOG_API = ["scene"];

function importsFor(code: string): string[] {
  const used = (names: string[]): string[] => names.filter((n) => new RegExp(`\\b${n}\\s*\\(`).test(code));
  const lines: string[] = [];
  const kit = used(KIT_API);
  if (kit.length) lines.push(`import { ${kit.join(", ")} } from "game-kit"`);
  if (used(CATALOG_API).length) {
    lines.push(
      "// `scene` is the CATALOG's shell around `mount` — a view plus this canvas's toolbar.",
      "// Your app calls `mount` directly; there is nothing else in it.",
    );
  }
  return lines.length ? [...lines, ""] : [];
}

const MOUNT_HINT = [
  "",
  "// the only line that touches the DOM — the kit builds nodes, the page shows them:",
  'document.querySelector("#app")?.append(el)',
].join("\n");

/**
 * Remove a member and its value from the story object literal, braces balanced. Catalog
 * bookkeeping (`gkDoc`, `gkDocStory`) says nothing about the kit, and a reader copying the
 * snippet would carry it into their own code as if it were part of building a scene.
 */
export function stripMember(code: string, name: string): string {
  const at = code.search(new RegExp(`(^|[\\s{,])${name}\\s*:`, "m"));
  if (at < 0) return code;
  const start = code.indexOf(name, at);
  let i = code.indexOf(":", start) + 1;
  let depth = 0;
  for (; i < code.length; i += 1) {
    const c = code[i];
    if (c === "{" || c === "[") depth += 1;
    else if (c === "}" || c === "]") {
      if (depth === 0) break; // the closing brace of the story object itself
      depth -= 1;
    } else if (c === "," && depth === 0) {
      i += 1;
      break;
    }
  }
  const cut = `${code.slice(0, start)}${code.slice(i)}`;
  // A member removed from the middle leaves a dangling comma or a blank line behind it.
  return cut
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/\{\s*,/g, "{")
    .replace(/\n\s*\n/g, "\n");
}

export const storySource = {
  type: "code" as const,
  language: "ts",
  transform: (code: string): string => {
    const body = ["parameters", "gkDocStory"].reduce(stripMember, code).trim();
    // A story whose source was not extracted must not silently show imports and a mount line
    // under nothing: better an obviously empty snippet than a plausible wrong one.
    return body ? [...importsFor(body), body, MOUNT_HINT].join("\n") : body;
  },
};
