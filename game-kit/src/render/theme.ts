// THEME — the visual foundation, and the only place in the kit that holds a raw colour.
// Written FIRST and before elements (CANONS.md §4), because the alternative is what killed
// client2: 261 raw hex values against ~20 theme reads, two golds under four names, and three
// near-identical greys.
//
// Rules from the canon, in order:
//  - semantic tokens: the name says the JOB, not the shade;
//  - ONE gold. There is a single `accent`, and washes of it are DERIVED, never a second hex;
//  - scales for radius, stroke, spacing and type — not colours alone;
//  - no raw hex outside this file (guarded by a scan).
//
// Dark or light is a VIEWER setting: local, never in state, and it lives in the toolbar —
// the same plane as motion-reduce (CANONS.md, the three-planes rule).

// Declared in the model (see `core/viewer.ts`); re-exported so a consumer of the theme
// does not have to know where the word lives.
export { type ThemeName } from "../core/viewer.js";
import { type ThemeName } from "../core/viewer.js";

/** One job per token. Two tokens that would always hold the same value are one too many. */
export interface Palette {
  /** Behind everything: the table surface. */
  stageBg: string;
  /** Panels and cards sitting on the stage. */
  panelBg: string;
  /** Wells: code blocks, inset rows. */
  sunkBg: string;
  /** Ordinary separator. */
  panelBorder: string;
  /** Primary text. */
  text: string;
  /** Secondary text: labels, keys. */
  textMuted: string;
  /** Tertiary text: provenance, hints. */
  textFaint: string;
  /** THE accent. There is no second one — washes are derived from this. */
  accent: string;
  /** Something is wrong or missing: the inspector's "absent". */
  alert: string;
  /** The dotted stage grid. */
  grid: string;
  /**
   * Tooling drawn OVER the picture: the debug outline of a box. Its own token because its job
   * is its own — it must never be mistaken for something an author put on the table, which is
   * exactly what would happen if it borrowed the accent or a border colour.
   */
  debug: string;
}

const DARK: Palette = {
  stageBg: "#16181a",
  panelBg: "#1d2023",
  sunkBg: "#111315",
  panelBorder: "#2c3135",
  text: "#d5dade",
  textMuted: "#909aa2",
  textFaint: "#6b757d",
  accent: "#4ea3ff",
  alert: "#ff6a52",
  grid: "#262b2f",
  debug: "#ff4fd8",
};

const LIGHT: Palette = {
  stageBg: "#f4f6f8",
  panelBg: "#ffffff",
  sunkBg: "#eef1f4",
  panelBorder: "#dfe4e9",
  text: "#1f2529",
  textMuted: "#5d6870",
  textFaint: "#8b959d",
  accent: "#0a74d6",
  alert: "#c0392b",
  grid: "#dbe1e6",
  debug: "#c2189c",
};

export const PALETTES: Record<ThemeName, Palette> = { dark: DARK, light: LIGHT };

/**
 * Scales, so a spacing or a radius is chosen from a ladder rather than typed by feel.
 * Flat on purpose: a nested map buys nothing here and costs a recursive key type.
 */
export const SCALE = {
  "radius.s": "4px",
  "radius.m": "8px",
  "radius.l": "14px",
  "radius.round": "999px",
  "stroke.hair": "1px",
  "stroke.thin": "2px",
  "space.xs": "4px",
  "space.s": "8px",
  "space.m": "12px",
  "space.l": "16px",
  "space.xl": "24px",
  "font.mono": "ui-monospace,SFMono-Regular,Menlo,monospace",
  "font.sans": "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  "font.size.xs": "10px",
  "font.size.s": "11px",
  "font.size.m": "12px",
  "font.size.l": "14px",
  "font.line.tight": "1.35",
  "font.line.normal": "1.55",
} as const;

export type ScaleStep = keyof typeof SCALE;

/** The one place the `--gk-` prefix is spelled. */
function varName(path: string): string {
  return `--gk-${path.replace(/\./g, "-").replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Read a colour token: `color: ${t("textMuted")}`. Call sites never see a hex. */
export function t(token: keyof Palette): string {
  return `var(${varName(token)})`;
}

/** Read a scale step: `padding: ${s("space.m")}`. */
export function s(path: ScaleStep): string {
  return `var(${varName(path)})`;
}

/**
 * The value BEHIND a token, for a renderer that cannot read a CSS variable — a GPU canvas has
 * no cascade to look the `var()` up in. A name that is not a token passes through unchanged,
 * so a surface record may still carry a literal colour when a game genuinely wants one.
 *
 * This is the only exception to "call sites never see a hex", and it is narrow on purpose:
 * the hexes still live only in the palette, and this hands one over rather than declaring it.
 */
export function paint(name: ThemeName, value: string): string {
  const palette = PALETTES[name];
  return value in palette ? palette[value as keyof Palette] : value;
}

/**
 * A wash of THE accent, derived rather than declared — this is how "one gold" survives the
 * first time someone needs a tinted background.
 */
export function accentWash(percent = 16): string {
  return `color-mix(in srgb, ${t("accent")} ${percent}%, ${t("panelBg")})`;
}

function declarations(palette: Palette): string {
  const colours = (Object.keys(palette) as Array<keyof Palette>).map((k) => `${varName(k)}:${palette[k]}`);
  const scales = (Object.keys(SCALE) as ScaleStep[]).map((k) => `${varName(k)}:${SCALE[k]}`);
  return [...colours, ...scales].join(";");
}

export function themeCss(): string {
  return [
    `:root{${declarations(DARK)}}`,
    `[data-gk-theme="light"]{${declarations(LIGHT)}}`,
    `[data-gk-theme="dark"]{${declarations(DARK)}}`,
  ].join("\n");
}

const STYLE_ID = "gk-theme";

/** Install once per document; calling again replaces, so hot reload cannot stack copies. */
export function installTheme(doc: Document, name?: ThemeName): void {
  let el = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement("style");
    el.id = STYLE_ID;
    doc.head.appendChild(el);
  }
  el.textContent = themeCss();
  if (name) doc.documentElement.setAttribute("data-gk-theme", name);
}
