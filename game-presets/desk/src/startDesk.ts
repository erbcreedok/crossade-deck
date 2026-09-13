// A DESK WITH A NETWORK BEHIND IT — the kit's `liveTable` scene, the room it talks to, and the
// people sitting round it. WHICH desk it is, it never asks: that is the spec's business.
//
// Everything in this file is true of every table game there will ever be on this shelf. Everything
// that was true of ONE of them — the card table's hand on the glass, its chairs, its heaps — is a
// `DeskLayer` the spec brings with it, and is why this file can be read without knowing what a card
// is. The rule is enforced by a scan (`guards.test.ts`), because it is the rule that decays first.

import {
  DEFAULT_TUNING,
  domTextMeasure,
  follow,
  holdThePage,
  installStockCarries,
  installStockFlips,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  paint,
  liveCameraHud,
  liveTable,
  setRev,
  watchPresence,
  withAvatars,
  type Avatars,
  type CameraHud,
  type CarryItem,
  type LiveClock,
  type LiveStage,
  type Mirror,
  type Node,
  type PresenceView,
  type Screen,
  type Transform,
  type Vec,
} from "game-kit";
import { pixiPainter } from "game-kit/pixi";
import { joinTable, roomRoster, type RoomMember, type RosterItem, type Table } from "@crossade/wire";
import { topHud, type TopHud, type TopHudMember, type TopHudPerson } from "@game-presets/tophud";
import { HOME_GLIDE_MS, limitsOfDesk, roomOfDesk } from "./camera.js";
import { curtain } from "./curtain.js";
import { farDots } from "./cursors.js";
import { deskAvatarsTransport, deskSeats, inkOf, SEAT_INKS, type DeskAvatarsTransport } from "./presence.js";
import { speaksForTable } from "./turn.js";
import type { DeskContext, DeskHost, DeskSpec, SeatedPerson, Teardown } from "./types.js";


export interface StartDeskOptions {
  readonly host: DeskHost;
  /** Who this device is. A table joined without one is joined as a guest. */
  readonly account?: { readonly id: string; readonly name: string; readonly recoveryHash: string } | undefined;
  /**
   * THE TABLE IS WORTH LOOKING AT NOW — the seat has arrived, the tree that was on the server is
   * standing, the furniture is up and the view is at this reader's own place.
   *
   * It is the same moment the cover comes off, and that is the point: a loading screen that lifted
   * any earlier would hand the player a table still being built, which is the "empty room with
   * nothing in it" they were being spared. Called once, and called on a join that FAILED too — a
   * screen that waits for a room that will never answer is the one failure worse than a bad table.
   */
  readonly onReady?: (() => void) | undefined;
}

/** Every desk on this shelf is played in the dark, and the strip over it resolves its inks there. */
const DESK_THEME = "dark";

/**
 * БУКВЫ, КОТОРЫЕ ЗА СТОЛОМ ТОЧНО ПОНАДОБЯТСЯ — имена людей. Кириллица названа прямо: служба шрифтов
 * отдаёт подмножества по кодовым точкам, и запрос без образца приносит одну латиницу, после чего
 * русское имя молча рисуется запасной гарнитурой.
 */
const DESK_TEXT_SAMPLE = "АЯаяЁё0123456789 абвгдеёжзийклмнопрстуфхцчшщъыьэюя";

function buildInitialDesk(spec: DeskSpec): Node {
  installStockSurfaces();
  installStockLayouts();
  installStockCarries();
  installStockFlips();
  return spec.map();
}

/**
 * STAND A DESK UP IN `container`, play `spec` on it, and talk to the room through `host`.
 *
 * The return value stops it completely — every listener, every clock, every element this call put
 * on the page. A hub empties its stage between games and the ELEMENT is never removed, so a desk
 * that leaked one listener would go on hearing the wire for every game played after it.
 */
