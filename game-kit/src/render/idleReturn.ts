import { type Camera } from "./camera/index.js";
import { type Presence, type PresencePin } from "./presence.js";

export interface IdleReturnOpts {
  afterMs?: number;
  glideMs?: number;
  setPin?: (pin: PresencePin) => void;
}

export interface IdleReturnTracker {
  input(): void;
  step(dtMs: number): void;
}

export function idleReturn(
  camera: Camera,
  presence: () => Presence | undefined,
  opts: IdleReturnOpts = {}
): IdleReturnTracker {
  const afterMs = opts.afterMs ?? 6000;
  const glideMs = opts.glideMs ?? 600;

  let idleMs = 0;
  let glideProgress = 0;
  let startX = 0, startY = 0, startZoom = 1, startRot = 0;
  let gliding = false;

  return {
    input() {
      idleMs = 0;
      gliding = false;
    },
    step(dtMs: number) {
      idleMs += dtMs;
      
      const p = presence();
      if (!p || !p.place) return;
      const { at, facing } = p.place;
      const targetZoom = camera.fitZoom();

      if (!gliding && idleMs > afterMs) {
        const dx = camera.target.x - at.x;
        const dy = camera.target.y - at.y;
        const dz = camera.zoom - targetZoom;
        let dr = (camera.rotation - facing) % 360;
        if (dr > 180) dr -= 360;
        if (dr < -180) dr += 360;

        const dist = Math.hypot(dx, dy);
        if (dist > 0.1 || Math.abs(dz) > 0.05 || Math.abs(dr) > 1) {
          gliding = true;
          glideProgress = idleMs - afterMs;
          startX = camera.target.x;
          startY = camera.target.y;
          startZoom = camera.zoom;
          startRot = camera.rotation;
        }
      } else if (gliding) {
        glideProgress += dtMs;
      }

      if (gliding) {
        const p = Math.min(1, glideProgress / glideMs);
        const t = 1 - Math.pow(1 - p, 3); // easeOutCubic

        camera.lookAt({
          x: startX + (at.x - startX) * t,
          y: startY + (at.y - startY) * t
        });
        camera.setZoom(startZoom + (targetZoom - startZoom) * t);
        
        let dRot = (facing - startRot) % 360;
        if (dRot > 180) dRot -= 360;
        if (dRot < -180) dRot += 360;
        camera.turnTo(startRot + dRot * t);

        if (p >= 1) {
          gliding = false;
          if (opts.setPin) opts.setPin({ mode: "desk", at, leash: "chase" });
        }
      }
    }
  };
}
