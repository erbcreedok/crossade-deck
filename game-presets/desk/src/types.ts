// WHAT A GAME TELLS THE DESK, AND WHAT THE DESK TELLS IT BACK.
//
// Three shapes and no more: a SPEC is what the game IS (`DeskSpec`), a LAYER is what the game adds
// on top of the glass (`DeskLayer`), a HOST is where the game is being played (`DeskHost`). If a
// fourth is ever needed, it is a sign that something game-shaped has crept into the runtime.
//
// Every one of these was read off the file that used to be the hub's whole desk: the spec's fields
// are exactly the questions that file answered with `if (game === …)`, and the layer's methods are
// exactly the places the card table reached into it.

import type { TopHudExit, TopHudLook } from "@game-presets/tophud";
import type {
  Avatars,
  CameraHud,
  LiveStage,
  LiveTableOptions,
  Node,
  SeatPlace,
  Transform,
  Vec,
} from "game-kit";

/** Who is sitting where, as the room names them — the seat, and what it calls the person in it. */
export interface SeatedPerson {
  readonly seat: string;
  readonly name: string;
  /** Their tab is not the one in front of them. The room's own word, passed through. */
  readonly away?: boolean;
}

/** The glass, in CSS pixels. */
export interface Glass {
  readonly width: number;
  readonly height: number;
}