export function startDesk(container: HTMLElement, spec: DeskSpec, o: StartDeskOptions): Teardown {
  installTheme(document, DESK_THEME);
  const stopHold = holdThePage();

  let unbindOnTree: (() => void) | undefined;
  let currentTable: Table | null = null;
  /** Whether the teardown has run. The join in flight is the one thing that outlives it. */
  let stopped = false;
  /**
   * WHICH SEAT THIS GLASS IS, once the server has said — `p1`/`p2`, never a game's own names: the
   * room is one server room for every game, and only the game itself cares which of the two it is.
   * Known only after `joinTable` resolves, which is AFTER the camera has usually already opened.
   */
  let seat: string | null = null;
  /**
   * WHICH OF THE DESK'S PLACES THIS GLASS SITS AT — the seat's own slot, and `0` until the room has
   * said. Only the fallback: once somebody is actually at the desk their ring is the answer, and a
   * ring can be dragged (`Avatars.placeOf`).
   */
  const seatIndex = (): number => {
    const n = Number(/^p(\d+)$/.exec(seat ?? "")?.[1]);
    return Number.isInteger(n) ? n - 1 : 0;
  };

  const places = spec.places(spec.seats);
  let initialRoot = buildInitialDesk(spec);

  // A THROW OR A PINCH NEEDS A CLOCK, and the kit's camera has none of its own (`guard.one-clock`):
  // the host's clock is joined while a fling is moving and left the moment it rests. The redraw
  // belongs to the desk itself, so the clock is handed nothing to draw — it only counts the frames.
  const hostClock = o.host.clock();
  const clock: LiveClock = (tick) => hostClock.join((_seconds, dt) => tick(dt));

  /**
   * The desk, once it exists — and it does not while it is being built. The wiring announces its
   * first tree write from INSIDE the call that returns it (a deck's handles are drawn before a frame
   * is), so a mirror reaching for the desk by name would be reading a binding not yet assigned.
   */
  let standing: ReturnType<typeof liveTable> | undefined;
  let leaveIdleClock: (() => void) | undefined;
  let avatars: Avatars | undefined;
  let peopleWire: DeskAvatarsTransport | undefined;
  /** THE SAME PEOPLE, WITH THE NAME THE ROOM CALLS THEM BY — what stands under a ring on the felt. */
  const sitting = (roster: readonly RosterItem[]): readonly SeatedPerson[] =>
    roster.flatMap((one) =>
      one.seat ? [{ seat: one.seat, name: one.name, ...(one.away === true ? { away: true } : {}) }] : [],
    );
  let stopWatching: (() => void) | undefined;
  let unbindOnRelay: (() => void) | undefined;
  let unbindOnRoster: (() => void) | undefined;
  let unbindOnDenied: (() => void) | undefined;
  let unbindOnCode: (() => void) | undefined;
  let unbindOnForked: (() => void) | undefined;
  /** Кто числится за столом — последний ответ комнаты: по нему панель находит место человека. */
  let roomPeople: readonly RoomMember[] = [];

  /**
   * A DISPOSABLE MARKER, watched by the kit's own `Avatars` for when to stop listening — `container`
   * is usually a persistent stage that is emptied between games but never removed from the document,
   * so a wiring told to watch it would never see it disconnect.
   */
  /** Одна линейка на стол: её ответы кешируются, поэтому перерисовка ничего не пересчитывает. */
  const ruler = domTextMeasure({
    waitFor: [{ font: { family: "'Press Start 2P'", size: 16, weight: 400 }, sample: DESK_TEXT_SAMPLE }],
  });

  const peopleWall = document.createElement("div");
  peopleWall.style.display = "none";
  container.appendChild(peopleWall);

  /**
   * THE STRIP ALONG THE TOP — the game's own, and it stands before the desk does.
   *
   * BEFORE, because the desk opens WHOLE under whatever is over it: the strip's height goes into
   * `seats.insets` a few dozen lines below, and a strip raised after the camera had been fitted
   * would leave the desk's far rim behind it for the life of the screen.
   *
   * The way out is the host's (`DeskHost.exit`) and standalone has none; the name is the spec's;
   * the people arrive with the roster. Nothing here is the runtime's own knowledge of a game.
   */
  const strip: TopHud = topHud(container, {
    title: spec.title,
    /**
     * НАЖАЛИ В ПАНЕЛИ — ПРОСИМ КОМНАТУ. Полоса не знает ни прав, ни комнаты: она рисует то, что ей
     * разрешили, и передаёт нажатие сюда. Ответ приходит либо новым ростером, либо отказом словами.
     */
    onDeed: (deed, whom, colour, value) => {
      // РУКА — ДЕЛО СТОЛА, ОСТАЛЬНОЕ — ДЕЛО КОМНАТЫ. Комнате незачем знать, как лежат карты, а
      // столу незачем раздавать права: каждый отвечает за своё, и просят их по-разному.
      if (deed.startsWith("piece:")) {
        const seat = roomPeople.find((one) => one.account === whom || one.name === whom)?.seat ?? null;
        return handDeed(deed, seat);
      }
      atTable?.sendDeed(deed, whom, colour, value);
    },
    ...(o.host.room() ? { room: o.host.room()! } : {}),
    ...(o.host.exit ? { exit: o.host.exit } : {}),
    ...(spec.topHud ? { look: spec.topHud } : {}),
  });
  /** WHO IS AT THE TABLE, in the ink the desk itself draws them in — one answer, one place. */
  const onStrip = (present: readonly SeatedPerson[]): readonly TopHudPerson[] => {
    const moving = spec.turn?.();
    return present.map((one) => ({
      seat: one.seat,
      name: one.name,
      // ТОТ ЖЕ ЦВЕТ, КАКИМ ЕГО РИСУЕТ САМ СТОЛ: цвет человека — его собственный, из профиля, и
      // только когда своего нет, его даёт место. Полоса — разметка, палитры у неё нет, поэтому
      // значение выдаётся уже разрешённым (`paint`).
      ink: paint(DESK_THEME, peopleWire?.inkOf(one.seat) ?? inkOf(one.seat)),
      ...(peopleWire?.faceOf(one.seat) ? { face: peopleWire.faceOf(one.seat)! } : {}),
      ...(one.away === true ? { away: true } : {}),
      ...(moving !== undefined && moving === one.seat ? { turn: true } : {}),
    }));
  };
  const sayWhoIsHere = (present: readonly SeatedPerson[]): void => strip.set({ people: onStrip(present) });

  /**
   * КТО ЧИСЛИТСЯ ЗА ЭТИМ СТОЛОМ — спрашивается у комнаты, а не у сессии.
   *
   * Лица на полосе — это те, кто сейчас играет; список за ней — вся комната: зритель без стула,
   * отошедший игрок, хозяин, которого сегодня не было. Сессия про них не знает и знать не может:
   * она живёт от первой посадки до последнего ухода, а роль и членство — сколько стоит стол.
   *
   * Не ответило — список остаётся при лицах сессии, как прежде. Стол от этого не перестаёт идти.
   */
  const askWhoBelongs = (): void => {
    const code = atTable?.code ?? o.host.room();
    if (!code) return;
    // ОТ СВОЕГО ЛИЦА: какие кнопки покажет панель, решает комната, и решает она про МЕНЯ.
    void roomRoster(code, o.account?.id).then((members) => {
      if (stopped) return;
      roomPeople = members;
      const table = members[0]?.table;
      // САМ СТОЛ И САМА КОМНАТА — ОДИНАКОВЫ В КАЖДОЙ СТРОКЕ: это ответ про спрашивающего, а не про
      // того, чья это строка, и потому берётся он из первой попавшейся.
      const settings = members[0]?.room;
      strip.set({
        roster: members.map(asMember),
        ...(table ? { table } : {}),
        ...(settings ? { settings } : {}),
      });

    });
  };

  /**
   * СОСТОЯНИЕ ЧУЖОЙ РУКИ — СПРАШИВАЕТСЯ У СЛОЯ, который эту руку рисует. Рантайм мебели не знает:
   * для него это три галочки, чьё значение ему безразлично (`desk.the-runtime-knows-no-game`).
   */
  const handOf = (seat: string | null): { lock?: boolean; pin?: boolean; hide?: boolean } | undefined => {
    if (!seat) return undefined;
    for (const layer of layers) {
      const state = layer.hand?.(seat);
      if (state) return state;
    }
    return undefined;
  };

  /**
   * ЛОК, ПИН И СКРЫТНОСТЬ ЧУЖОЙ РУКИ — ПИШУТСЯ В ДЕРЕВО, а не просятся у комнаты: рука это узлы
   * стола, и дерево само уходит всем. Право на это спросили заранее — панель рисует только то, что
   * комната разрешила.
   */
  const handDeed = (deed: string, seat: string | null): void => {
    if (!seat) return;
    const what = deed === "piece:lock" ? "lock" : deed === "piece:pin" ? "pin" : deed === "piece:hide" ? "hide" : undefined;
    if (!what) return;
    let done = false;
    for (const layer of layers) done = layer.handDeed?.(seat, what) === true || done;
    if (!done) return;
    deskWritten();
    askWhoBelongs();
  };

  const asMember = (one: RoomMember): TopHudMember => ({
    name: one.name,
    // ЦВЕТ ЧЕЛОВЕКА, А НЕ ЕГО МЕСТА: стула у зрителя нет, а кружок в списке есть у всех. Своего
    // цвета не завёл — кружок стоит приглушённым, а не чужим.
    ink: one.color ?? paint(DESK_THEME, "textMuted"),
    // ЕГО ЛИЦО, ЕСЛИ ОНО У НЕГО ЕСТЬ: фотография узнаётся быстрее буквы, а цвет при ней уходит в
    // ободок — потерять его нельзя, им человека и различают.
    ...(one.face ? { face: one.face } : {}),
    ...(one.account ? { account: one.account } : {}),
    ...(one.can ? { can: one.can } : {}),
    ...(handOf(one.seat) ? { hand: handOf(one.seat)! } : {}),
    ...(one.cant ? { cant: one.cant } : {}),
    role: one.role,
    // ДВЕ ОСИ: уровень говорит, что человеку можно, стул — играет он или смотрит. «Положен стул»
    // переживает партию, поэтому спрашивается он, а не только занятое сейчас место.
    seated: one.seated ?? one.seat !== null,
    ...(one.away === true ? { away: true } : {}),
    ...(o.account && one.account !== undefined && o.account.id === one.account ? { mine: true } : {}),
  });

  /**
   * СКАЗАТЬ КОМНАТЕ, ЧЕЙ ХОД — потому что метку «твой ход» рисует не этот стол, а СПИСОК комнат,
   * который человек открывает именно затем, чтобы увидеть, где его ждут. Череду считает игра
   * (`spec.turn`), комната её только запоминает.
   *
   * ГОВОРИТ ОДИН ЭКРАН ИЗ ВСЕХ — тот, что сидит на первом из занятых мест. Череду считает каждый, и
   * если бы говорили все, комната получала бы столько же одинаковых сообщений, сколько людей за
   * столом. Ушёл тот, кто говорил, — говорить начинает следующий, без уговора между ними.
   */
  let toldTurn: string | null | undefined;
  /** Комната, когда она уже ответила. До этого говорить некому. */
  let atTable: Table | undefined;
  const tellTurn = (present: readonly SeatedPerson[]): void => {
    if (!atTable || !seat) return;
    if (!speaksForTable(present, seat)) return;
    const moving = spec.turn?.() ?? null;
    if (moving === toldTurn) return;
    toldTurn = moving;
    atTable.sendTurn(moving ?? undefined);
  };

  /**
   * THE FAR SCREENS, ONE PER SEAT — this glass, wearing somebody else's name.
   *
   * `follow` keeps its own record of what it is already carrying ON the screen it is told about, so
   * two people carrying at once over one shared record would each release the other's run.
   */
  const farScreens = new Map<string, Screen>();
  const dots = farDots(container, inkOf);
  const farScreen = (from: string): Screen => {
    let one = farScreens.get(from);
    if (!one) {
      one = {
        seat: from,
        onCursor: (at: Vec | undefined, view: Transform | undefined) => dots.show(from, at, view),
      };
      farScreens.set(from, one);
    }
    one.scene = standing
      ? {
          host: standing.host,
          ...(standing.motions ? { motions: standing.motions } : {}),
          ...(standing.camera ? { camera: standing.camera } : {}),
        }
      : undefined;
    return one;
  };

  /** How high a mirrored hand holds what it is carrying — the same lift this desk's own carry uses. */
  const held = DEFAULT_TUNING.lift;

  /**
   * WHAT THIS SCREEN'S CAMERA IS WORTH AS A MESSAGE — `zoom` is SCREEN PIXELS PER UNIT and not the
   * camera's own factor, because one screen's etalon is not the other's (see `PresenceView`).
   */
  const viewNow = (): PresenceView | undefined => {
    const camera = standing?.camera;
    if (!camera) return undefined;
    return { target: camera.target, zoom: camera.pixelsPerUnit, rotation: camera.rotation, glass: camera.glass };
  };

  /**
   * THE DESK IS TOLD TO DRAW ITSELF AGAIN — `Avatars` writes discs, rings and hands straight into
   * the tree, and a write to the tree is not by itself a repaint.
   *
   * A PLAIN REPAINT, never `host.setRoot`: the tree object is already the one standing, so `setRoot`
   * would only tell the host to swap it for itself — but the host answers every swap by firing
   * `onChange`, which re-fits the camera and calls `onView`, which is the handler that calls this.
   * A screen open on its own felt, touched by nobody, span forever between the two.
   */
  const redraw = (): void => {
    standing?.motions?.redraw();
  };

  let hud: CameraHud | undefined;
  const layers = spec.layers ?? [];
  let mounted = false;
  /** The tallest thing any layer has laid along the foot of the glass — the controls clear it. */
  const floorOfLayers = (): number => Math.max(0, ...layers.map((layer) => layer.floor?.() ?? 0));

  const ctx: DeskContext = {
    get host() {
      return live.host;
    },
    root: () => live.host.root,
    camera: () => live.camera,
    motions: () => live.motions,
    seat: () => seat,
    hudRoot: () => hud?.root,
    // ЦВЕТ ЧЕЛОВЕКА, А НЕ ЕГО МЕСТА — один источник на сукно, кресла и полосу.
    ink: (one: string) => peopleWire?.inkOf(one) ?? inkOf(one),
    redraw,
    write: () => deskWritten(),
    avatars: () => avatars,
    hud: () => hud,
  };

  /**
   * A HAND THAT CHANGED SIZE without anybody having moved: a piece landing in one is a change to the
   * furniture alone, and the ring has to be re-measured against what is now in it — AND THE PICTURE
   * OF IT ON THE GLASS with it.
   */
  const deskChanged = (): void => {
    avatars?.settled();
    for (const layer of layers) layer.changed?.();
    hud?.fit();
    redraw();
  };
  /** MY OWN WRITE ON THE DESK outside a gesture — re-dressed here, and told to the room like a drop. */
  const deskWritten = (): void => {
    deskChanged();
    mirror.changed();
  };

  const mirror: Mirror<LiveStage> = {
    ready: () => {},
    changed: () => {
      if (currentTable && standing) currentTable.send(standing.host.root);
    },
    hand: (items, at, done, feel) => {
      currentTable?.sendRelay({ kind: "hand", items: items as unknown as CarryItem[], at, done, feel });
      if (seat) avatars?.handed(seat, items, at, done);
      for (const layer of layers) layer.carried?.(items, at, done, feel);
      redraw();
    },
  };

  /**
   * HOW THIS GAME IS PLAYED, read once — and then the two answers every SEATED desk owes on top of
   * it, whatever game it is.
   *
   * A ring is a person, not a piece: tapping your own takes you back to your place, and the bar over
   * your own hand is yours to press. Neither has anything to do with the game being played, so a
   * spec that answered them would be answering for the furniture — and a spec that did NOT, in the
   * days when the desk was one file, silently lost the ring: this is the seam that half-worked.
   */
  const play = spec.play(ctx);
  const gameTaps = play.taps;

  const live = liveTable<LiveStage>(container, initialRoot, {
    ...play,
    // A TAP ON ONE'S OWN RING TAKES THAT READER HOME. Anything else falls through to whatever the
    // game already does with a tap.
    taps: (piece: Node) => (gameTaps?.(piece) === true ? true : seat ? avatars?.tapped(seat, piece) === true : false),
    // THE BAR ABOVE ONE'S OWN HAND — shut, hide, turn over, pin — answered for the owner only; the
    // wiring tells the room the way it tells it a drop.
    //
    // WHERE MY OWN HAND IS DRAWN IS THIS SCREEN'S BUSINESS, not the desk's: the control that puts it
    // on the glass is answered here and never sent to the room, because nothing about the felt
    // changed. Everything else on the bar is a fact about the desk and goes to the people wiring.
    presses: (_meaning: unknown, control: Node) => (seat ? avatars?.pressed(seat, control) === true : false),
    // A PICTURE OF A PIECE ON THE GLASS IS A WAY OF REACHING THE PIECE: a finger landing on a layer's
    // own drawing takes the piece that lies under it on the felt.
    standIn: (n: Node) => {
      for (const layer of layers) {
        const stood = layer.standIn?.(n);
        if (stood) return stood;
      }
      return undefined;
    },
    painter: (view, size) => pixiPainter(view, size),
    // ЛИНЕЙКА ДЛЯ ПОДПИСЕЙ — без неё имена под лицами не рисуются вовсе: плашка есть, слов нет.
    // Ждём пиксельную гарнитуру и просим кириллический образец: шрифтовая служба режет гарнитуру на
    // подмножества по кодовым точкам, и запрос без образца приносит одну латиницу.
    measure: ruler,
    clock,
    mirror,
    limits: limitsOfDesk(spec, { width: container.clientWidth, height: container.clientHeight }),
    ...(spec.look ? { look: spec.look } : {}),
    // THE GLASS AS IT STANDS NOW, and not as it stood when the desk was built: the room is re-read on
    // every resize, and a phone turned on its side is a different glass with a different amount of
    // felt behind its seats. Read off the CONTAINER and not off the host, because the very first read
    // happens inside the call that is still building the host.
    room: () => roomOfDesk(spec, { width: container.clientWidth, height: container.clientHeight }),
    unit: spec.unit,
    // WHERE THE SEATS ARE, AND THAT AN UNTOUCHED VIEW COMES BACK TO MINE. It is what makes the ring
    // fill and the disc come off the felt (`isHome`), and it carries the TURN with it: the second
    // place faces 180°, so a screen sitting at it looks at the desk from the other side without
    // anybody turning a camera.
    seats: {
      places,
      mine: 0,
      placeNow: () => avatars?.placeOf(seat ?? "") ?? places[seatIndex()] ?? places[0]!,
      idleReturn: { glideMs: HOME_GLIDE_MS },
      ...(spec.home ? { homeSpan: spec.home.span, homeWidth: spec.home.width } : {}),
      // WHAT IS OVER THE TOP OF THIS REGION, so the desk opens WHOLE under it — the page's own
      // covers, and the strip this desk just raised over itself. MEASURED, notch and all: on a
      // phone the strip steps round the notch, and a height added up from the look would be short
      // by exactly that band.
      //
      // THE DEEPER OF THE TWO, never the sum: both are measured DOWN FROM THE SAME EDGE, and a page
      // whose own banner hangs below the strip has already counted the strip inside its answer.
      insets: { top: Math.max(o.host.insets().top, strip.height()) },
    },
    // WHERE SOMEBODY IS LOOKING IS PART OF THIS DESK, so a view that moved is news — it is what puts
    // the far reader's own disc where they are actually sitting, or takes it off the felt altogether.
    onView: () => {
      avatars?.publish();
      // A TWO-FINGER TILT CHANGES THE CAMERA WITHOUT TOUCHING THE BUTTON.
      hud?.fit();
      redraw();
    },
    onDeskChanged: () => deskChanged(),
  });
  standing = live;

  /**
   * THE DESK IS COVERED UNTIL IT KNOWS WHOSE SIDE IT IS SEEN FROM — raised once the seat has arrived
   * and the view has been taken home, and never before (`curtain.ts`).
   */
  let told = false;
  /** THE TABLE IS UP. The cover comes off and whoever was waiting is told, in that order, once. */
  const ready = (): void => {
    cover.raise();
    if (told) return;
    told = true;
    o.onReady?.();
  };
  const cover = curtain(container, o.host.cover);
  // THE CAMERA'S OWN TWO CONTROLS IN THE CORNER — the kit's, wired in one line. North is on every
  // desk; the place button appears because this desk names seats, and it asks for exactly what a tap
  // on one's own ring asks for, so the two can never take a reader to two different places.
  hud = liveCameraHud(live, { floor: floorOfLayers });

  /** The layers go up once — and only once the room has said whose screen this is. */
  const mountLayers = (): void => {
    if (mounted || !seat) return;
    mounted = true;
    for (const layer of layers) layer.mount(ctx);
    hud?.fit();
  };

  joinTable({
    game: spec.id,
    ...(o.host.room() ? { room: o.host.room()! } : {}),
    ...(o.account ? { account: o.account } : {}),
    seats: spec.seats,
  })
    .then((table) => {
      atTable = table;
      // A DESK THAT WAS STOPPED WHILE THE ROOM WAS STILL ANSWERING IS STOPPED.
      //
      // The join is the one thing here that outlives a teardown: everything else is a listener this
      // call can unbind, but a promise in flight comes back whatever happened in the meantime. It
      // used to come back and carry on — write the address, join the clock, bind the relay, publish
      // the people — against a desk with no canvas left.
      //
      // What that looked like: a player opened the card table, pressed back before the room had
      // answered, and the shelf they were now looking at silently had its address rewritten to
      // `#cards?room=…` a second later. The next reload dropped them into a game they had left.
      // And the room stayed joined, because nobody was left to leave it.
      if (stopped) {
        table.leave();
        return;
      }
      currentTable = table;
      seat = table.seat;
      // ОТКАЗ КОМНАТЫ ГОВОРИТСЯ ВСЛУХ, на той же строке, где нажали: молчание в ответ на кнопку
      // читается как поломка, и человек жмёт её ещё трижды.
      unbindOnDenied = table.onDenied(({ why }) => strip.denied(why));
      // КОД СМЕНИЛИ — СТОЛ ЗОВЁТСЯ ПО-НОВОМУ ВЕЗДЕ И СРАЗУ: в адресе, на полосе и в том, что
      // спросят у комнаты. Старый код уже ничей, и вернуться по нему было бы некуда.
      unbindOnCode = table.onCode((code) => {
        o.host.setRoom(code);
        strip.set({ room: code });
        askWhoBelongs();
      });
      // СДЕЛАЛ СВОЮ КОПИЮ — В НЕЁ И ИДЁШЬ. «Сделал свою и остался за чужим столом» — это не ответ
      // на «хочу быть хозяином», а вторая комната, о которой некому вспомнить.
      unbindOnForked = table.onForked((code) => {
        o.host.setRoom(code);
        location.reload();
      });
      // Комната ответила — можно спросить, кто за ней числится: до этого спрашивать было не у кого.
      askWhoBelongs();
      // THE DESK OPENS AT ITS OWN PLACE, and it opens there NOW: which seat this glass is only
      // arrives here, and until it did the view stood in the middle of the room looking at the desk
      // from nobody's side of it. IN ONE STEP, not eased: `avatars.publish()` runs synchronously a
      // few lines below and reads whatever the camera is worth AT THAT MOMENT (`isHome`), and a view
      // still easing home fails it — the ring stays empty and a stray disc is drawn instead.
      live.idle?.goHome();
      live.idle?.step(HOME_GLIDE_MS);
      mountLayers();
      live.motions?.redraw();
      // THE SAME CLOCK THE FLING BORROWS, joined for the whole life of the table rather than only
      // while something is moving: the idle countdown has to keep counting while the view is dead
      // still, which is exactly what the camera's own borrow never does.
      leaveIdleClock = hostClock.join((_seconds, dt) => {
        live.idle?.step(dt * 1000);
        // THE GLIDE MOVES THE CAMERA DIRECTLY, never through `wake`'s own repaint — that path only
        // runs while a fling is being stepped, and this join outlives every fling.
        live.motions?.redraw();
        // ...AND WHERE SOMEBODY IS LOOKING IS PART OF THIS DESK. `onView` is the FINGER's report and
        // the glide is not a finger: without this the view arrives home and the desk goes on drawing
        // this reader as having wandered off, disc and all.
        avatars?.publish();
        return false;
      });
      // WHOSE HAND DID WHAT, in a colour the desk actually has. The server names seats `p1`, `p2`…
      // and a mark is drawn in its actor's ink; asked for a paint called "p1" the painter threw, and
      // the throw happened inside `setRoot` — before the tree was ever sent, so the other player saw
      // nothing move. Own marks are not shown, and the far player's marks fade after a while.
      const inks = Object.fromEntries(SEAT_INKS.map((ink, i) => [`p${i + 1}`, ink]));
      live.host.setViewer({
        ...live.host.viewer(),
        marks: { inks, ttlMs: 5000, showOwn: false, ...(table.seat ? { me: table.seat } : {}) },
      });
      if (table.code) {
        o.host.setRoom(table.code);
        strip.set({ room: table.code });
      }

      let sRoot = table.root;
      if (sRoot.children.length === 0) {
        sRoot = initialRoot;
        setRev(sRoot, table.rev);
        table.send(sRoot);
      } else {
        initialRoot = sRoot;
        live.setRoot(sRoot, "net");
      }

      if (typeof window !== "undefined") {
        (window as any).__TABLE__ = { table, host: live.host };
      }

      unbindOnTree = table.onTree((newRoot) => {
        live.setRoot(newRoot, "net");
        // ХОД МЕНЯЕТСЯ ВМЕСТЕ С ДЕРЕВОМ, и больше ни от чего: череда — правило игры, а правила
        // читаются по столу.
        tellTurn(sitting(atTable!.roster));
        // THE PEOPLE GO BACK ON THE TREE THAT JUST ARRIVED. The discs travel with it — every screen
        // places the same set out of the same messages — but the tree that came in was written a
        // round trip ago, and the reader whose view moved since is standing where they were then.
        avatars?.publish();
        // ...AND A LAYER'S PICTURE IS A PICTURE OF THAT TREE: a card somebody else dealt into this
        // hand arrives as a revision and nowhere else, so this is where the strip hears of it.
        for (const layer of layers) layer.changed?.();
        hud?.fit();
        redraw();
      });

      // THE PEOPLE AT THIS DESK, once the room can be asked who they are. Their discs and their rings
      // are the kit's own (`withAvatars`); what differs is only where the answers come from — the
      // wire, and not a second pane in this document.
      peopleWire = deskAvatarsTransport({
        mine: () => seat,
        view: () => viewNow(),
        send: (msg) => table.sendRelay(msg),
        // ГДЕ ЧЕЙ СТУЛ — чтобы сидящего, от которого нет вестей, было куда поставить: спрашивается
        // у аватаров, потому что стул можно передвинуть, и тогда место уже не то, с которого начали.
        placeOf: (one) => avatars?.placeOf(one) ?? places[Number(/^p(\d+)$/.exec(one)?.[1] ?? 0) - 1],
      });
      avatars = withAvatars({
        desk: () => live.host.root,
        seats: deskSeats(spec.seats),
        transport: peopleWire.transport,
        places,
        ...(spec.handsRadius !== undefined ? { hands: spec.handsRadius } : {}),
        wall: peopleWall,
        // A TAP ON ONE'S OWN RING IS "TAKE ME BACK THERE" — the same glide the idle return runs, on
        // this screen's own tracker, asked for instead of fallen into.
        goHome: () => live.idle?.goHome(),
      });
      // ЦВЕТА ПРИЕЗЖАЮТ С РОСТЕРОМ, И ПРОЧИТАТЬ ЕГО НАДО ПЕРВЫМ: полоса и кресла спрашивают цвет
      // человека у этой же проводки, и покрашенные до неё встают в цвет места, а не человека.
      peopleWire.roster(table.roster);
      for (const layer of layers) layer.seated?.(sitting(table.roster));
      sayWhoIsHere(sitting(table.roster));
      tellTurn(sitting(table.roster));
      avatars.publish();
      // ...AND THE LAYERS, now that the furniture is standing: a picture drawn before there was
      // anything to draw is an empty foot of the screen for ever.
      mountLayers();
      for (const layer of layers) layer.changed?.();
      hud?.fit();
      redraw();

      unbindOnRoster = table.onRoster((roster) => {
        const present = sitting(roster);
        const gone = peopleWire?.roster(roster) ?? [];
        for (const layer of layers) layer.seated?.(present);
        sayWhoIsHere(present);
        // СОСТАВ ЗА СТОЛОМ СМЕНИЛСЯ — значит мог смениться и состав КОМНАТЫ: подсевший становится
        // её членом в ту же секунду. Роли при этом спрашиваются у комнаты, а не выводятся из того,
        // кто сейчас на связи.
        askWhoBelongs();
        // Ушёл тот, кто говорил за всех, — теперь говорит следующий: пересчитывается на каждом
        // ростере, поэтому уговора между экранами не нужно.
        tellTurn(present);
        for (const s of gone) avatars?.forget(s);
        avatars?.publish();
        redraw();
      });
      // A HIDDEN TAB IS NOBODY'S SCREEN — the one piece of state a browser will actually tell us.
      stopWatching = watchPresence(document, (state) => {
        peopleWire?.state(state);
        avatars?.publish();
        redraw();
      });

      // THE COVER COMES OFF ON A FRAME THAT IS ALREADY HOME — the view was taken to this screen's own
      // place above, the tree that arrived is standing, and the furniture is up.
      ready();

      unbindOnRelay = table.onRelay((msg) => {
        if (peopleWire?.heard(msg)) {
          redraw();
          return;
        }
        if (msg.kind !== "hand" || typeof msg.from !== "string") return;
        // A FAR HAND, DRAWN WITH THE SAME CALLS THE NEAR ONE MAKES — and with the same feel: told
        // only the anchor, this screen would slide a piece where the other one lifts and leans it.
        const { items, at, done, feel } = msg as unknown as {
          items: readonly CarryItem[];
          at: Vec | undefined;
          done: boolean;
          feel: Parameters<Mirror<LiveStage>["hand"]>[3];
        };
        follow(farScreen(msg.from), items ?? [], at, done === true, held, feel, msg.from);
      });
    })
    .catch((err) => {
      console.error("joinTable error:", err);
      // СТОЛ ЗАКРЫЛСЯ — ЭТО ОТВЕТ, А НЕ СБОЙ. Пустая копия закрывшегося стола врёт тому, кто пришёл
      // по старой ссылке: он видит стол, которого больше нет, и ждёт друзей, которых там не будет.
      const closed = err instanceof Error && err.message === "room_closed";
      // СНАЧАЛА СТОЛ ВСТАЁТ ДО КОНЦА, И ТОЛЬКО ПОТОМ О НЁМ СООБЩАЮТ. Тот, кто услышит, снесёт его
      // немедленно, а стол, снесённый посреди собственного подъёма, уносит с собой общий пул
      // художника — и страница под ним остаётся пустой.
      //
      // A DESK NOBODY COULD JOIN IS STILL SHOWN. The cover is there because the seat is not known
      // yet, and a join that failed is an answer too — held down, it would leave a player looking at
      // a blank rectangle with no way to tell it from a dead screen. Это же и есть причина поднять
      // стол ДО того, как о потере сообщат: услышавший снесёт его немедленно, а стол, снесённый
      // посреди собственного подъёма, уносит с собой общий пул художника — и страница под ним
      // остаётся пустой.
      ready();
      o.host.lost?.(closed ? "closed" : "offline");
    });

  return () => {
    stopped = true;
    unbindOnTree?.();
    unbindOnRelay?.();
    unbindOnRoster?.();
    unbindOnDenied?.();
    unbindOnCode?.();
    unbindOnForked?.();
    stopWatching?.();
    currentTable?.leave();
    leaveIdleClock?.();
    hostClock.stop();
    dots.stop();
    // THE COVER, NOT `ready()`: a desk being torn down has nothing to report. Whoever is waiting to
    // be told the table is up must not hear it from the teardown — they would lift a loading screen
    // onto a stage that is being emptied.
    cover.raise();
    // TELLS THE KIT'S OWN `Avatars` TO STOP LISTENING — see the marker's own comment above: without
    // this, a persistent stage never disconnects and the wiring goes on hearing the relay.
    peopleWall.remove();
    for (const layer of layers) layer.stop();
    strip.stop();
    hud?.stop();
    live.stop();
    stopHold();
  };
}
