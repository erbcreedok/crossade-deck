// THE STRIP'S COLOURS — every one of them out of `@crossade/look`, and a guard says so
// (`colors.test.ts`). A hex written here is a second palette, and a second palette is the one that
// never gets changed when the first one does.

import { PALETTE } from "@crossade/look";
import type { TopHudLook } from "./look.js";

/** A palette colour, seen through. The strip's glass is the felt's own black at four tenths. */
export function tint(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** How the strip is bedded onto the glass. */
export function fillCss(look: TopHudLook): string {
  switch (look.fill) {
    case "glass":
      // THE DESK GOES ON UNDER IT — blurred, not hidden. A strip that hid what was behind it would
      // take that band off the table on a phone, which is where the table has the least to give.
      return `background:${tint(PALETTE.black, 0.42)};backdrop-filter:blur(${look.blur}px);-webkit-backdrop-filter:blur(${look.blur}px);`;
    case "wood":
      return `background:linear-gradient(${PALETTE.panel},${PALETTE.well});`;
    case "dark":
      return `background:${PALETTE.well};`;
    case "felt":
      return `background:${PALETTE.felt};`;
    case "fade":
      return `background:linear-gradient(${tint(PALETTE.black, 0.9)},${tint(PALETTE.black, 0)});`;
    case "none":
      return "";
  }
}

/** The rule under the strip. */
export function lineCss(look: TopHudLook): string {
  if (look.line === "none") return "";
  return `border-bottom:3px solid ${look.line === "gold" ? PALETTE.gold : PALETTE.black};`;
}

/** The hard offset drop the whole product wears. */
export function shadowCss(look: TopHudLook, deep: boolean): string {
  if (!look.shadow) return "";
  return `box-shadow:0 ${deep ? 4 : 3}px 0 ${tint(PALETTE.black, deep ? 0.45 : 0.5)};`;
}

/** A pressable plate: the kit's own keyline, gold-brown ring and drop, in markup. */
export function plateCss(radius: number): string {
  return (
    `background:linear-gradient(${PALETTE.felt},${PALETTE.feltDark});` +
    `box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.panelLight},0 3px 0 ${tint(PALETTE.black, 0.55)};` +
    `border-radius:${radius}px;`
  );
}