/** The stretch the camera is held inside, in the desk's own units. */
export interface Room {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * HOW BIG THE DESK OPENS. A desk that names a span opens fitted to THAT, and not to its room — the
 * round table's felt is a fraction of the room it needs (half a glass of felt behind every seat),
 * and a view fitted to the room is the whole table seen from across it. A BOARD NAMES NONE: chess
 * and nardy are played on the whole board at once, and the kit's own fallback is the picture wanted.
 */
export interface HomeZoom {
  readonly span: number;
  readonly width: number;
}

/**
 * WHAT A LAYER IS HANDED — everything the card table's own glass HUD reaches for, and nothing that
 * would let it reach further.
 *
 * The list is not a guess: `courtHand`, the heaviest thing any layer will ever do, needs the
 * camera's transform, the motions' `reach()` and `hoist()`, the tree by id, and a way to say "I
 * wrote on the desk". They are all here, which is what makes it possible for the hand to live in
 * its own package instead of leaving one line behind in this one.
 */
export interface DeskContext {
  /** The host the kit is drawing into — `host.root` is the tree as it stands. */
  readonly host: ReturnType<typeof import("game-kit").liveTable>["host"];
  /** The tree as it stands. A layer must ask every time: a reload replaces the whole object. */
  root(): Node;
  /** This screen's camera, absent until the glass has been laid out. */
  camera(): ReturnType<typeof import("game-kit").liveTable>["camera"];
  /** What is moving right now — the drawn transforms, the hoist, the repaint. */
  motions(): ReturnType<typeof import("game-kit").liveTable>["motions"];
  /** Which seat this glass is, or `null` until the room has said. */
  seat(): string | null;
  /** The screen the camera's own pair hangs on — a layer hangs its own picture on the same one. */
  hudRoot(): Node | undefined;
  /** The ink a seat wears, so a layer marks people in the same colours the desk does. */
  ink(seat: string): import("game-kit").Paint;
  /** Draw the desk again — a write to the tree is not by itself a repaint. */
  redraw(): void;
  /**
   * I WROTE ON THE DESK OUTSIDE A GESTURE — re-dress everything and tell the room, the way a drop
   * is told. The hand needs it: a chair that untucks itself is a change other screens must see.
   */
  write(): void;
  /** The people at this desk, once the room can be asked — the kit's own wiring. */
  avatars(): Avatars | undefined;
  /** The camera's own pair of controls, once they are up. */
  hud(): CameraHud | undefined;
}

/**
 * SOMETHING THE GAME PUTS ON TOP OF THE DESK — a picture on the glass, furniture that follows the
 * roster, a rule that needs to hear every carry.
 *
 * A layer is mounted only once the seat is known, because everything a layer has ever wanted to do
 * needs to know whose screen this is. Every method but `mount` and `stop` is optional: a layer that
 * only dresses chairs implements `seated` and nothing else.
 */
export interface DeskLayer {
  /** The seat has arrived and the desk is standing. */
  mount(ctx: DeskContext): void;
  /** The desk changed — a drop, a flip, or a whole tree that arrived from the room. */
  changed?(): void;
  /** Somebody's hand is in the air on THIS screen. `done` is the release. */
  carried?(
    items: readonly { readonly id: string; readonly still?: boolean | undefined }[],
    at: Vec | undefined,
    done: boolean,
    feel: { readonly lift?: number | undefined },
  ): void;
  /** The room said who is sitting where — including the first time, and after every change. */
  seated?(present: readonly SeatedPerson[]): void;
  /**
   * СОСТОЯНИЕ РУКИ ЭТОГО МЕСТА — включены ли лок, пин и скрытность. Спрашивает панель за столом;
   * отвечает тот, кто эту руку и рисует. Рантайм мебели не знает и знать не должен
   * (`desk.the-runtime-knows-no-game`): для него это три галочки, чьё значение ему безразлично.
   */
  hand?(seat: string): { readonly lock?: boolean; readonly pin?: boolean; readonly hide?: boolean } | undefined;
  /**
   * ПЕРЕКЛЮЧИТЬ ОДНУ ИЗ НИХ. `true` — сделано, и стол расскажет об этом комнате как об обычной
   * правке дерева. Право спрошено раньше: панель рисует только то, что комната разрешила.
   */
  handDeed?(seat: string, what: "lock" | "pin" | "hide"): boolean;
  /** A picture of a piece drawn by this layer is a way of REACHING that piece (`standIn`). */
  standIn?(n: Node): Node | undefined;
  /**
   * HOW MUCH OF THE FOOT OF THE GLASS THIS LAYER IS USING, in CSS pixels — so the camera's own
   * controls stand clear of it. A strip that grew with the cards in it and a pair of buttons that
   * did not know are two things drawn on top of each other.
   */
  floor?(): number;
  stop(): void;
}

/**
 * WHERE THIS GAME IS BEING PLAYED. The whole of the difference between "inside the hub" and "on its
 * own URL" — which is why a game needs to know nothing about the hub to run without it.
 */
export interface DeskHost {
  /** The room code this screen was opened at, if any. */
  room(): string | undefined;
  /**
   * THERE IS A WAY OUT OF HERE, AND THIS IS WHERE IT LEADS — the one thing only a shelf knows.
   *
   * A game opened at its own URL answers nothing, and its strip is standalone's: no way out, and
   * the name becomes the leftmost thing on it. This is the whole of what the hub contributes to a
   * strip that otherwise belongs to the game.
   */
  readonly exit?: TopHudExit | undefined;
  /** The room has a code now — put it in the address, so a reload comes back to the same table. */
  setRoom(code: string): void;
  /** What is laid OVER the desk's region, in CSS pixels — a banner, a bar. Usually nothing. */
  insets(): { readonly top: number };
  /** A clock that counts frames. A throw, a glide and the idle countdown all borrow it. */
  clock(): { join(tick: (seconds: number, dt: number) => boolean | void): () => void; stop(): void };
  /**
   * ЗА СТОЛ НЕ СЕЛИ, И ВОТ ПОЧЕМУ. Стол, к которому не удалось присоединиться, всё равно рисуется —
   * иначе человек смотрит в пустой прямоугольник и не отличает его от сломанного экрана. Но «стол
   * закрылся» — не сбой связи: показывать вместо закрывшегося стола его пустую копию значит врать
   * тому, кто пришёл по старой ссылке к друзьям.
   *
   * Кто отвечает на это, отвечает и за то, что будет дальше: хаб уводит на полку и говорит вслух.
   * Кто не отвечает (игра на своём URL), получает прежнее поведение — местный стол.
   */
  lost?(why: "closed" | "offline"): void;
  /** What the desk is covered with until it knows whose side it is seen from (`curtain`). */
  readonly cover: string;
}

/**
 * WHAT A GAME IS, as data — every field one of the questions the hub's old desk answered with a
 * branch on the game's name.
 */
export interface DeskSpec {
  /** The game's own id, and the name the room is created under. Opaque to the runtime. */
  readonly id: string;
  /**
   * WHAT THE GAME IS CALLED, already in the reader's language — what the strip along the top writes.
   * Opaque to the runtime, exactly like `id`: a name is the game's own, and a runtime that built one
   * out of the id would be a runtime that knows the games.
   */
  readonly title: string;
  readonly seats: number;
  /** The board, built fresh. Called once, before anything has been drawn. */
  map(): Node;
  /** Where the players sit, in the desk's own units — index order is seat order. */
  places(seats: number): readonly SeatPlace[];
  /** The stretch the camera is held inside — re-read on every resize, so it may use the glass. */
  room(seats: number, glass: Glass): Room;
  /** How many CSS pixels one of this desk's units is worth at rest. */
  unit: number;
  /** How big the desk opens, when it is not the kit's own fit (`HomeZoom`). */
  readonly home?: HomeZoom | undefined;
  /** How this desk is played — the kit's own options, under the names the catalog passes them by. */
  play(ctx: DeskContext): LiveTableOptions<LiveStage>;
  /**
   * A PATCH OF FELT PER PERSON, and how far out from the middle it stands — the card table has one,
   * a board has none: a piece on a board is on a square, and a patch of felt beside a player would
   * be a place the game has no word for. Handed straight to the kit's `withAvatars`.
   */
  readonly handsRadius?: number | undefined;
  /** What the game puts on top (`DeskLayer`) — the card table's hand and chairs live here. */
  readonly layers?: readonly DeskLayer[];
  /** Re-dresses the board in this game's look, AFTER the map has registered its own. */
  readonly look?: (() => void) | undefined;
  /** Anything this game wants turned on the strip along the top. By default it turns nothing. */
  readonly topHud?: Partial<TopHudLook> | undefined;
  /**
   * WHOSE MOVE IT IS, as a seat — the one fact about the strip no runtime can work out, because a
   * turn is a rule and rules are the game's. A game with no turns in it answers nothing and nobody
   * on the strip wears the ring.
   */
  readonly turn?: (() => string | undefined) | undefined;
}

/** A running desk, stopped completely by calling it. */
export type Teardown = () => void;

/** Handed to a far cursor so this screen can draw where somebody else's finger is. */
export interface FarDot {
  readonly at: Vec;
  readonly view: Transform;
}
