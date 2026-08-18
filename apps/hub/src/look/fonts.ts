// GETTING THE FACES INTO THE PAGE BEFORE ANYTHING MEASURES THEM.
//
// Two failures this exists to prevent, both of them silent, both of them paid for already in an
// earlier client:
//
//   - MEASURING TOO EARLY. A caption laid out before its face arrives is laid out against the
//     fallback's widths and then settles there, because nothing re-measures on its own. So the hub
//     waits on the ruler's `ready` before it draws its first frame.
//   - ASKING WITHOUT SAYING WHICH LETTERS. A font service ships subsets by codepoint range, and a
//     bare request fetches Latin alone. Everything else then renders in the fallback and looks
//     merely a bit off — the worst kind of wrong, because nobody files it.
//
// Hence a SAMPLE, and hence a sample with Kazakh in it. The kit is handed the string and never
// reads it: what is written there is the consumer's business, and it must stay that way.

import { domTextMeasure, type FontWait, type TextMeasure } from "game-kit";

/**
 * Latin, Cyrillic, and the nine Kazakh letters that are the actual test — Әә Ғғ Ққ Ңң Өө Ұұ Үү Һһ
 * Іі. They live outside the ranges a Latin subset covers, so naming them here is the whole point.
 */
const SAMPLE = "AZaz0123 абвгдеёжзийклмнопрстуфхцчшщъыьэюя ӘәҒғҚқҢңӨөҰұҮүҺһІі";

/** Any size fetches the same subsets; the number only has to be a legal font size. */
const AT = 16;

const WAITS: readonly FontWait[] = [
  { font: { family: "Tiny5", size: AT, weight: 400 }, sample: SAMPLE },
  { font: { family: "'Press Start 2P'", size: AT, weight: 400 }, sample: SAMPLE },
  { font: { family: "Handjet", size: AT, weight: 400 }, sample: SAMPLE },
];

/** One ruler for the page — its answers are cached, so a shelf of tiles measures each caption once. */
export function hubRuler(): TextMeasure {
  return domTextMeasure({ waitFor: WAITS });
}
