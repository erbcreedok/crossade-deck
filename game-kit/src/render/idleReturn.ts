import { type Camera } from "./camera/index.js";
import { homeTarget, type Presence } from "./presence.js";

export interface IdleReturnOpts {
  /** How long a view may sit untouched before it glides home. `Infinity` never glides on its own. */
  afterMs?: number;
  glideMs?: number;
  /**
   * WHAT ZOOM HOME IS AT — absent, `camera.fitZoom()`, the whole room shown. A desk whose home is
   * not a fit (the round table's `Camera.spanZoom`, owner: table diameter = 1.5× the glass) hands
   * its own reading in here, so the glide lands where `liveTable`'s own opening zoom already put it.
   */
  homeZoom?: () => number;
}

export interface IdleReturnTracker {
  input(): void;
  step(dtMs: number): void;
  /**
   * GO HOME NOW, without waiting out the countdown — the same glide, asked for instead of fallen
   * into. A tap on one's own place is that ask: the ring is the thing on the desk that means "my
   * seat", and "take me back to my seat" is the one thing it can say that a drag does not.
   *
   * The same call whether or not the countdown is armed: a desk with the idle return turned off
   * still has a place to go home to, and refusing the tap there would make the knob mean two things.
   */
  goHome(): void;
}

export function idleReturn(
  camera: Camera,
  presence: () => Presence | undefined,
  opts: IdleReturnOpts = {}
): IdleReturnTracker {
  const afterMs = opts.afterMs ?? 6000;
  const glideMs = opts.glideMs ?? 600;
  const homeZoom = opts.homeZoom ?? ((): number => camera.fitZoom());

  let idleMs = 0;
  let glideProgress = 0;
  let startX = 0, startY = 0, startZoom = 1, startRot = 0;
  let gliding = false;

  /**
   * ARM THE GLIDE from wherever the camera is standing right now. One writer for both ways in —
   * the countdown running out and a tap asking — so the two can never ease differently.
   */
  const start = (from: number): void => {
    gliding = true;
    glideProgress = from;
    startX = camera.target.x;
    startY = camera.target.y;
    startZoom = camera.zoom;
    startRot = camera.rotation;
  };

  return {
    input() {
      idleMs = 0;
      gliding = false;
    },
    goHome() {
      // NOTHING TO GO HOME TO IS NOT AN ERROR: a desk that seats nobody is still a desk, and a tap
      // on it is simply a tap (CANONS §1).
      const p = presence();
      if (!p || !p.place) return;
      idleMs = 0;
      start(0);
    },
    step(dtMs: number) {
      idleMs += dtMs;
      
      const p = presence();
      if (!p || !p.place) return;
      const { at, facing } = p.place;
      const targetZoom = homeZoom();
      // WHERE THE EYE HAS TO BE AIMED for the place to stand on the home anchor — the camera's own
      // word for its aim is the MIDDLE of the glass, and home is the low middle (`HOME_ANCHOR`).
      // Worked out at the zoom and turn the glide is HEADING FOR and not at the ones it is leaving,
      // or the destination would move under the glide every frame and never be arrived at.
      const perUnit = camera.zoom === 0 ? camera.pixelsPerUnit : (camera.pixelsPerUnit / camera.zoom) * targetZoom;
      const home = homeTarget({ at }, { zoom: perUnit, rotation: facing, glass: camera.glass });

      if (!gliding && idleMs > afterMs) {
        const dx = camera.target.x - home.x;
        const dy = camera.target.y - home.y;
        const dz = camera.zoom - targetZoom;
        let dr = (camera.rotation - facing) % 360;
        if (dr > 180) dr -= 360;
        if (dr < -180) dr += 360;

        const dist = Math.hypot(dx, dy);
        if (dist > 0.1 || Math.abs(dz) > 0.05 || Math.abs(dr) > 1) start(idleMs - afterMs);
      } else if (gliding) {
        glideProgress += dtMs;
      }

      if (gliding) {
        const p = Math.min(1, glideProgress / glideMs);
        const t = 1 - Math.pow(1 - p, 3); // easeOutCubic

        camera.lookAt({
          x: startX + (home.x - startX) * t,
          y: startY + (home.y - startY) * t
        });
        camera.setZoom(startZoom + (targetZoom - startZoom) * t);
        
        let dRot = (facing - startRot) % 360;
        if (dRot > 180) dRot -= 360;
        if (dRot < -180) dRot += 360;
        camera.turnTo(startRot + dRot * t);

        if (p >= 1) {
          gliding = false;
        }
      }
    }
  };
}
