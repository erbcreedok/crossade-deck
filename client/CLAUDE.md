# Crossade Deck — client

React + Vite. The table is rendered by an imperative **Pixi.js v8** engine (not `@pixi/react` — see
why below); menus and static UI are plain React, Framer Motion only there.

There are no rules for any specific card game here — what's implemented is the full physical table
mechanics (deck, dealing, hands, voting), on top of which game rules can later be layered as
configuration.

```bash
cd client && npm test && npx tsc --noEmit   # 868 tests
cd client && npx vite build                 # production build
```

## Table architecture

`client/src/game/RoomEngine.ts` (~4700 lines, ~236 methods averaging 19 lines) is an imperative
engine: it owns a single Pixi `Application`, the ticker, and all visual objects (`CardVisual` — plain
mutable structs, not React nodes). `RoomCanvas.tsx` is a thin React host: mounts the engine once,
then forwards each prop with `useEngineEffect` (one line per binding) and pours everything in at once
via `applyAllToEngine` right after mount. `RoomScreen.tsx` composes room state
(`room/useRoomState.ts`), server events (`room/useRoomSignals.ts`), HTML-panel insets
(`room/useInsets.ts`) and auto-dealing (`room/useAutoDeal.ts`).

Everything the engine does that is NOT engine state lives in `client/src/game/engine/`, each with
tests next to it: `constants.ts` (texture size, palette, layer zIndexes), `cardTextures.ts`
(face/back/shadow factories), `faceTextureCache.ts` (cache + warm-up in batches), `fanGeometry.ts`,
`seatChrome.ts`/`seatPaint.ts` (rules vs. drawing for other players' seats),
`zoneChrome.ts`/`zonePaint.ts` (same split for drop zones), `collapseArrow.ts`, `scramble.ts`,
`idleGate.ts`, `shadowPass.ts` (ONE shadow pass for every layer — there used to be three competing
mechanisms), `shufflePose.ts`, `shout.ts`, `moveAnchor.ts` (where a card flies to/from by
`card_moved` label — pure), `boardPile.ts`, `clearPlayButton.ts`.

**Why not `@pixi/react`**: an earlier attempt on it crashed under React StrictMode (double mount on a
canvas whose WebGL context was already destroyed → "context lost"). The current engine creates a
fresh canvas on every `mount()` instead.

**The render loop sleeps when idle** (`wake()`/`sleep()`) — it only draws when something is actually
moving. The sleep condition is `canSleep()` in `engine/idleGate.ts`: it lists every active animation
explicitly as a typed field. Any new continuous animation must be added to `EngineActivity`, or it
either won't play (the loop falls asleep under it) or will keep the engine awake and burn CPU/GPU for
nothing.

**z-order inside a board pile ALWAYS goes through `RoomEngine.pileZ(pile, i)`**, never a bare index.
An open fan lives at `Z.boardFan` (3000+) and its shadow one layer below it, so any place that wrote
a plain `i` dropped the card to z≈0 — under its own shadow. That's how fan shadows broke after a
shuffle, a reorder, the scramble and the splash: each re-laid the cards out its own way, with its own
bare index. The base is read AT APPLY TIME, not frozen when an animation starts — the fan can be
collapsed mid-flight.

**Safety net**: `RoomEngine.test.ts` mounts it headless against a Pixi fake (`src/test/pixiFake.ts`,
`vi.mock("pixi.js")`) and checks structural invariants — one sprite per card, no duplicates, shuffle
reuses sprites, the loop sleeps and wakes, `destroy()` leaves nothing behind. Real Pixi can't run in
jsdom (no WebGL). Note the loop only ever sleeps on the "moderate" animation profile: on "full", idle
breathing keeps it awake by design.

**The deck and your own hand are the same thing with a different layout**, and both are
`engine/CardPile` — order plus sprites keyed by **card identity**, not array index, so
shuffles/reorders play back for real (each card flies from its old slot to its new one) instead of
teleporting. The only difference between the two piles is two callbacks: where card `i` rests, and
what to do with a freshly created sprite.

A frame reads as a table of contents: `stepPhysics` (substeps: scramble, splash, flights, shuffle,
springs) → `stepFanWiggle` → `stepDraggedCard` → `stepFlipAnim` → `stepOverlays` → `syncScene` →
`maybeSleep`. `mount` is likewise split into `buildLayers` / `buildOverlays` / `buildShadows` /
`buildHitAreas` / `bindStageEvents`.

**What a finger movement MEANS is a pure function**: `pressIntent` in `engine/gestureIntent.ts`
returns `wait | deal | collapse-hand | shuffle | glissando | grab`. That's where it's easiest to get
it wrong — e.g. read a slow drag as a swipe and shuffle the deck while the player is just looking at
the cards.

Game math is factored out of the engine into small pure modules in `client/src/game/*.ts`, each with
a matching `*.test.ts` — the engine just calls them and draws the result:
- `fan.ts` — fan-arc geometry (tilt, crowding, finger hit-testing, pinned-edge spread while dragging).
- `flip.ts` — flipping a card/deck as an actual 180°/540° rotation (not "collapse to zero" — that
  would leave the card mirrored), tilt during the gesture, rubber-band resistance on a disallowed swipe.
- `deckStack.ts` — stack layout (the front card sits higher and to the right, mimicking light from
  the upper right), shadow.
- `deckOrder.ts` — deck permutations: `moveCard`, `shuffleOrder`, `scatterCards`, `isPermutationOf`.
- `swipeShuffle.ts` — swipe detection via a sliding window of velocities (not the last two points —
  otherwise a jerk at the end of a slow drag would read as a swipe).
- `handRow.ts` / `handView.ts` — laying out a private hand as a "row", and visibility rules for other
  players' cards.
- `collapseButton.ts` — fitting the round "collapse" button into the pocket under the fan's arc (the
  radius is computed, not a constant — otherwise the button either overlapped the cards or floated in
  mid-air on other screen sizes).
