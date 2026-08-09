// WHERE A PICTURE LANDS IN AN AREA — the arithmetic of `fit` and `align`, and nothing else.
//
// This is the one place a picture's proportions meet an area's, and it is pure, so the rule is
// checkable without a GPU. It was worth extracting for a second reason: `fit` and `align` spent
// months declared on the atom and read by nobody, and a field with no arithmetic behind it is
// exactly what that looks like.

/** How the picture meets the area it is given. */
export type Fit = "contain" | "cover" | "fill" | "original" | "repeat" | "fitX" | "fitY";

export type Align =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";

export const DEFAULT_FIT: Fit = "contain";
export const DEFAULT_ALIGN: Align = "center";

export interface Box {
  readonly w: number;
  readonly h: number;
}

/** The picture's box, relative to the CENTRE of the area — same origin as everything else. */
export interface Placed {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** `repeat` tiles instead of placing once, and then the box is one tile. */
  readonly repeat: boolean;
}

/**
 * Where a picture of size `image` sits inside an area of size `area`.
 *
 * `contain` is the default, and deliberately not `cover`. `cover` always looks tidy and quietly
 * eats the edges, so a picture with the wrong proportions ships and nobody notices; `contain`
 * shows the mismatch as bars, which is a fault a reader can see and fix. A wrong result should
 * look wrong.
 */
export function fitBox(area: Box, image: Box, fit: Fit = DEFAULT_FIT, align: Align = DEFAULT_ALIGN): Placed {
  const sized = sizeFor(area, image, fit);
  const at = alignIn(area, sized, align);
  return { ...sized, ...at, repeat: fit === "repeat" };
}

function sizeFor(area: Box, image: Box, fit: Fit): Box {
  if (image.w <= 0 || image.h <= 0) return { w: 0, h: 0 };
  const scaleX = area.w / image.w;
  const scaleY = area.h / image.h;
  switch (fit) {
    case "fill":
      return { w: area.w, h: area.h };
    // `original` and `repeat` both draw the picture at the size it declared: one of them once,
    // the other over and over. That they share a size is the whole difference between them.
    case "original":
    case "repeat":
      return { w: image.w, h: image.h };
    case "fitX":
      return { w: area.w, h: image.h * scaleX };
    case "fitY":
      return { w: image.w * scaleY, h: area.h };
    case "cover":
      return scaled(image, Math.max(scaleX, scaleY));
    default:
      return scaled(image, Math.min(scaleX, scaleY));
  }
}

function scaled(image: Box, by: number): Box {
  return { w: image.w * by, h: image.h * by };
}

/** The offset that puts `box` where `align` says inside `area`, both centred on the origin. */
function alignIn(area: Box, box: Box, align: Align): { x: number; y: number } {
  const slackX = (area.w - box.w) / 2;
  const slackY = (area.h - box.h) / 2;
  const left = align === "left" || align === "topLeft" || align === "bottomLeft";
  const right = align === "right" || align === "topRight" || align === "bottomRight";
  const top = align === "top" || align === "topLeft" || align === "topRight";
  const bottom = align === "bottom" || align === "bottomLeft" || align === "bottomRight";
  // `zero()` because negative zero is real and travels: `-0` in a plan compares equal to `0`
  // and prints as `-0`, so a test reads as failing and a reader reads it as a direction.
  return {
    x: zero(left ? -slackX : right ? slackX : 0),
    y: zero(top ? -slackY : bottom ? slackY : 0),
  };
}

function zero(v: number): number {
  return v === 0 ? 0 : v;
}
