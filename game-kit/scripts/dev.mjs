// THE DEV SERVER, plus the one thing Storybook does not do for itself.
//
// Storybook watches the PREVIEW: a story, a docs page, a scene module — edit it and the change
// is on screen. It does NOT watch the MANAGER. `manager.tsx` and everything it imports are
// bundled once, when the server starts, and never again: an hour later the server still hands
// out the bundle it built at boot, byte for byte. Nothing in the browser can fix that — the
// responses already carry `Cache-Control: no-store`, so reloading, clearing the cache and
// restarting the browser all fetch the same stale file. Only restarting the server rebuilds it.
//
// That failure is silent and it lies: a panel keeps showing the behaviour of code that is no
// longer in the repository, and every experiment run against it is wasted. So this wrapper
// watches exactly the manager's own files and restarts the server when one of them changes.
//
// Only the manager's files, not `.storybook/**` — restarting on every story edit would trade a
// silent staleness for a server that is always five seconds from ready. The list is not typed
// out either: it is the import graph of `manager.tsx`, walked at startup, so a module that
// joins the manager later is watched without anyone remembering to add it here.
//
// ONE MORE CASE, and it is not staleness but an outright failure: a DELETED story file. The dev
// indexer keeps story files by path and reads them again on the next build, so a removed one
// answers `index.json` with a 500 and takes the whole catalog down — naming a file that is no
// longer in the repository, which reads as a bug in code somebody already deleted. Nothing in
// the browser fixes it; only a restart does. So deletions restart the server too.

import { spawn } from "node:child_process";
import { readdirSync, readFileSync, existsSync, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(HERE, "../.storybook/manager.tsx");
// `--no-open` because this wrapper restarts the server whenever a manager file changes, and
// Storybook opens a browser tab on every boot. Left in, one edit is one new tab.
const ARGS = ["storybook", "dev", "-p", "9567", "--no-open", ...process.argv.slice(2)];

/** The written specifier `./x.js` is `./x.ts` or `./x.tsx` on disk; JSON is itself. */
function resolveSpecifier(from, spec) {
  const base = join(dirname(from), spec);
  const candidates = [base, base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx"), `${base}.ts`, `${base}.tsx`];
  return candidates.find((p) => existsSync(p));
}

/**
 * Every local file the manager pulls in, however deep. Packages are somebody else's problem.
 *
 * Both import forms, and that matters: a module brought in only for its SIDE EFFECT is written
 * `import "./x.js"` with no `from`, and a scan looking for `from` walks straight past it. That
 * is precisely the kind of module — a registration — whose absence from the bundle is invisible.
 */
function importGraph(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const source = readFileSync(entry, "utf8");
  for (const [, spec] of source.matchAll(/(?:from\s+|import\s+)"(\.[^"]+)"/g)) {
    const target = resolveSpecifier(entry, spec);
    if (target) importGraph(target, seen);
  }
  return seen;
}

/** The `export const` names of one story file — what the index is built from. */
function exportsOf(path) {
  try {
    return [...readFileSync(path, "utf8").matchAll(/^export const (\w+)/gm)].map((m) => m[1]);
  } catch {
    return [];
  }
}

/** Seeded at startup so the FIRST edit is compared against something, not against nothing. */
const storyExports = new Map();
for (const name of readdirSync(resolve(HERE, "../.storybook/stories"))) {
  if (/\.stories\.[jt]sx?$/.test(name)) {
    const path = resolve(HERE, "../.storybook/stories", name);
    storyExports.set(path, exportsOf(path));
  }
}

let child = null;

function start() {
  child = spawn("npx", ARGS, { stdio: "inherit", cwd: resolve(HERE, "..") });
}

let restarting = false;

function restart(reason) {
  // An editor writes a file in more than one event, and a save can arrive as three. Without
  // this the server is killed while it is still coming up, and the port stays taken.
  if (restarting) return;
  restarting = true;
  console.log(`\n[dev] ${reason} — restarting\n`);
  const dying = child;
  child = null;
  dying?.once("exit", () => {
    restarting = false;
    start();
  });
  dying?.kill("SIGTERM");
}

// WATCH THE DIRECTORY, ASK THE GRAPH.
//
// One watcher per file is what this used to do, and it stopped working without a word. An
// editor does not write a file in place — it writes a new one and renames it over the old —
// and `fs.watch` is bound to the thing it was pointed at, not to the path. After the first save
// every watcher was holding an inode nobody would ever write to again: the server went on
// serving the bundle it built at boot, and the wrapper reported that it was watching.
//
// A new file had the same problem from the other end: it could not be watched, because it did
// not exist when the list was built — and a registration module added later is exactly the sort
// of file whose absence from the bundle shows up as nothing at all.
//
// So the watch is on the TREE, and membership is decided per event by re-walking the manager's
// imports. That keeps the original rule — only the manager's own files, never every story —
// while surviving both a rename and a new name.
const ROOT = resolve(HERE, "../.storybook");
let watched = importGraph(ENTRY);
watch(ROOT, { persistent: true, recursive: true }, (_event, name) => {
  if (!name) return;
  const file = resolve(ROOT, name);
  const rel = file.slice(resolve(HERE, "..").length + 1);

  // A DELETED STORY FILE POISONS THE INDEX, and the server never recovers on its own.
  //
  // Storybook's dev indexer holds story files by PATH. Delete or rename one and the next index
  // build reads a path that is gone: `index.json` answers 500 with `ENOENT`, the whole catalog
  // fails to open, and the message names a file the repository no longer contains — so it reads
  // as a bug in code that was already removed. Editing the remaining stories does not clear it.
  //
  // Existence is the test, not the event name: an editor saves by writing a new file and
  // renaming it over the old, which arrives here as a rename for a path that still exists.
  // Only a path that is actually gone is a deletion.
  if (/\.stories\.[jt]sx?$/.test(file)) {
    if (!existsSync(file)) return restart(`${rel} deleted — the index would 500 on it`);
    // A NEW EXPORT IS A NEW ENTRY, and the index does not notice. Editing a story's body is
    // handled — the preview reloads and the change is on screen. Adding or removing an
    // `export const` changes the INDEX, and that is built once: the story is in the bundle, the
    // sidebar has never heard of it, and opening its id lands on the Introduction page. It
    // looks exactly like a story that failed to register.
    //
    // Compared rather than restarted on every save, because a restart per keystroke is the
    // thing this wrapper was careful not to do.
    const names = exportsOf(file);
    const before = storyExports.get(file);
    storyExports.set(file, names);
    if (before && (before.length !== names.length || names.some((n, i) => n !== before[i]))) {
      return restart(`${rel} exports changed — the story index is built once`);
    }
    return;
  }

  // Re-walked because the edit may be the very import that adds a file to the graph.
  watched = importGraph(ENTRY);
  if (watched.has(file)) restart(`${rel} changed — the manager is only bundled at boot`);
});
console.log(`[dev] watching ${watched.size} manager files for changes Storybook cannot see`);

start();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child?.kill(signal);
    process.exit(0);
  });
}
