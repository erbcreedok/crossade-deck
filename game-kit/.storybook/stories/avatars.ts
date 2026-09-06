// THE PEOPLE AT A LIVE DESK — the catalog's own thin wrapper over the kit's shared `withAvatars`.
//
// The kit's engine (`../../src/render/avatars.ts`) answers the four questions every live desk with
// people on it grows — who is here, where do they stand, what does their hand look like, and who
// just touched the glass — off a `Presence[]` it is handed by a transport. What is left here is
// what only the catalog knows: both screens live in one document, so their cameras are read live
// and synchronously (`mine()`), nothing ever arrives from outside (`hear`/`say` are no-ops), and the
// page's own prose (`docs.<page>.name.<seat>`) fills in the `name` the kit's `Presence` carries.

import {
  watchPresence,
  withAvatars as withKitAvatars,
  type AvatarSeat,
  type AvatarsTransport,
  type CarryItem,
  type Node,
  type Presence,
  type PresenceState,
  type PresenceView,
  type SeatPlace,
  type Vec,
} from "../../src/index.js";
import { type Screen } from "./liveScreens.js";
import { currentSettings, onSettingsChange } from "../devtools/catalogSettings.js";
import { loadPage, type PageText } from "../locales/pages.js";

export interface AvatarsOptions {
  /** The one tree the screens share — the people are placed INTO it, like everything else on it. */
  readonly desk: Node;
  readonly seats: readonly AvatarSeat[];
  /** The screens, as the page fills them in — read live, because a pane exists before its scene. */
  readonly screens: readonly Screen[];
  /** The prose bundle whose `docs.<page>.name.<seat>` the discs wear. */
  readonly page: string;
  /** See the kit's `AvatarsOptions.places` — the seat's own opening place at this desk. */
  readonly places?: readonly SeatPlace[];
  /** See the kit's `AvatarsOptions.hands` — the rim a hand is measured against, when this desk has one. */
  readonly hands?: number;
  /** See the kit's `AvatarsOptions.locked` — whose hand is shut when the page opens, by seat index. */
  readonly locked?: readonly boolean[];
  /** See the kit's `AvatarsOptions.goHome` — take this seat's own view home. */
  readonly goHome?: (seat: string) => void;
  /** The story's own element — the listeners below are dropped when it leaves the document. */
  readonly wall: HTMLElement;
}

export interface Avatars {
  /** Everybody placed, and every screen told — latched, so a placement cannot start another. */
  readonly publish: () => void;
  /** The desk came to rest: the furniture may have changed size without anybody having moved. */
  readonly settled: () => void;
  /** What the mirror's `hand` report means to the PEOPLE, after the screens have been told. */
  readonly handed: (seat: string, items: readonly CarryItem[], at: Vec | undefined, done: boolean) => void;
  /** A finger came down in this pane — the stand-in for "mine" where one tree serves two screens. */
  readonly claim: (seat: string) => void;
  /** A tap on one's OWN ring takes that reader's view home. Anything else is not this wiring's. */
  readonly tapped: (seat: string, piece: Node) => boolean;
  /** A press on the bar above one's OWN hand — shut, hide, turn over, pin. See the kit's `Avatars.pressed`. */
  readonly pressed: (seat: string, control: Node) => boolean;
  /** Where a seat's place stands RIGHT NOW — the opening one until its owner drags the chair. */
  readonly placeOf: (seat: string) => SeatPlace | undefined;
}

/** What one screen's camera is worth as a message — see `PresenceView` on why the scale is total. */
const viewOf = (one: Screen): PresenceView | undefined => {
  const camera = one.scene?.camera;
  if (!camera) return undefined;
  return { target: camera.target, zoom: camera.pixelsPerUnit, rotation: camera.rotation, glass: camera.glass };
};

/**
 * THE PEOPLE, WIRED INTO A LIVE PAGE — one call, and the page hands its own pieces back in.
 *
 * Everything below is the page-specific parts the kit's own `withAvatars` does not know: fetching
 * a page's prose for two names, and reading Pixi cameras straight off the page's own screens. The
 * four questions themselves — who is here, where do they stand, what is in their hand, who tapped
 * the glass — are answered by the kit.
 */
