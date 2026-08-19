// GETTING THE FACE INTO THE PAGE BEFORE ANYTHING MEASURES IT.
//
// Two silent failures this exists to prevent:
//
//   - MEASURING TOO EARLY. A caption laid out before its face arrives is laid out against the
//     fallback's widths and settles there, because nothing re-measures on its own.
//   - ASKING WITHOUT SAYING WHICH LETTERS. A font service ships subsets by codepoint range, and a
//     bare request fetches Latin alone — every Russian caption then renders in the fallback and
//     looks merely a bit off, which is the worst kind of wrong because nobody files it.
//
// Hence a SAMPLE, and hence a sample in Cyrillic: that is what the three controls actually say. The
// kit is handed the string and never reads it — what is written there is this game's business.

import { domTextMeasure, type FontWait, type TextMeasure } from "game-kit";

const SAMPLE = "АЯаяЁё0123 абвгдеёжзийклмнопрстуфхцчшщъыьэюя";

/** Any size fetches the same subsets; the number only has to be a legal font size. */
const AT = 16;

const WAITS: readonly FontWait[] = [{ font: { family: "'Press Start 2P'", size: AT, weight: 400 }, sample: SAMPLE }];

/** One ruler for the page — its answers are cached, so a bar rebuilt every move measures once. */
export function klondikeRuler(): TextMeasure {
  return domTextMeasure({ waitFor: WAITS });
}
