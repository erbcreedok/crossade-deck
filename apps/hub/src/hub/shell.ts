// THE HUB ITSELF — a host, a painter, and two trees it swaps between. No HTML interface anywhere:
// the title, the tiles, the shadows, the press and the way back are all ordinary nodes.
//
// THE HUB'S CANVAS IS NEVER TORN DOWN. It is created once per page load and kept; moving between
// the shelf and a running game is `setRoot`, which is exactly what `setRoot` exists for. Tearing it
// down instead would drop a WebGL context (a browser gives out about a dozen) and, worse, would
// leave the way back with nowhere to be drawn, since the hub has no HTML to fall back on.
//
// The game gets its OWN host in its own region. That keeps the seam at `(container) => teardown` —
// the shape an iframe or a separate page would also take — and keeps two sets of pointer listeners
// off one canvas, which is a bug the kit's own devtools keep a WeakMap to avoid.

import {
  attachPainter,
  byId,
  Coated,
  compose,
  DEFAULT_VIEWER,
  installStockCoats,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  mount,
  NO_COAT,
  Transformable,
  type Host,
} from "game-kit";
import { pixiPainter } from "game-kit/pixi";
import { hubRuler } from "@crossade/look";
import { installHubLook } from "@crossade/look";
import { CLUB_U, loadingCards, PALETTE, SPARK_U } from "@crossade/look";
import { beat } from "./beat.js";
import { AT_REST, DRIFT_DIAMONDS, driftStep, type Drift } from "./drift.js";
import { barTree, FELT, hubTree, shelfColumns, shelfSize, SPARKLE_ID } from "./grid.js";
import { wirePress } from "./press.js";
import { twinkleLevel, twinkleStep } from "./twinkle.js";
import { CATALOGUE, type Teardown } from "./catalogue.js";
import { goTo, onRoute, routeOf } from "./route.js";
import { ensureAccount } from "@crossade/wire";

/**
 * The shelf's own size, plus the title above it and a margin round the lot. Not one number any
 * more: four tiles abreast on a wide glass, two by two on a phone held upright (`shelfColumns`),
 * and the fit follows whichever the glass gets.
 */
function fitUnit(v: { width: number; height: number }): number {
  const shelf = shelfSize(shelfColumns(v));
  return Math.max(16, Math.min(v.width / (shelf.w + 0.6), v.height / (shelf.h + 3.2)));
}

/** The strip the hub keeps for itself while a game runs, in CSS pixels — matches the stylesheet. */
const STRIP_PX = 56;

