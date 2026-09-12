// THE ROW OF PEOPLE, AS ARITHMETIC — where each circle sits, which one is over which, and who is
// behind the number at the end. No document, so it can be checked without one.
//
// THE ROW IS A CONSTANT WIDTH: exactly as wide as `tight` avatars set edge to edge, and it never
// grows past that. A row that grew would lose the strip as people sat down at the table, and a full
// table would push the game's name off the screen.

import type { TopHudLook } from "./look.js";

/** One person at the desk, as the strip needs them. The ink is the desk's own (`DeskContext.ink`). */
export interface TopHudPerson {
  readonly seat: string;
  readonly name: string;
  readonly ink: string;
  /** Его лицо, как он его выбрал. Пусто — в кружке первая буква имени. */
  readonly face?: string;
  readonly away?: boolean;
  /** Whose move it is. More than one is not the strip's business to refuse. */
  readonly turn?: boolean;
}

/** A face, or the number standing for everyone who did not fit. */
export type RowBall =
  | { readonly kind: "face"; readonly person: TopHudPerson; readonly left: number; readonly z: number }
  | { readonly kind: "more"; readonly count: number; readonly left: number; readonly z: number };

export interface PeopleRow {
  readonly balls: readonly RowBall[];
  /** The row's own width in CSS pixels — never more than `tight` avatars. */
  readonly width: number;
  /** Centre to centre. Equal to an avatar while they still fit, smaller once they lean. */
  readonly step: number;
  /** Everybody the strip is speaking for, after the ones who are hidden are dropped. */
  readonly seated: readonly TopHudPerson[];
  /** How many of them are behind the number. */
  readonly hidden: number;
}

export function peopleRow(people: readonly TopHudPerson[], look: TopHudLook): PeopleRow {
  const seated = look.away === "hide" ? people.filter((p) => !p.away) : people;
  const over = seated.length > look.maxBalls;
  // THE NUMBER TAKES A PLACE OF ITS OWN, so the last face makes way for it rather than being
  // counted twice.
  const faces = over ? seated.slice(0, look.maxBalls - 1) : seated;
  const count = faces.length + (over ? 1 : 0);
  const tightPx = look.tight * look.avatar;
  // UP TO `tight` THEY ARE EDGE TO EDGE — one group, not a run of buttons. Past it the step shrinks
  // by exactly as much as it takes to keep the row the same width.
  const step = count <= 1 ? look.avatar : count <= look.tight ? look.avatar : (tightPx - look.avatar) / (count - 1);
  const width = count === 0 ? 0 : Math.round(count <= look.tight ? count * look.avatar : tightPx);
  // LEFT OVER RIGHT: the row reads as a deck laid down left to right, and whoever is at the head of
  // it stays whole.
  const balls: RowBall[] = faces.map((person, i) => ({
    kind: "face" as const,
    person,
    left: Math.round(i * step),
    z: count - i,
  }));
  if (over) {
    balls.push({
      kind: "more",
      count: seated.length - faces.length,
      left: Math.round((count - 1) * step),
      // NOBODY LEANS ON THE NUMBER. "Left over right" would put it under its neighbour, and it is
      // not a face but a figure: "+5" cut down to "5" is wrong data, not a partly hidden person.
      z: count + 1,
    });
  }
  return { balls, width, step, seated, hidden: over ? seated.length - faces.length : 0 };
}
