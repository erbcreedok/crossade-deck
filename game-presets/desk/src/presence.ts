// THE PEOPLE AT A NETWORKED DESK — an `AvatarsTransport` for the kit's shared `withAvatars`, with the
// relay in place of the catalog's own panes.
//
// The catalog can read every seat's camera because both screens are in one document. Here the other
// screen is on somebody else's phone, so `mine()` answers for this screen's own seat alone and `say`
// puts it on the wire (`relay {kind:"presence"}`), throttled — a view that moved is worth nothing a
// second later, and sent as a revision it would beat every real change to the desk in a race the
// desk must win. Everything downstream of a `Presence[]` — placing the discs, dressing the rings,
// idle-return, taps — is the kit's own (`withAvatars`) and is not restated here.

import { homeTarget } from "game-kit";
import type { AvatarSeat, AvatarsTransport, Paint, Presence, PresenceState, PresenceView, Vec } from "game-kit";
import type { RelayMessage, RosterItem } from "@crossade/wire";

/**
 * THE INKS SEATS ARE MARKED IN, in seat order — one list, read by the mark AND by the avatar.
 *
 * Asked twice they would drift, and then the badge saying who moved a card would be a different
 * colour from the person it is about, which is the one thing a colour on this desk is for.
 */
export const SEAT_INKS = ["accent", "alert", "textMuted", "text"] as const;

/**
 * THE SEATS A NETWORKED DESK IS BUILT WITH — `p1`, `p2`…, each in the ink its own mark is drawn in.
 *
 * The room names seats and the desk seats hands, and the two have to be the same names: a hand
 * standing beside `south` on a desk whose players are `p1` and `p2` belongs to nobody who is here.
 */
export function deskSeats(n: number): readonly AvatarSeat[] {
  return Array.from({ length: n }, (_, i) => ({ seat: `p${i + 1}`, ink: SEAT_INKS[i % SEAT_INKS.length]! }));
}

/**
 * Which of the inks a seat wears — `p1` is the first, `p2` the second, and so on round the desk.
 *
 * Read off the SEAT ITSELF, never off a roster's order: the room hands out `p1`, `p2`… once and for
 * good, but two screens build their OWN copy of who has joined so far at different moments — a roster
 * of one, seen the instant `p2` opens their own screen, put `p2` first and coloured them `p1`'s ink,
 * and the same ring showed a different colour on each side of the desk it stood on.
 */
export function inkOf(seat: string): Paint {
  const n = Number(/^p(\d+)$/.exec(seat)?.[1]);
  const i = Number.isInteger(n) ? n - 1 : 0;
  return SEAT_INKS[((i % SEAT_INKS.length) + SEAT_INKS.length) % SEAT_INKS.length]!;
}

/** How often this screen's own view may be told to the room, in ms — a hand moves faster than this. */
export const PRESENCE_EVERY_MS = 100;

export interface DeskAvatarsTransportOptions {
  /** This screen's own seat, once the room has said. */
  readonly mine: () => string | null;
  /** This screen's camera, as a message. Absent while the glass has not been laid out yet. */
  readonly view: () => PresenceView | undefined;
  /** Say something that is not a change to the desk. */
  readonly send: (msg: RelayMessage) => void;
  /** The clock, injectable so a test can move it without waiting. */
  readonly now?: () => number;
  /**
   * ГДЕ СТОИТ МЕСТО ЭТОГО СТУЛА — нужно тем, кто сидит, но молчит: у них нет экрана, чтобы сказать,
   * откуда они смотрят, и без места их некуда поставить.
   */
  readonly placeOf?: (seat: string) => { readonly at: Vec; readonly facing: number } | undefined;
}

export interface DeskAvatarsTransport {
  /** The `AvatarsTransport` itself — handed straight to the kit's `withAvatars`. */
  readonly transport: AvatarsTransport;
  /**
   * THE ROOM SAID WHO IS HERE — feeds `mine()`'s own name and every seat's ink. Returns the seats
   * that WERE here and no longer are, so the caller can tell the kit's wiring to forget them
   * (`Avatars.forget`): a roster shrinking is the one departure with no `Presence` left to say so.
   */
  roster(items: readonly RosterItem[]): readonly string[];
  /** Something arrived on the wire — `true` if it was this wiring's. */
  heard(msg: RelayMessage): boolean;
  /** This tab stopped being looked at, or started again. */
  state(state: PresenceState): void;
  /**
   * ЧЕМ ПОМЕЧЕН ЧЕЛОВЕК НА ЭТОМ СТУЛЕ — его цвет из профиля, а если своего нет, цвет места. Одно
   * место на все экраны: сукно, полоса и список говорят про человека одним цветом или не говорят
   * ничего.
   */
  inkOf(seat: string): Paint;
  /** Его лицо, если он его выбрал. Полоса рисует его вместо буквы. */
  faceOf(seat: string): string | undefined;
}

