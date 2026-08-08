// BINDING a host to a painter — the one line that turns a tree into pixels.
//
// Kept apart from both: the host owns the view and the viewport and knows nothing of drawing;
// the painter draws and knows nothing of resizing or of where a unit comes from. This is the
// seam where a consumer could put a different renderer entirely, which is the point of having
// a seam at all.

import { type Host } from "./host.js";
import { type Painter } from "./painter.js";
import { boundsMarks, scenePlan } from "./scenePlan.js";

/**
 * Paint now, and again whenever the host says something changed — a resize, a viewer switch,
 * a new hud etalon. Returns the unsubscribe, which the caller owes the host on teardown.
 *
 * The plan is rebuilt from scratch each time rather than patched. At this size that is not a
 * cost worth optimising, and a diff between two plans is precisely the kind of bookkeeping
 * that goes wrong quietly.
 */
export function attachPainter(host: Host, painter: Painter): () => void {
  const redraw = (): void => {
    const view = host.viewport();
    painter.resize(view.width, view.height);
    const input = {
      root: host.root,
      unit: host.unit(),
      width: view.width,
      height: view.height,
      viewer: host.viewer(),
    };
    painter.draw(scenePlan(input), boundsMarks(input), host.viewer().theme);
  };

  redraw();
  return host.onChange(redraw);
}
