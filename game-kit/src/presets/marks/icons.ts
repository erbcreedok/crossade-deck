// STOCK MARK ICONS — monochrome 24×24 SVG glyphs for action marks.
//
// Registered as `mark.<name>` assets with size 0.36 units (approx 1/3 of a figure).

import { registerAsset } from "../../render/assets.js";
import { svg } from "../../render/svg.js";

const MARK_SIZE = 0.36;

const LIFTED_SVG = svg(
  24,
  24,
  '<path d="M12 2a1.5 1.5 0 0 1 1.5 1.5V11h.5a1.5 1.5 0 0 1 1.5 1.5V6.5a1.5 1.5 0 0 1 3 0V15c0 4.4-3.6 8-8 8s-8-3.6-8-8v-4.5a1.5 1.5 0 0 1 3 0V11h.5V4.5A1.5 1.5 0 0 1 7 3a1.5 1.5 0 0 1 1.5 1.5V11H9V3.5A1.5 1.5 0 0 1 10.5 2 1.5 1.5 0 0 1 12 2z" fill="white"/>',
);

const MOVED_SVG = svg(
  24,
  24,
  '<path d="M3.5 2.1a1.5 1.5 0 0 1 2.1 0L14 10.4V6.5a1.5 1.5 0 0 1 3 0v7a1.5 1.5 0 0 1-1.5 1.5h-7a1.5 1.5 0 0 1 0-3h3.9L4.1 3.5a1.5 1.5 0 0 1 0-2.1z" fill="white"/><circle cx="19" cy="19" r="3" fill="white"/>',
);

const CAPTURED_SVG = svg(
  24,
  24,
  '<path d="M19.5 2.5a1 1 0 0 0-1.4 0l-5.6 5.6-2.8-2.8a1 1 0 0 0-1.4 1.4l1.4 1.4-6.3 6.3a1.5 1.5 0 0 0 0 2.1l.7.7-2.3 2.3a1 1 0 1 0 1.4 1.4l2.3-2.3.7.7a1.5 1.5 0 0 0 2.1 0l6.3-6.3 1.4 1.4a1 1 0 0 0 1.4-1.4l-2.8-2.8 5.6-5.6a1 1 0 0 0 0-1.4z" fill="white"/><path d="M4.5 2.5a1 1 0 0 0 0 1.4l5.6 5.6-2.8 2.8a1 1 0 0 0 1.4 1.4l1.4-1.4 6.3 6.3a1.5 1.5 0 0 0 2.1 0l.7-.7 2.3 2.3a1 1 0 1 0 1.4-1.4l-2.3-2.3.7-.7a1.5 1.5 0 0 0 0-2.1l-6.3-6.3 1.4-1.4a1 1 0 0 0-1.4-1.4l-2.8 2.8-5.6-5.6a1 1 0 0 0-1.4 0z" fill="white"/>',
);

const REMOVED_SVG = svg(
  24,
  24,
  '<path d="M3 3h12v3h-3a1.5 1.5 0 0 0 0 3h3v12H3V3zm3 3v12h9v-3h-3a1.5 1.5 0 0 0 0-3h3V6H6z" fill="white"/><path d="M13.5 10.5a1.5 1.5 0 0 1 2.1 0L19 13.9V11.5a1.5 1.5 0 0 1 3 0v6a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1 0-3h2.4l-3.4-3.4a1.5 1.5 0 0 1 0-2.1z" fill="white"/>',
);

const FLIPPED_SVG = svg(
  24,
  24,
  '<path d="M7 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6zm2 0v12h8V6H9z" fill="white"/><path d="M12 2a9 9 0 0 0-8.5 6H1a1 1 0 0 0-.8 1.6l3 4a1 1 0 0 0 1.6 0l3-4A1 1 0 0 0 7 8H5.2A7 7 0 0 1 12 4a1 1 0 1 0 0-2z" fill="white"/>',
);

const SHUFFLED_SVG = svg(
  24,
  24,
  '<path d="M5 8l-2 9a1 1 0 0 0 .7 1.2l5.7 1.3a1 1 0 0 0 1.2-.7l2-9A1 1 0 0 0 12 8.6L6.2 7.3A1 1 0 0 0 5 8z" fill="white"/><path d="M10 5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V5z" fill="white"/><path d="M15 8l2 9a1 1 0 0 0 1.2.7l5.7-1.3a1 1 0 0 0 .7-1.2l-2-9a1 1 0 0 0-1.2-.7l-5.7 1.3A1 1 0 0 0 15 8z" fill="white"/><path d="M4 1a1 1 0 0 0-.7 1.7l2 2A1 1 0 0 0 7 4h10a1 1 0 1 0 0-2H6.4L4.7.3A1 1 0 0 0 4 1z" fill="white"/>',
);

const THROWN_SVG = svg(
  24,
  24,
  '<path d="M14 10a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 22 10v7a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 14 17v-7zm1.5 0v7h5v-7h-5z" fill="white"/><path d="M2 18C2 10.3 8.3 4 16 4a1 1 0 1 1 0 2C9.4 6 4 11.4 4 18a1 1 0 1 1-2 0z" fill="white"/><path d="M13 1a1 1 0 0 1 1.7.7l1 5a1 1 0 0 1-1.5 1.1l-4.5-3a1 1 0 0 1 .5-1.8l3.3.3L13 1z" fill="white"/>',
);

export function installStockMarkIcons(): void {
  registerAsset("mark.lifted", { src: LIFTED_SVG, w: MARK_SIZE, h: MARK_SIZE });
  registerAsset("mark.moved", { src: MOVED_SVG, w: MARK_SIZE, h: MARK_SIZE });
  registerAsset("mark.captured", { src: CAPTURED_SVG, w: MARK_SIZE, h: MARK_SIZE });
  registerAsset("mark.removed", { src: REMOVED_SVG, w: MARK_SIZE, h: MARK_SIZE });
  registerAsset("mark.flipped", { src: FLIPPED_SVG, w: MARK_SIZE, h: MARK_SIZE });
  registerAsset("mark.shuffled", { src: SHUFFLED_SVG, w: MARK_SIZE, h: MARK_SIZE });
  registerAsset("mark.thrown", { src: THROWN_SVG, w: MARK_SIZE, h: MARK_SIZE });
}
