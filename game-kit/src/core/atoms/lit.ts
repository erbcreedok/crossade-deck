// LIT — the canvas's one light. There is no per-piece lamp: `light` is a ROOT-ONLY field, and the
// direction every shadow falls is ONE formula in ONE place (`docs/design/camera.md`). The `frame`
// says whose corner the lamp hangs in: `viewer` (the default) keeps the fall constant on the
// SCREEN — height reads the same from every seat, at the price of the lamp orbiting the desk;
// `world` nails the lamp over the DESK, so the fall turns with the camera. The two differ only
// while a camera is turned, which is exactly why the frame is data and not a mode.

import { defineAtom } from "../atom.js";
import { fieldsOf, rootOf, type Node } from "../node.js";
import { type Vec } from "../transform.js";

/** The one dictionary for "of the desk" vs "of the onlooker" — the camera work shares it. */
export type Frame = "world" | "viewer";

export interface Light {
  /** Whose corner the lamp hangs in — see the header. */
  readonly frame: Frame;
  /** Where the light comes FROM, degrees clockwise from +x in the frame's own axes. */
  readonly angle: number;
}

export interface LitFields {
  readonly light: Light;
}

/** The stock lamp: top-right of the FRAME, so shadows fall down-left — legible as height anywhere. */
export const DEFAULT_LIGHT: Light = { frame: "viewer", angle: 315 };

export const Lit = defineAtom<LitFields>({
  name: "Lit",
  requires: [],
  defaults: { light: DEFAULT_LIGHT },
  classes: { light: "rootOnly" },
});

/**
 * The direction a shadow FALLS, as a unit vector — the opposite of where the light stands. Asked
 * through any node, answered by the ROOT's lamp; a desk that never declared one is lit by the
 * stock lamp rather than left with casters and no shadows. `viewer` ignores the camera; `world`
 * turns the fall by −rotation, so the lamp stays over the desk while the screen turns.
 */
export function lightVector(n: Node, cameraRotation = 0): Vec {
  const light = fieldsOf<LitFields>(rootOf(n), "Lit")?.light ?? DEFAULT_LIGHT;
  const turn = light.frame === "world" ? -cameraRotation : 0;
  const a = ((light.angle + turn) * Math.PI) / 180;
  return { x: -Math.cos(a), y: -Math.sin(a) };
}