- `dealing.ts`, `dragMode.ts`, `dropZones.ts`, `selection.ts`, `barActions.ts` — auto-deal queue,
  what can be dragged in which mode, drop zones, table-element selection, which two buttons the
  bottom bar shows.
- `deckFan.ts`, `topCard.ts`, `sortHand.ts`, `zoneLabels.ts`, `taunt.ts` — board-fan geometry, which
  card of a pile is on top, sorting one's own hand, and what a drop zone is CALLED at rest versus
  what it PROMISES mid-drag — the label follows what's in the player's fingers, not just the zone.

## The board: piles on the table

In dealing (`phase: "lobby"`) the table is not marked up at all: the deck lies in the centre and
`centerZone` IS the whole table. «ГОУ!» marks the board into boxes (`layout.ts`): `deckSlot` on the
left, `centerZone` in the middle, `discardSlot` on the right. A box that doesn't exist is `null`, and
`dropZones.ts` turns that into a zero-sized rect — so hit-testing and painting both drop it without a
special case.

- **`GameState.discard`** — cards played off the table. Always face up, the last element is the top
  card. `discard_card` puts one there from a hand, `take_discard` pulls one back out. `collect_hands`
  («Перераздача») returns both the discard and everyone's hands to the deck.
- **The discard rests as a HEAP, not a stack** (`discardHeap.ts`): cards overlapping at different
  angles, the freshly discarded one landing in the middle. A neat stack reads as a deck — as
  something you TAKE from — and in the discard's resting state you don't. The pattern is FIXED, not
  random: a random one would have to be stored and synchronised between players. Seven cards are
  drawn and no more — the silhouette stops changing after that. At rest the heap lies FACE DOWN —
  it's "played and put away", not a display case. That's a display rule, not state.
- **A board pile fans out on tap.** `BoardPile` (`engine/types.ts`) is which pile THIS viewer has
  open; it's local, unlike `GameState.deckFanned`. Any board fan opens at `layout.boardFanAnchor` —
  the centre of the play area — no matter which slot the pile sits in, so an open fan never hangs off
  the edge of the screen.
- **Every side element of the board shares one width** (`boardSlotWidth`): deck slot, discard slot
  and a side neighbour's seat read as one column glued to the screen edge. The reference is the deck
  — the only one whose size is dictated by its contents. The discard keeps that width while empty
  too: the box marks the table out, it doesn't report how full it is.
- **The play zone** (`GameState.play`) is the middle box in game: a LIST OF STACKS, everything face
  up. The server stores only what's in which stack — no geometry (`playGrid.ts` derives position from
  index). Rules in `server/src/playRules.ts`; the zone is COMMON — any player may put into and take
  from any stack. Turn order is a later layer on top.
  - An emptied stack disappears from the list, on both sides.
  - A stale stack index doesn't drop the action — the card lands as a new stack. It already left the
    hand visually, and bouncing it back with no explanation is worse.
  - In the engine the zone is the FOURTH `CardPile`, not N of them: stacks flatten to one order
    (`playFlat.ts`). That's what keeps sprites bound to card identity, so a card moving between
    stacks flies instead of teleporting.
  - Stacks are ordinary board piles named `play:N` (`engine/boardPile.ts`), so the whole board-fan
    mechanism came for free. A CLOSED stack also gives up its top card to a plain drag. The two
    gestures don't argue: move the finger and you drag the card, don't move it and you open the stack
    (the tap checks `dragHappened`).
  - What happens to the REST of a pile when a card is dragged off it depends on the pile of the
    GESTURE, not on "is the deck fanned". That used to read `!this.deckFanned`, so a drag out of the
    open discard quietly re-laid the DECK out as n−1.
  - A zone stack has its OWN geometry (`playStack.ts`): back cards peek out from under the front one,
    the stack never gets wider than 1.2 cards, and the BOTTOM card juts out into the bottom-right
    corner far enough for its corner index to read. The vertical spread is bigger than the horizontal
    one for exactly that reason. Grid cells are measured by the stack's FOOTPRINT, not by the card.
    Unlike deck and discard, a zone stack draws ALL of its cards.
  - While a card is dragged over the zone the table ANSWERS (`playHover.ts`): the stack under the
    finger lifts and grows, neighbours step aside. Highlighting a border wouldn't do — the dragged
    card covers the very stack it's aiming at. Hit-testing stays on the UNSHIFTED grid, so feedback
    can't make the target oscillate under a still finger.
  - The grid picks the column count that makes the card biggest. When space runs out: shrink to
    `PLAY_MIN_SCALE` first, and only then scroll. Room for the NEXT stack is always reserved.
