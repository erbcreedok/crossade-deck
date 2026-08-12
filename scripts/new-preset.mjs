// GENERATOR — birth a game-presets/* workspace: the boring, PROVEN skeleton and nothing else.
//
// What it stamps is the part that is identical across every add-on (cards, chess, chips…): the
// package manifest with the `development` door onto the engine, the tsconfig/vitest that consume
// that door, an empty public index, and the ONE law every preset is born with — `resolves-the-engine`.
// What it does NOT stamp is a single line of game content: suits, sets, skins are authored by hand
// into the generated skeleton. A generator that guessed the content would bake in a guess; this one
// only reproduces what game-kit itself already proves works.
//
// Usage:  node scripts/new-preset.mjs <name>     (name = kebab-case, e.g. cards, chess, chips)
// It refuses to touch an existing package — regenerating is a delete-then-run, never a silent clobber.

import { mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error("usage: node scripts/new-preset.mjs <name>   (kebab-case: cards, chess, chips)");
  process.exit(1);
}

const pkgDir = join(ROOT, "game-presets", name);
const exists = await access(pkgDir).then(() => true).catch(() => false);
if (exists) {
  console.error(`game-presets/${name} already exists — regenerating is delete-then-run, not clobber.`);
  process.exit(1);
}

// The skeleton. Every `__NAME__` becomes the package name; nothing else varies between add-ons.
const files = {
  "package.json": `{
  "name": "@game-presets/__NAME__",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "A game-kit preset add-on: __NAME__.",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "exports": {
    ".": {
      "development": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "types": "./dist/index.d.ts",
  "module": "./dist/index.js",
  "files": ["dist", "src"],
  "dependencies": {
    "game-kit": "*"
  },
  "devDependencies": {
    "@types/node": "^26.1.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
`,
  // tsc consumes the SAME development door as the runtime: `customConditions` makes TypeScript pick
  // `./src/index.ts` out of game-kit's exports, so a preset typechecks against the engine's SOURCE —
  // no build of game-kit, no stale dist. Mirrors game-kit's own strict flags.
  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "customConditions": ["development"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
`,
  // The runtime twin of the tsconfig door: Vitest resolves game-kit through the `development`
  // condition, so a test imports the engine by NAME and gets its src — the very door a standalone game uses.
  "vitest.config.ts": `import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["development", "import", "node", "default"] },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
`,
  "src/index.ts": `// THE PUBLIC API of @game-presets/__NAME__ — the one door a consumer comes through.
// Populated per stage; a standalone imports from "@game-presets/__NAME__", never a path into src.
export {};
`,
  // The law every preset is BORN with, proven fail-first: if the development door is misconfigured,
  // importing game-kit by name fails and the package is red before it has any content of its own.
  "src/guard.resolves-the-engine.test.ts": `import { describe, expect, it } from "vitest";
import { node, Surfaced } from "game-kit";

describe("@game-presets/__NAME__ resolves the engine", () => {
  it("__NAME__.resolves-the-engine — imports game-kit by name and builds a surfaced node", () => {
    const probe = node("probe", Surfaced({ surface: "probe" }));
    expect(probe.id).toBe("probe");
    expect(probe.atoms.has("Surfaced")).toBe(true);
  });
});
`,
};

await mkdir(join(pkgDir, "src"), { recursive: true });
for (const [rel, body] of Object.entries(files)) {
  await writeFile(join(pkgDir, rel), body.replaceAll("__NAME__", name));
}

console.log(`game-presets/${name} — skeleton stamped. Next:`);
console.log(`  npm install`);
console.log(`  cd game-presets/${name} && npx tsc --noEmit && npm test`);