export function deskAvatarsTransport(o: DeskAvatarsTransportOptions): DeskAvatarsTransport {
  const now = o.now ?? (() => Date.now());

  /**
   * КТО СИДИТ, НО МОЛЧИТ — за столом есть, а вестей от него нет.
   *
   * Присутствие приезжает с чужого экрана: «вот мой вид, вот куда я смотрю». У мок-юзера экрана
   * нет вовсе, и стул под ним оставался пустым, хотя комната считала место занятым — сукно и
   * список говорили про один стол разное.
   *
   * Такой человек ставится НА СВОЁ МЕСТО: вид собирается из его места (`homeTarget`) и моего
   * стекла, а состояние — «отошёл»: он за столом, но не смотрит, и конуса взгляда у него нет.
   */
  const quiet = (seat: string): Presence | undefined => {
    const place = o.placeOf?.(seat);
    const glass = o.view();
    if (!place || !glass) return undefined;
    const view: PresenceView = {
      glass: glass.glass,
      zoom: glass.zoom,
      rotation: -place.facing,
      target: homeTarget(place, { zoom: glass.zoom, rotation: -place.facing, glass: glass.glass }),
    };
    return {
      seat,
      name: names.get(seat) ?? seat,
      ink: inkOfPerson(seat),
      ...(faces.get(seat) ? { picture: faces.get(seat)! } : {}),
      state: "away",
      holding: false,
      place,
      view,
    };
  };

  /** Everybody the room has named, in seat order — the order the inks are read by. */
  let seated: readonly string[] = [];
  const names = new Map<string, string>();
  /**
   * ЦВЕТ ЧЕЛОВЕКА НА ЭТОМ СТУЛЕ — его собственный, из профиля. Место даёт цвет только тогда, когда
   * своего нет: иначе один и тот же человек на сукне одного цвета, а в списке другого.
   */
  const inks = new Map<string, string>();
  const inkOfPerson = (seat: string): Paint => inks.get(seat) ?? inkOf(seat);
  /** Лицо человека на этом стуле, как он его выбрал. Нет лица — в кружке первая буква имени. */
  const faces = new Map<string, string>();
  let myState: PresenceState = "online";

  const heard = new Set<(presence: Presence) => void>();

  let lastSent = 0;
  /** What was last put on the wire, so a view that did not move is not news. */
  let lastWire = "";
  let lastState: PresenceState | undefined;
  /**
   * EVERY SEAT THIS SCREEN HAS EVER HEARD FROM — what makes "not news" mean "news to everybody".
   *
   * `say` compares against what was last SAID, and a view that nobody moved is said exactly once.
   * The first player says theirs into an empty room; the second joins a whole minute later and there
   * is nothing left to arrive, because nothing about the first player has changed since. Their ring
   * stood empty on the newcomer's screen for somebody sitting right there.
   *
   * So a seat heard from for the FIRST time makes my own last word stale: it was never told to them.
   */
  const knownEars = new Set<string>();

  return {
    transport: {
      mine: (): Presence[] => {
        const seat = o.mine();
        const view = o.view();
        if (!seat || !view) return [];
        const face = faces.get(seat);
        return [{ seat, name: names.get(seat) ?? seat, ink: inkOfPerson(seat), ...(face ? { picture: face } : {}), state: myState, holding: false, view }];
      },
      /**
       * MY OWN VIEW, ON THE WIRE — no oftener than `PRESENCE_EVERY_MS`, and never twice the same. A
       * state change goes at once and does not wait its turn: "this person has left" arriving a
       * tenth of a second late is the same picture, but arriving never — because nothing moved
       * afterwards to carry it — is a person who sits at the desk forever.
       */
      say: (presence) => {
        const wire = JSON.stringify(presence);
        if (wire === lastWire) return;
        const isStateChange = presence.state !== lastState;
        const t = now();
        if (!isStateChange && t - lastSent < PRESENCE_EVERY_MS) return;
        lastSent = t;
        lastWire = wire;
        lastState = presence.state;
        o.send({ kind: "presence", ...presence });
      },
      hear: (cb) => {
        heard.add(cb);
        return () => heard.delete(cb);
      },
    },
    roster: (items) => {
      const before = seated;
      seated = items.map((one) => one.seat).filter((seat): seat is string => typeof seat === "string");
      names.clear();
      inks.clear();
      faces.clear();
      for (const one of items) {
        if (!one.seat) continue;
        names.set(one.seat, one.name);
        if (one.color) inks.set(one.seat, one.color);
        if (one.face) faces.set(one.seat, one.face);
      }
      // МОЛЧУНЫ ВСТАЮТ НА СВОИ МЕСТА. Говорившие хоть раз (`knownEars`) сюда не попадают: их
      // собственное присутствие точнее любой догадки, и перебивать его местом нельзя.
      for (const seat of seated) {
        if (seat === o.mine() || knownEars.has(seat)) continue;
        const sitting = quiet(seat);
        if (sitting) for (const cb of heard) cb(sitting);
      }
      return before.filter((seat) => !seated.includes(seat));
    },
    heard: (msg) => {
      if (msg.kind !== "presence") return false;
      const seat = msg.from;
      // A SEAT IS THE ROOM'S TO WRITE, never the sender's, and my own never arrives from outside.
      if (typeof seat !== "string" || seat === o.mine()) return true;
      const wire = msg as unknown as Presence;
      if (!wire.view) return true;
      // SOMEBODY NEW IS LISTENING, so my own view has to go out again — see `knownEars`. Before the
      // callbacks below, because they are what publishes, and publishing is what calls `say`.
      if (!knownEars.has(seat)) {
        knownEars.add(seat);
        lastWire = "";
        lastSent = 0;
      }
      // THE NAME IS THE ROOM'S, not the wire's — a presence never carried one in the old design
      // either, and asking the sender to repeat their own name on every view would be a second
      // source for the one word the roster already owns.
      const presence: Presence = {
        seat,
        name: names.get(seat) ?? seat,
        // ЦВЕТ — КОМНАТЫ, а не провода: она одна знает профиль каждого, и присланное с чужого
        // экрана значение сделало бы человека разным на разных стёклах.
        ink: inkOfPerson(seat),
        ...(faces.get(seat) ? { picture: faces.get(seat)! } : {}),
        state: wire.state ?? "online",
        holding: wire.holding === true,
        view: wire.view,
        ...(wire.place ? { place: wire.place } : {}),
      };
      for (const cb of heard) cb(presence);
      return true;
    },
    state: (state) => {
      myState = state;
    },
    inkOf: (seat) => inkOfPerson(seat),
    faceOf: (seat) => faces.get(seat),
  };
}
