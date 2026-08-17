// LIT — the canvas's one light. There is no per-piece lamp: `light` is a ROOT-ONLY field, and the
// direction every shadow falls is ONE formula in ONE place (`docs/design/camera.md`). The `frame`
// says whose corner the lamp hangs in: `viewer` (the default) keeps the fall constant on the
// SCREEN — height reads the same from every seat, at the price of the lamp orbiting the desk;
// `world` nails the lamp over the DESK, so the fall turns with the camera. The two differ only
// while a camera is turned, which is exactly why the frame is data and not a mode.
//
// `shadow` is the lamp's other half — how FAR a shadow falls and how dark it is. Root-only for the
// same reason as the light: one desk, one lamp, one depth scale. The law it feeds is untouched
// (`z` is the source, the fall is a consequence — camera.md); this only makes its coefficients the
// desk's data instead of the engine's constants, so a designer sets the depth and a catalog shows it.

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

/** How a shadow falls: distances in UNITS of the caster's desk, darkness as an opacity. */
export interface Shadow {
  /** The fall of a caster resting on the desk (`z` 0), units. */
  readonly base: number;
  /** How much further it falls per unit of `z`, units. */
  readonly perZ: number;
  /** The extra fall of a caster in FLIGHT — carried, settling, turning — units. */
  readonly lifted: number;
  /** Darkness of the shadow layer, 0..1. */
  readonly opacity: number;
}

export interface LitFields {
  readonly light: Light;
  readonly shadow: Shadow;
}

/** The stock lamp: top-right of the FRAME, so shadows fall down-left — legible as height anywhere. */
export const DEFAULT_LIGHT: Light = { frame: "viewer", angle: 315 };
/** The stock depth: a hair at rest, a clear step per `z`, a lift in flight, a soft dark. */
export const DEFAULT_SHADOW: Shadow = { base: 0.05, perZ: 0.045, lifted: 0.12, opacity: 0.28 };

export const Lit = defineAtom<LitFields>({
  name: "Lit",
  requires: [],
  defaults: { light: DEFAULT_LIGHT, shadow: DEFAULT_SHADOW },
  classes: { light: "rootOnly", shadow: "rootOnly" },
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

/** The desk's shadow depth — the ROOT's, through any node; the stock depth on a desk that said nothing. */
export function shadowOf(n: Node): Shadow {
  return fieldsOf<LitFields>(rootOf(n), "Lit")?.shadow ?? DEFAULT_SHADOW;
}
