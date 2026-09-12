// THE PLAYER'S OWN HAND AT THE FOOT OF THE GLASS — as a `DeskLayer`, so a card table is a desk
// plus this, and nothing in the desk itself knows what a card is.
//
// It is the whole of what used to sit in the hub's own desk under `if (game === "cards")`: the strip
// on the glass, the hoist of a card carried down over it, the chairs the strip is a picture OF, and
// the two questions a gesture asks about a hand (`mayTake`, `handTakes`).
//
// THE LAYER IS ALSO THE SPEC'S HANDLE ON IT. A card game's `play()` needs the same hand this layer
// mounts — a drop aimed at the strip is a drop into the box on the felt — so the object returned
// here is a `DeskLayer` AND the few questions a spec has to ask of it. One object, so the two can
// never end up being two different hands.

import {
  chairId,
  courtLift,
  handHud,
  handTakes,
  HUD_COURT,
  isHand,
  mayTake,
  untuck,
  type HandHud,
} from "@game-presets/desks";
import type { DeskContext, DeskLayer, SeatedPerson } from "@game-presets/desk";
import {
  apply,
  byId,
  composeTransforms,
  DEFAULT_TUNING,
  extentOf,
  fieldsOf,
  footprint,
  zoneNear,
  type Node,
  type SeatPlace,
  type TransformableFields,
  type Vec,
} from "game-kit";
import { syncSeatChairs } from "./seatChairs.js";

export interface HandLayerOptions {
  /** The desk's own slots, in seat order — where a ring stands. */
  readonly places: readonly SeatPlace[];
}

export interface HandLayer extends DeskLayer {
  /**
   * A DROP AIMED AT THE STRIP ON THE GLASS IS A DROP INTO THE HAND ON THE FELT — the same box, asked
   * for by pointing at its picture. There is one hand, so there is one answer: the chair.
   */
  handUnderFinger(at: Vec): Node | undefined;
  /**
   * THE NEAREST HAND WITHIN REACH, AND ONLY IF IT WOULD TAKE THE CARD FROM THIS SEAT — the `zones`
   * a card game plays with. One question asked once: a hand the drop is going to refuse must not
   * light up inviting the card first, and both the light and the drop read this line.
   */
  zoneAt(root: Node, at: Vec, lead: Node, from?: Node): Node | undefined;
  /**
   * A SHUT HAND CANNOT BE REACHED INTO — refused at the PICK and not at the drop, because what a
   * shut hand refuses is the gesture ever starting: a card that lifted out and flew back would read
   * as the desk having dropped it. Also: a card at a chair is an INDICATOR, taken through its
   * picture on the owner's glass (`via`) and never off the chair itself.
   */
  may(n: Node, via?: Node): boolean;
  /** A TAP ON A CARD AT A CHAIR TURNS NOTHING: the indicator is looked at, not played. */
  taps(piece: Node): boolean;
}