export function withAvatars(o: AvatarsOptions): Avatars {
  /**
   * A FINGER CAME DOWN IN THIS PANE — the stand-in for "mine" where one tree serves two screens.
   * Not part of the kit's own contract: the kit reads every screen's camera through `mine()`
   * regardless of which pane a finger is in, and this is here only because the earlier catalog
   * `Avatars` carried a `claim` the stories still call.
   */
  let mine: string = o.seats[0]!.seat;

  /** Whose tab this is, for every seat alike — both screens live in the one document. */
  const states = new Map<string, PresenceState>(o.seats.map(({ seat }) => [seat, "online"]));

  /**
   * THE PAGE'S OWN WORDS, FETCHED BY THE PAGE. The catalog hands a story the CHROME's bundle; a
   * page's prose is loaded when somebody opens it, and two player names are that page's prose —
   * put in the chrome they would be downloaded by every reader of every other page.
   *
   * Until they arrive the key itself stands in, which is what the catalog does everywhere else: a
   * name a moment late is better than a disc that waits for a network round trip to exist.
   */
  let said: PageText | undefined;
  const words = (key: string): string => (said ? said.text(key as Parameters<PageText["text"]>[0]) : key);
  const readNames = (): void => {
    const locale = currentSettings().text.locale;
    void loadPage(o.page, locale).then((text) => {
      if (currentSettings().text.locale !== locale) return;
      said = text;
      kit.publish();
    });
  };

  const tellScreens = (): void => {
    for (const one of o.screens) one.scene?.setRoot(o.desk);
  };

  /**
   * ONE PUBLICATION AT A TIME, ACROSS THE PAGE'S OWN HALF TOO — `tellScreens` calls a real scene's
   * `setRoot`, which can wake `cameraInput` and call the page's `onView` SYNCHRONOUSLY before
   * `setRoot` returns; every live page wires `onView` straight to `people.publish()`. The kit's own
   * `publish` already guards ITS half with `placing`, but that latch never covers `tellScreens` —
   * it is the page's, not the kit's — so without a latch here the re-entrant call runs this same
   * function again, which calls `tellScreens` again, which wakes the camera again: a loop with no
   * floor, the one the kit's own comment already names, just missing on the caller's side of it.
   */
  let placing = false;

  const transport: AvatarsTransport = {
    mine: (): Presence[] =>
      o.screens.flatMap((one) => {
        const view = viewOf(one);
        if (!view) return [];
        return [
          {
            seat: one.seat,
            name: words(`docs.${o.page}.name.${one.seat}`),
            ink: one.ink,
            state: states.get(one.seat)!,
            holding: false,
            view,
          },
        ];
      }),
    // NOTHING EVER ARRIVES FROM OUTSIDE — a catalog page keeps both panes in one document, so
    // everything there is to know is already in `mine()`.
    say: () => {},
    hear: () => () => {},
  };

  const kit = withKitAvatars({
    desk: o.desk,
    seats: o.seats,
    transport,
    ...(o.places ? { places: o.places } : {}),
    ...(o.hands !== undefined ? { hands: o.hands } : {}),
    ...(o.locked ? { locked: o.locked } : {}),
    ...(o.goHome ? { goHome: o.goHome } : {}),
    wall: o.wall,
  });

  const stopFollowing = onSettingsChange(() => readNames());
  readNames();

  /** A hidden tab is nobody's screen, so everybody sitting in it goes quiet at once. */
  const stopWatching = watchPresence(document, (state) => {
    for (const { seat } of o.seats) states.set(seat, state);
    kit.publish();
  });

  // The story's element is thrown away whole on a re-render; the two listeners above are not,
  // and an unremoved one goes on fetching prose or watching visibility for a page nobody draws.
  const observer = new MutationObserver(() => {
    if (o.wall.isConnected) return;
    stopFollowing();
    stopWatching();
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return {
    publish: () => {
      if (placing) return;
      placing = true;
      try {
        kit.publish();
        tellScreens();
      } finally {
        placing = false;
      }
    },
    settled: () => {
      if (placing) return;
      placing = true;
      try {
        kit.settled();
        tellScreens();
      } finally {
        placing = false;
      }
    },
    handed: (seat, items, at, done) => kit.handed(seat, items, at, done),
    claim: (seat) => {
      if (mine === seat) return;
      mine = seat;
      kit.publish();
    },
    tapped: (seat, piece) => kit.tapped(seat, piece),
    pressed: (seat, control) => {
      // A PRESS WROTE THE ONE TREE, and both panes draw it: the other screen is told the way a
      // drop tells it (`tellScreens`).
      if (!kit.pressed(seat, control)) return false;
      tellScreens();
      return true;
    },
    placeOf: (seat) => kit.placeOf(seat),
  };
}