- **Seating is a «П»** (`seatLayout.ts`): at most one neighbour per side (and always either two or
  none), everyone else goes into the scrolling top strip. Side neighbours do NOT narrow the table —
  on a phone that would squeeze the play area into a slit; instead the edge boxes yield.

## Networking: what's truth vs. just pretty

A hard split that must not blur when adding new deck-related mechanics:

1. **State is the source of truth.** Deck order and each card's facing (`GameState.deck`,
   `GameState.faceUp`) travel over the Colyseus schema. Heavy operations (shuffling, reordering) are
   computed by the client **itself**, which sends the finished result — the server only checks it's a
   permutation of the same card set (`isPermutationOf`). Deliberate, for instant feedback: waiting
   for an echo would stutter the animation on every round trip.
2. **`deck_fx` is decoration only.** A separate message bus for effects that do NOT change state. The
   server doesn't interpret it, just validates the shape and relays it.
3. **Revisions guard against stale echoes.** `GameState.deckRev` — only the dealer may write it. The
   client ignores incoming state older than what's already shown locally, otherwise its own delayed
   echo would roll the picture back. Same trick for one's own hand order (`set_hand_order`): as long
   as the hand's composition hasn't changed, the client keeps the order it sent and doesn't let an
   unrelated state patch repaint it back to the unsorted server order.

## Visibility rules and roles

- **Open/closed hand** (`Player.handOpen`) — per-player toggle: closed shows face-up to the owner,
  face-down to everyone else. Open shows it to everyone the way the owner sees it.
- **Hidden card** (`Player.handHidden`) — invisible to everyone but the owner, even when the hand is
  open.
- **Dealing is always on.** The deck lives in the centre face down: no card's rank is visible to
  anyone, including the dealer, until it ends up in someone's hand. Only the dealer touches the deck
  (shuffle, table fan, `deal_card`, auto-deal, `reset_deck`, `collect_hands`); the only way out is
  «ГОУ!», and «Перераздача» brings it back. There used to be a `dealMode` toggle and a whole
  second mechanic behind it (whole-deck drag, flips) — both are gone. Card-flip animation stayed:
  incoming `deck_fx` and server-side facing changes use it.
- **Free mode** (`GameState.freeMode`, off until the dealer presses «ГОУ!») — flips the room into
  `phase: "playing"` WITHOUT dealing the deck out: the deck stays in the centre face down, and every
  player pulls a card for themselves. `take_card` takes the top one by default but accepts a POSITION
  (the deck can be fanned locally and any card in the fan is grabbable); `take_all` empties the deck
  into one hand. The bottom bar shows these as the shouts «соснуть»/«сосать» — the only labels that
  fit a 375px phone without being cut (the label-shortening still measures characters while the
  button is measured in pixels, so a long label will get clipped again).
  Nobody may put a card into someone else's hand, the dealer included: `deal_card` answers
  `action_rejected` with `free_mode`. Two simultaneous pulls need no extra logic — Colyseus processes
  messages one at a time. The only way out is `collect_hands`.
- **Dealer vote weight is 1.01** (`DEALER_VOTE_WEIGHT` in `handRules.ts`), not 1.5: the dealer only
  decides tied votes, two regular players always outweigh them. The client must show the SAME weight
  (`client/src/game/voteWeight.ts`) — it used to display 1.5, so the banner disagreed with the
  actual outcome.
- **Card counts on other players' seats show only while DEALING.** In game the number of cards in a
  hand is game information, and putting it on the table as a figure decides for rules that don't
  exist yet. In game a seat shows what a real table shows — the hand itself (an empty seat loses its
  «—» too). The flag reaches the paint through `SeatPaintDeps.inGame` and
  `layoutSeatHand({ showCounter })`. Note `setFreeMode` has to repaint the seats for this.
- **Ready state gates dealing** — the server won't accept `deal_card` for a player with
  `isReady === false` (except the dealer, who is always ready). Intentional, though it diverges from
  the first task description.

## Known trade-offs (deliberate, not forgotten)

- `RoomEngine.ts` is still ~4700 lines, but no longer a wall: ~236 methods averaging 19 lines, the
  longest being `dropCard` (~150) and `beginCardDrag` (76). What keeps it big is ~120 private fields
  shared across gestures and animations — cutting it further means moving state out of the class
  (separate gesture and animation owners), a bigger change than anything done so far. A staged split
  plan (through composition, not method-moving) lives in `refactor-progress.md`.
- There are no game rules (tricks, trumps, win conditions) in the code — only the mechanics of owning
  and moving cards.