export function handLayer(o: HandLayerOptions): HandLayer {
  let ctx: DeskContext | undefined;
  let hand: HandHud | undefined;
  /**
   * HOW MUCH OF THE CARRIED CARD IS INSIDE THE HUD'S REACH, remembered from the last move — the drop
   * reads it: past `HUD_COURT`, a release is a release into the hand, wherever the finger is.
   */
  let entered = 0;

  const seat = (): string | null => ctx?.seat() ?? null;

  /**
   * A CARRIED CARD COURTS THE HAND ON THE GLASS: as the card comes down over the HUD's reach it is
   * hoisted, rising and growing with how much of it is inside, until past `HUD_COURT` it is the
   * hand's own card size; the hand shows the outline of the place it would take, and comes out from
   * under the bar if it was tucked. Measured on the card AS DRAWN (through the camera), because that
   * is the card the eye is judging by.
   */
  const court = (
    items: readonly { readonly id: string; readonly still?: boolean | undefined }[],
    done: boolean,
    liftFeel: number | undefined,
  ): void => {
    const lead = items.find((it) => !it.still);
    const camera = ctx?.camera();
    const mine = seat();
    if (!ctx || !hand || !mine || !camera || !lead || done) {
      if (lead) ctx?.motions()?.hoist(lead.id);
      hand?.court(false);
      entered = 0;
      return;
    }
    const piece = byId(ctx.root(), lead.id);
    const shape = piece ? footprint(piece) : undefined;
    const drawn = ctx.motions()?.reach().get(lead.id);
    if (!shape || !drawn) return;
    const view = camera.transform();
    const onGlass = composeTransforms(view, drawn);
    const size = extentOf(shape);
    const px = Math.hypot(onGlass.a, onGlass.b);
    const turn = Math.atan2(onGlass.b, onGlass.a);
    const tall = (Math.abs(size.w * Math.sin(turn)) + Math.abs(size.h * Math.cos(turn))) * px;
    const centre = apply(onGlass, { x: 0, y: 0 });
    entered = hand.entering({ y: centre.y - tall / 2, h: tall });
    // THE HAND'S CARD OVER THE FELT'S — the size the card grows to, as a lift over its resting size.
    // A CARD OUT OF A CHAIR RESTS SMALL (its own scale), and the lift is a factor over that: so its
    // base lift is the ordinary one over its own scale, which is the card at the size it will have
    // on the felt — hoisted from the first move, not only inside the reach.
    const feltPx = Math.hypot(view.a, view.b) * size.w;
    const drawnAt = (piece ? fieldsOf<TransformableFields>(piece, "Transformable")?.scale : undefined) ?? 1;
    const base = (liftFeel ?? DEFAULT_TUNING.lift) / (drawnAt > 0 ? drawnAt : 1);
    ctx.motions()?.hoist(
      lead.id,
      entered > 0 ? courtLift(entered, base, feltPx > 0 ? hand.cardPx() / feltPx : base) : drawnAt !== 1 ? base : undefined,
    );
    if (entered > 0) {
      const chair = byId(ctx.root(), chairId(mine));
      if (chair && untuck(chair)) ctx.write();
    }
    hand.court(entered > 0);
  };

  return {
    mount(next) {
      ctx = next;
      const mine = next.seat();
      const screen = next.hudRoot();
      if (hand || !mine || !screen) return;
      hand = handHud(next.host, { seat: mine, desk: () => next.root(), ink: next.ink(mine), screen });
      hand.refresh();
    },

    changed() {
      hand?.refresh();
    },

    carried(items, at, done, feel) {
      // WHAT IS IN THE AIR IS OUT OF THE PICTURE while it is: a card drawn under the finger and
      // still lying in the strip is one card shown twice.
      hand?.lifting(done ? [] : items.map((it) => it.id));
      court(items, done, feel.lift);
    },

    seated(present: readonly SeatedPerson[]) {
      const here = ctx;
      if (!here) return;
      syncSeatChairs(here.root(), present, o.places, (seat) => here.ink(seat));
      // ...AND THE STRIP IS A PICTURE OF A CHAIR: drawn before there was one it is an empty foot of
      // the screen for ever, so the mount is tried again every time the furniture changes.
      this.mount!(here);
      hand?.refresh();
    },

    standIn: (n: Node) => hand?.standFor(n),

    floor: () => hand?.floor() ?? 0,

    stop() {
      hand?.stop();
      hand = undefined;
      ctx = undefined;
    },

    handUnderFinger(at: Vec) {
      // NOT GATED ON THE HAND BEING PINNED YET: while the anchor is up the drop belongs here too,
      // and `overHand` is the one that knows which of the two is under the finger.
      const mine = seat();
      const camera = ctx?.camera();
      if (!ctx || !hand || !mine || !camera) return undefined;
      // A CARD THAT IS MOSTLY IN THE HUD IS THE HAND'S, wherever the finger is (`court`).
      if (entered >= HUD_COURT) return byId(ctx.root(), chairId(mine));
      return hand.overHand(apply(camera.transform(), at)) ? byId(ctx.root(), chairId(mine)) : undefined;
    },

    zoneAt(root, at, lead, from) {
      const mine = seat();
      if (!mine) return undefined;
      const shown = this.handUnderFinger(at);
      if (shown && handTakes(shown, lead, mine)) return shown;
      const zone = zoneNear(root, at, lead, from);
      // THE HAND A CARD CAME OUT OF takes it back when it is AIMED at — its picture on the glass, or
      // the card put down on it — and never by its pull (`zoneNear`'s `from`).
      return zone && zone !== from && isHand(zone) && handTakes(zone, lead, mine) ? zone : undefined;
    },

    may(n, via) {
      if (via === undefined && n.parent !== null && isHand(n.parent)) return false;
      const mine = seat();
      return mine ? mayTake(n, mine) : true;
    },

    taps: (piece: Node) => piece.parent !== null && isHand(piece.parent),
  };
}