/** A dynamic import has no bytes-so-far to report, so the bar sweeps rather than reports. */
const SWEEP_MS = 900;
/** A warm cache would otherwise show a single frame of gold, which reads as a glitch. */
const MIN_BUSY_MS = 250;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function startHub(chrome: HTMLElement, stage: HTMLElement): () => void {
  void ensureAccount();
  // The theme is installed for exactly one reason, worth naming: every colour the hub draws is a
  // literal from `palette.ts`, so a palette switch changes nothing here — EXCEPT the ink of a cast
  // shadow, which the plan resolves from the `shadow` token. Dark gives black, which is what a hard
  // offset drop wants.
  installTheme(document, DEFAULT_VIEWER.theme);
  installStockLayouts();
  installStockSurfaces();
  installStockCoats();
  installHubLook();

  const shell = chrome.parentElement;
  // THE MOTION SWITCH, read from the system at boot and nowhere else after that. `motionSpeed` is
  // the kit's own knob — `0` is no animation at all — so a settings screen has a lever already and
  // needs to invent nothing: `host.setViewer({ ...host.viewer(), motionSpeed })`. The drift below
  // watches it, and at zero it does not merely stand still, it leaves the clock.
  const settled = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const host: Host = mount(chrome, hubTree(shelfColumns(chrome.getBoundingClientRect())), { ...DEFAULT_VIEWER, hudUnit: 64, motionSpeed: settled ? 0 : 1 });
  const first = host.viewport();
  const painter = pixiPainter(host.view, { width: first.width, height: first.height, resolution: first.dpr });
  const ruler = hubRuler();
  // ATTACHED ONLY AFTER THE ROUTE IS KNOWN (below): `attachPainter` paints `host.root` the instant
  // it is called, and at this point `host.root` is still the placeholder passed to `mount` above.
  // A table opened by hash or by `startapp` must never have that placeholder — the lobby — be the
  // first thing painted, so the mode is set from the route BEFORE this fires.
  let stopPainting: () => void;

  let playing = false;
  let running: Teardown | undefined;
  /** WHICH game is running, so a route naming a different one can be told from one naming this one. */
  let runningId: string | undefined;
  let busy = false;
  let alive = true;
  /**
   * WHICH OPENING IS THE CURRENT ONE. A game is fetched before it is mounted, and in that gap the
   * player can press Back, press another tile, or follow a link — so by the time a chunk lands, the
   * place it was fetched for may no longer be where anybody is. Every opening takes a number; a
   * chunk whose number is stale is dropped rather than mounted over whatever is there now.
   */
  let opening = 0;

  // THE HUB'S ONE CLOCK. Everything that moves joins it and nothing else asks for a frame; the
  // redraw is the loop's, once per frame, however many writers there were. See `beat.ts`.
  const clock = beat(() => host.setRoot(host.root));

  // WHERE THE FELT HAS CRAWLED TO, kept out here rather than inside the tick, because the tree is
  // thrown away and rebuilt on every `setMode` and the pattern must not jump back to the corner
  // when a game opens.
  let felt: Drift = AT_REST;

  const drift = (_seconds: number, dt: number): boolean => {
    const next = driftStep(felt, dt, host.viewer().motionSpeed ?? 1);
    if (next === felt) return false;
    felt = next;
    const ground = byId(host.root, FELT);
    if (!ground) return false;
    // In UNITS: the drift counts tiles, and a tile is `CLUB_U` of them. Written straight onto the
    // ground's own pose — the felt is a node, so moving the pattern is moving a node.
    compose(ground, Transformable({ at: { x: felt.x * CLUB_U, y: felt.y * CLUB_U } }));
    return true;
  };

  // WHERE THE SPARKLE HAS CRAWLED TO — client1's `drift-diamonds`, kept out here for the same
  // reason `felt` is: the tree is rebuilt on every `setMode` and the scatter must not jump back to
  // the corner each time.
  let sparkleDrift: Drift = AT_REST;
  const driftSparkle = (_seconds: number, dt: number): boolean => {
    const next = driftStep(sparkleDrift, dt, host.viewer().motionSpeed ?? 1, DRIFT_DIAMONDS);
    if (next === sparkleDrift) return false;
    sparkleDrift = next;
    const layer = byId(host.root, SPARKLE_ID);
    if (!layer) return false;
    compose(layer, Transformable({ at: { x: sparkleDrift.x * SPARK_U, y: sparkleDrift.y * SPARK_U } }));
    return true;
  };

  // WHERE THE SHIMMER HAS GOT TO — kept out here for the same reason `felt` is: the tree is
  // rebuilt on every `setMode` and the sparkle must not flash back to full brightness each time.
  let sparklePhase = 0;
  const writeSparkle = (): void => {
    const layer = byId(host.root, SPARKLE_ID);
    if (!layer) return;
    compose(layer, Coated({ self: { recipe: "wash", level: twinkleLevel(sparklePhase), tint: PALETTE.felt }, cast: NO_COAT }));
  };
  const twinkle = (_seconds: number, dt: number): boolean => {
    const next = twinkleStep(sparklePhase, dt, host.viewer().motionSpeed ?? 1);
    if (next === sparklePhase) return false;
    sparklePhase = next;
    writeSparkle();
    return true;
  };

  // Joined and dropped with the switch rather than left running and told to do nothing: at
  // `motionSpeed: 0` the hub asks for no frames at all, which is what "power saving" has to mean.
  let stopDrift: (() => void) | undefined;
  let stopSparkleDrift: (() => void) | undefined;
  let stopTwinkle: (() => void) | undefined;
  const followMotion = (): void => {
    const wanted = (host.viewer().motionSpeed ?? 1) > 0;
    if (wanted === (stopDrift !== undefined)) return;
    if (wanted) {
      stopDrift = clock.join(drift);
      stopSparkleDrift = clock.join(driftSparkle);
      stopTwinkle = clock.join(twinkle);
    } else {
      stopDrift?.();
      stopDrift = undefined;
      stopSparkleDrift?.();
      stopSparkleDrift = undefined;
      stopTwinkle?.();
      stopTwinkle = undefined;
    }
  };

  let lastUnit = -1;
  let lastColumns = -1;
  const applyFit = (): void => {
    const v = host.viewport();
    // TURNED OVER: a phone rotated is a different shelf, not the same one smaller.
    const columns = shelfColumns(v);
    if (columns !== lastColumns && !playing) {
      lastColumns = columns;
      host.setRoot(hubTree(columns));
    }
    const u = fitUnit(v);
    if (u === lastUnit) return;
    lastUnit = u;
    host.setViewer({ ...host.viewer(), hudUnit: u });
  };
  const stopFitting = host.onChange(() => {
    applyFit();
    followMotion();
  });

  const setMode = (mode: "hub" | "play"): void => {
    playing = mode === "play";
    shell?.setAttribute("data-mode", mode);
    // The bar sits in the strip at the top of a full-height canvas: half the viewport up, then
    // half the strip back down, in units.
    const v = host.viewport();
    const unit = host.unit();
    const topY = (STRIP_PX / 2 - v.height / 2) / unit;
    // Three quarters of the ribbon, so the plate has air above and below it.
    host.setRoot(playing ? barTree({ topY, height: (STRIP_PX * 0.75) / unit }) : hubTree(shelfColumns(host.viewport())));
    // The tree is new and its felt starts in the corner; the pattern is not new. Put it back where
    // it had crawled to, or opening a game would snap the weave and closing it would snap it again.
    const ground = byId(host.root, FELT);
    if (ground) compose(ground, Transformable({ at: { x: felt.x * CLUB_U, y: felt.y * CLUB_U } }));
    // Same reasoning, for the sparkle's own crawl: a fresh tree's scatter starts in the corner,
    // and `drift-diamonds` is not new either.
    const sparkleLayer = byId(host.root, SPARKLE_ID);
    if (sparkleLayer) compose(sparkleLayer, Transformable({ at: { x: sparkleDrift.x * SPARK_U, y: sparkleDrift.y * SPARK_U } }));
    // Same reasoning again, for the sparkle's shimmer rather than its crawl: a fresh tree's sparkle
    // starts at full brightness, and the shimmer is not new.
    writeSparkle();
    lastUnit = -1;
    applyFit();
  };

  /**
   * The tile fills with gold while its game is fetched. `fill` is the only stock coat whose mark is
   * a CUT rather than a fade — a half-drawn thing rather than a half-faded one — which is what a
   * progress bar is. The sweep is cancelled in a `finally`, never in a `then`: a failed import must
   * not leave a frame loop running for the rest of the session.
   *
   * It rides the same clock as the drift. Two loops would each redraw the other's frame, and the
   * gold would flicker against the felt for a reason nobody could see in either file.
   */
  const sweep = (faceId: string): (() => void) => {
    const leave = clock.join((seconds) => {
      const face = byId(host.root, faceId);
      if (!face || !alive) return false;
      const level = ((seconds * 1000) % SWEEP_MS) / SWEEP_MS;
      compose(face, Coated({ self: { recipe: "fill", level, tint: PALETTE.gold }, cast: NO_COAT }));
      return true;
    });
    return () => {
      leave();
      const face = byId(host.root, faceId);
      if (face) compose(face, Coated({ self: NO_COAT, cast: NO_COAT }));
    };
  };

  /**
   * OPEN A GAME. The address is the place, and this is the only thing that puts one on the stage.
   *
   * ALREADY THERE IS NOT A MOVE: a route naming the game that is already running — a reload, a
   * `replaceState` from the game itself naming its room — must leave it alone. Restarting it there
   * would throw away the table the player is sitting at and join a new room in its place.
   *
   * ANOTHER GAME IS A SWAP, NOT A DETOUR THROUGH THE SHELF: a link to `#chess` followed while the
   * card table is up takes the card table down and stands the board up, and the shelf never flashes
   * between the two. The old game is let go WITHOUT writing the address — the address already says
   * where we are going, and a write here would fight the one that sent us.
   */
  const enter = async (id: string, write = true): Promise<void> => {
    const entry = CATALOGUE.find((g) => g.id === id);
    if (!entry || busy) return;
    if (running && runningId === id) return;
    const mine = ++opening;
    busy = true;
    const stopSweep = sweep(`tile/${entry.id}/face`);
    // THE WAIT STARTS NOW, AND SO DOES THE SCREEN THAT SAYS SO. The chunk has not been asked for
    // yet; the room and the tree come after it. From the player's side that is one wait — so it gets
    // one screen, even though two things put it there: this one covers the DOWNLOAD, and the game
    // puts up its own the moment it is handed the stage, covering the room and the tree.
    //
    // The handover is invisible because the two are the same screen: the game's goes on top, and
    // this one is taken away underneath it once `start` has returned.
    //
    // Over the stage rather than the whole page: the strip with the way back stays live, so a player
    // who changed their mind during a slow fetch is not trapped looking at a wait.
    setMode("play");
    // THE OLD GAME GOES DOWN FIRST, and the screen goes up in its place. Kept alive behind the
    // screen it would be a table nobody can see holding a socket open for the whole of a fetch —
    // the reason to keep it (not showing an empty stage) is exactly what the screen is for.
    if (running) leave(false, "play");
    const loading = loadingCards(stage, entry.label);
    try {
      const [start] = await Promise.all([entry.load(), sleep(MIN_BUSY_MS)]);
      // WHERE THE PLAYER IS NOW, not where they were when this was asked for. A chunk is fetched
      // over a phone's network; Back, another tile and a pasted link all happen inside that wait.
      if (!alive || mine !== opening) {
        loading.done();
        return;
      }
      stopSweep();
      // The address first, the game second: a table reads WHICH game it is from the hash, so a
      // press that started the game before naming it would open every tile as cards.
      if (write) goTo(id);
      running = start(stage);
      runningId = id;
      // THE GAME IS HOLDING ITS OWN SCREEN NOW (or has nothing to wait for). This one has served its
      // purpose — the download — and goes away under whatever the game put on top of it.
      loading.done();
    } catch (err) {
      // A blip, or a game that will not parse. Without this the hub sits in a dead screen with a
      // spinning tile and no way out — the one failure a launcher must not have.
      //
      // ...BUT IT SAYS WHY. Swallowed without a word, this catch turns "the game did not open" into
      // a shelf that simply bounced back, and the reason — a missing export, a throw on the way up —
      // is nowhere on the screen or in the console. Recovering from a failure is not the same as
      // hiding it.
      console.error(`hub: ${id} did not open`, err);
      stopSweep();
      setMode("hub");
      if (write) goTo(undefined, "replace");
    } finally {
      busy = false;
    }
  };

  /**
   * PUT THE RUNNING GAME DOWN. `into` is where the shell is going: back to the shelf, or straight
   * into another game — in which case the strip stays as it is and only the stage is emptied, so
   * swapping games never shows a frame of the shelf between them.
   */
  const leave = (write = true, into: "hub" | "play" = "hub"): void => {
    if (!running) return;
    running();
    running = undefined;
    runningId = undefined;
    // Belt and braces: `host.unmount()` inside the game already removes its view, but a teardown
    // that threw halfway must not leave an orphan canvas holding a context.
    stage.replaceChildren();
    if (into === "hub") setMode("hub");
    if (write) goTo(undefined);
  };

  /**
   * LEAVING IS ALSO AN OPENING THAT MUST NOT LAND. A player who presses Back while a game is still
   * being fetched has gone to the shelf, and the chunk that arrives a second later belongs to a
   * place nobody is at any more.
   */
  const goToShelf = (write = true): void => {
    opening += 1;
    leave(write);
    if (!running) setMode("hub");
  };

  const stopPress = wirePress({
    host,
    onPress: (meaning) => {
      if (meaning["nav"] === "back") goToShelf();
      else if (typeof meaning["game"] === "string") void enter(meaning["game"]);
    },
  });

  // THE URL IS THE PLACE, READ BEFORE THE FIRST PAINT. A reload lands back in the game the player
  // was in, and the browser's own Back leaves it — which is the gesture a phone user reaches for
  // before finding any button. Restoring writes nothing: the address is already right, and writing
  // it again would push a second identical entry onto the history for every reload.
  //
  // Read here, before `attachPainter` below, so a table named by the hash (or by Telegram's
  // `startapp`, resolved to the route in `main.ts` before this runs) never has the lobby as its
  // first painted frame: the mode is set from the route, THEN the painter is attached to it.
  const opened = routeOf();
  setMode(opened ? "play" : "hub");
  stopPainting = attachPainter(host, painter, { measure: ruler });
  followMotion();

  if (opened) void enter(opened, false);

  /**
   * THE ADDRESS MOVED — Back, Forward, or a link followed into a page that is already open. One
   * reading of it, and the same three answers whichever of those it was:
   *
   * a game that is not the one running → open it (a swap, if something is up);
   * no game → the shelf;
   * the game already running → NOTHING. This is the case that has to be spelt out: the desk itself
   * writes its room into the address the moment the server names it (`hubHost.setRoom`), and a
   * router that treated its own game's `replaceState` as news would tear the table down and rejoin
   * a new room every time a player sat at one.
   *
   * `write` is false throughout: the address is already what it is, and writing it back would push
   * a second identical entry for every Back the player presses.
   */
  const stopRouting = onRoute((id) => {
    if (id) {
      if (id !== runningId) void enter(id, false);
    } else if (running || busy) {
      goToShelf(false);
    }
  });

  // The faces are not measurable until they arrive, and a caption laid out against the fallback
  // stays that way. So the first frame drawn with real metrics is asked for here, once the ruler
  // says it has them.
  void ruler.ready.then(() => {
    if (alive) host.setRoot(host.root);
  });

  return () => {
    alive = false;
    leave(false);
    clock.stop();
    stopRouting();
    stopPress();
    stopFitting();
    stopPainting();
    painter.destroy();
    host.unmount();
  };
}
