// THE CATALOG'S OWN WORDS — all of them, and none of them known to the kit.
//
// Every string a reader sees is here, in `en.json` / `ru.json`, and it never crosses into the
// kit as a key: the kit has no notion of a language, a dictionary or a placeholder. Captions
// are resolved HERE and handed over already written — which is what a game does too, each one
// with its own library, its own formats and its own set of languages.
//
// JSON rather than a TypeScript module, one file per language: a translator is handed a file,
// not a source tree, and a bundle can be swapped or loaded lazily without rebuilding code.
// A value may be a string or an array of lines — the array is only for readability, and it is
// joined with newlines on load, which is what makes markdown pages bearable to edit.
//
// Plurals are the catalog's answer, NOT the kit's: `Intl.PluralRules` picks the category and
// the key carries it (`inspector.nodes.many`). Russian needs one/few/many and English needs
// one/other; a two-form helper in the kit would have made "2 узлов" everywhere, which is
// precisely what it used to do.

import en from "./en.json";
import ru from "./ru.json";

export const LOCALES = ["en", "ru"] as const;
export type CatalogLocale = (typeof LOCALES)[number];

/** Keys are English by definition — `en.json` is the reference bundle. */
export type CatalogKey = keyof typeof en;

/** A base whose forms live under it: `inspector.nodes` + `.one` / `.few` / `.other`. */
export type PluralBase = "inspector.nodes" | "inspector.children";

type Bundle = Readonly<Record<string, string | readonly string[]>>;

const BUNDLES: Record<CatalogLocale, Bundle> = { en, ru };

/** Lines in, one markdown block out. Editing prose beats saving a join at runtime. */
function flatten(bundle: Bundle): Record<string, string> {
  return Object.fromEntries(
    Object.entries(bundle).map(([key, value]) => [key, Array.isArray(value) ? value.join("\n") : (value as string)]),
  );
}

const REFERENCE = flatten(en);

export type TextParams = Record<string, string | number>;

export interface CatalogText {
  /** A BCP-47 tag, for `Intl`. Nothing outside this directory reads it. */
  readonly locale: CatalogLocale;
  text(key: CatalogKey, params?: TextParams): string;
  /** The right form for `n`, in this language's own categories. */
  plural(base: PluralBase, n: number): string;
}

const cache = new Map<CatalogLocale, CatalogText>();

export function catalogText(locale: CatalogLocale): CatalogText {
  const ready = cache.get(locale);
  if (ready) return ready;

  const source = dictionarySource(locale, flatten(BUNDLES[locale]), REFERENCE);

  const rules = new Intl.PluralRules(locale);
  const built: CatalogText = {
    locale,
    text: (key, params) => source.text(key, params),
    plural(base, n) {
      const category = rules.select(n);
      // `other` is the one form every language has, so it is the floor under a missing form
      // rather than a raw key on screen.
      const key = `${base}.${category}`;
      const resolved = source.text(key, { n });
      return resolved === key ? source.text(`${base}.other`, { n }) : resolved;
    },
  };
  cache.set(locale, built);
  return built;
}

/** Every locale carries every key of the reference bundle — checked by a test, not by hope. */
export function missingKeys(locale: CatalogLocale): string[] {
  const have = new Set(Object.keys(BUNDLES[locale]));
  return Object.keys(en).filter((key) => !have.has(key) && !isPluralForm(key));
}

/**
 * Plural forms are counted differently: English has two and Russian four, so "the same keys
 * in both files" would be the wrong rule. What must hold is that every count RESOLVES.
 */
export function unresolvedPlurals(locale: CatalogLocale): string[] {
  const text = catalogText(locale);
  const bases: PluralBase[] = ["inspector.nodes", "inspector.children"];
  const out: string[] = [];
  for (const base of bases) {
    for (const n of [0, 1, 2, 5, 11, 21, 100]) {
      const line = text.plural(base, n);
      if (line.startsWith(base)) out.push(`${base} @ ${n}`);
    }
  }
  return out;
}

function isPluralForm(key: string): boolean {
  return /\.(zero|one|two|few|many|other)$/.test(key);
}

/**
 * A flat dictionary plus `{name}` substitution — the catalog's own resolver, deliberately
 * unremarkable. It used to live in the kit as a "reference adapter"; it was still a decision
 * about what a placeholder looks like, made in the wrong place.
 */
function dictionarySource(
  locale: CatalogLocale,
  dict: Readonly<Record<string, string>>,
  fallback: Readonly<Record<string, string>>,
): { locale: CatalogLocale; text(key: string, params?: TextParams): string } {
  return {
    locale,
    text(key, params = {}) {
      // A gap falls back to the reference bundle and only then to the key: a missing
      // translation is a smaller failure than a blank, and the key still names what is missing.
      const template = dict[key] ?? fallback[key] ?? key;
      return template.replace(/\{(\w+)\}/g, (whole, name: string) => String(params[name] ?? whole));
    },
  };
}
