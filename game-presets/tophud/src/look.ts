// EVERY LEVER OF THE STRIP, IN ONE TYPED OBJECT — and one file holding what each of them is by
// default.
//
// The defaults ARE the design: they are the stand's own (`design/tophud`), read off the knobs the
// owner left them on. A game may override any of them and by default overrides nothing, so the
// strip is the same strip in all four games and in standalone — which is the whole point of it
// belonging to the game rather than to the hub.
//
// It is one object rather than numbers spread through the markup because these knobs are going to
// a settings screen and a themes screen next: a lever that is a literal in a template cannot be
// turned by anything but an edit.

/** How the strip is bedded onto the glass. */
export type TopHudFill = "glass" | "wood" | "dark" | "felt" | "fade" | "none";
/** One band across the width, a plate under each group, or a single plate around the lot. */
export type TopHudShape = "band" | "islands" | "island";
/** What the way out looks like. */
export type TopHudBack = "icon" | "icon+word" | "word" | "none";
/** What is written beside it. */
export type TopHudTitle = "name+room" | "name" | "room" | "none";
/** How the room code is set. */
export type TopHudRoom = "plate" | "mono" | "plate+copy";
/** What a person is drawn as. */
export type TopHudAvatar = "letter" | "chair" | "dot";
/** How the one whose turn it is, is marked. */
export type TopHudTurn = "ring" | "dot" | "glow" | "none";
/** What happens to somebody who has stepped away. */
export type TopHudAway = "dim" | "asis" | "hide";

export interface TopHudLook {
  /** The strip's own height, in CSS pixels. The notch is added to it, never taken out of it. */
  readonly height: number;
  /** Side margin, the gap between groups, and the corner radius. */
  readonly side: number;
  readonly gap: number;
  readonly radius: number;
  readonly fill: TopHudFill;
  /** How far the glass fill blurs what is under it. Ignored by every other fill. */
  readonly blur: number;
  readonly shape: TopHudShape;
  /** A rule under the strip: none, gold, or black. */
  readonly line: "none" | "gold" | "black";
  readonly shadow: boolean;
  readonly back: TopHudBack;
  /** The word on the way out, when it wears one. */
  readonly backWord: string;
  readonly title: TopHudTitle;
  /** Left of the strip, straight after the way out — or centred on the GLASS. */
  readonly titleAlign: "left" | "center";
  readonly room: TopHudRoom;
  /** An avatar's diameter, in CSS pixels. */
  readonly avatar: number;
  readonly avatarLook: TopHudAvatar;
  readonly turn: TopHudTurn;
  readonly away: TopHudAway;
  readonly peopleSide: "right" | "left";
  /**
   * HOW MANY AVATARS THE ROW IS WIDE — and it is a width, not a count: past this many they lean on
   * each other instead of making the row longer.
   */
  readonly tight: number;
  /** The most circles the strip will ever carry: faces, plus the one that is a number. */
  readonly maxBalls: number;
  /** Below this much room the name is taken away whole rather than shortened to a stub. */
  readonly minTitle: number;
  /** The most of the glass the name may ever ask for, as a fraction. */
  readonly nameShare: number;
}

/** The stand's own knobs, as the owner left them. A game that overrides none of this gets these. */
export const TOP_HUD_LOOK: TopHudLook = {
  height: 40,
  side: 5,
  gap: 5,
  radius: 0,
  fill: "glass",
  blur: 7,
  shape: "band",
  line: "none",
  shadow: true,
  back: "icon",
  backWord: "Назад",
  title: "name+room",
  titleAlign: "left",
  room: "plate",
  avatar: 30,
  avatarLook: "letter",
  turn: "ring",
  away: "dim",
  peopleSide: "right",
  tight: 5,
  maxBalls: 8,
  minTitle: 60,
  nameShare: 0.42,
};

/** The look a game asked for, over the defaults. A game that asked for nothing gets the defaults. */
export function topHudLook(over?: Partial<TopHudLook>): TopHudLook {
  return over ? { ...TOP_HUD_LOOK, ...over } : TOP_HUD_LOOK;
}
