import { describe, it, expect } from "vitest";
import { avatarId, byId, fieldsOf, installStockSurfaces, type Node, type PresenceView, type TransformableFields } from "game-kit";
import { chairId, handId, roundPlaces, ROUND_R } from "@game-presets/desks";
import { mapFor } from "./mapFor.js";
import { hubPeople, PRESENCE_EVERY_MS } from "./people.js";
import type { RelayMessage } from "../online/table.js";

installStockSurfaces();

const VIEW: PresenceView = { target: { x: 0, y: 0 }, zoom: 56, rotation: 0, glass: { w: 393, h: 800 } };

const ROSTER = [
  { seat: "p1", name: "Alice" },
  { seat: "p2", name: "Bob" },
];

function people(desk: Node, mine: string | null, clock: { ms: number }) {
  const sent: RelayMessage[] = [];
  let drawn = 0;
  const wiring = hubPeople({
    desk: () => desk,
    mine: () => mine,
    places: roundPlaces(2),
    view: () => VIEW,
    hands: ROUND_R,
    send: (msg) => sent.push(msg),
    draw: () => {
      drawn += 1;
    },
    now: () => clock.ms,
  });
  return { wiring, sent, drawn: () => drawn };
}

const at = (n: Node): { x: number; y: number } =>
  fieldsOf<TransformableFields>(n, "Transformable")?.at ?? { x: 0, y: 0 };

describe("hubPeople: the people at the hub's desk", () => {
  it("the roster puts a disc on the felt for every seat that is here", () => {
    const desk = mapFor("cards");
    const clock = { ms: 0 };
    const { wiring } = people(desk, "p1", clock);

    wiring.roster(ROSTER);
    // Only mine so far: nobody else has said where they are looking from yet.
    expect(byId(desk, avatarId("p1"))).toBeDefined();
    expect(byId(desk, avatarId("p2"))).toBeUndefined();

    wiring.heard({ kind: "presence", from: "p2", view: VIEW, pin: { mode: "desk", at: { x: 0, y: -4 }, leash: "chase" }, state: "online", holding: false, shut: false });
    expect(byId(desk, avatarId("p2"))).toBeDefined();
  });

  it("a seat that left the room loses its disc", () => {
    const desk = mapFor("cards");
    const clock = { ms: 0 };
    const { wiring } = people(desk, "p1", clock);

    wiring.roster(ROSTER);
    wiring.heard({ kind: "presence", from: "p2", view: VIEW, pin: { mode: "desk", at: { x: 0, y: -4 }, leash: "chase" }, state: "online", holding: false, shut: false });
    expect(byId(desk, avatarId("p2"))).toBeDefined();

    wiring.roster([ROSTER[0]!]);
    expect(byId(desk, avatarId("p2"))).toBeUndefined();
  });

  it("my own view goes on the wire no oftener than the throttle, and a state change does not wait", () => {
    const desk = mapFor("cards");
    const clock = { ms: 1000 };
    const { wiring, sent } = people(desk, "p1", clock);

    wiring.roster(ROSTER);
    expect(sent.filter((m) => m.kind === "presence")).toHaveLength(1);

    // Nothing about me is different — an unchanged view is not news at any interval.
    wiring.publish();
    expect(sent).toHaveLength(1);

    // ...and a change inside the throttle window waits.
    wiring.state("away");
    clock.ms += 1;
    wiring.publish();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.state).toBe("away");

    wiring.state("online");
    expect(sent).toHaveLength(3);
    expect(clock.ms).toBeLessThan(1000 + PRESENCE_EVERY_MS);
  });

  it("a seat's own hand stands beside its own place", () => {
    const desk = mapFor("cards");
    const clock = { ms: 0 };
    const { wiring } = people(desk, "p1", clock);

    wiring.roster(ROSTER);
    expect(byId(desk, handId("p1"))).toBeDefined();
    expect(byId(desk, avatarId("p1"))).toBeDefined();
    expect(byId(desk, chairId("p1"))).toBeDefined();
  });

  it("moving my own chair moves my place, my hand and the message about me", () => {
    // THE ANCHOR IS THE CHAIR. A hand fastened to the disc would slide about under the cards in it
    // every time its owner looked somewhere else, and the far screen would draw it somewhere else
    // again — so the place goes on the wire and both screens stand the ring by the same number.
    const desk = mapFor("cards");
    const clock = { ms: 0 };
    const { wiring, sent } = people(desk, "p1", clock);
    wiring.roster(ROSTER);
    const wasHand = at(byId(desk, handId("p1"))!);
    const wasPlace = wiring.placeOf("p1")!;

    clock.ms += 1000;
    wiring.handed([{ id: chairId("p1") }] as never, { x: 1.5, y: -2 }, true);
    expect(wiring.placeOf("p1")?.at).toEqual({ x: 1.5, y: -2 });
    // The facing is untouched: dragging a chair moves a seat, it does not turn it round.
    expect(wiring.placeOf("p1")?.facing).toBe(wasPlace.facing);
    expect(at(byId(desk, chairId("p1"))!)).toEqual({ x: 1.5, y: -2 });
    expect(at(byId(desk, handId("p1"))!)).not.toEqual(wasHand);
    expect((sent[sent.length - 1] as { place?: { at: unknown } }).place?.at).toEqual({ x: 1.5, y: -2 });
  });

  it("a far seat that moved its chair moves it on this screen too", () => {
    const desk = mapFor("cards");
    const clock = { ms: 0 };
    const { wiring } = people(desk, "p1", clock);
    wiring.roster(ROSTER);
    const wasHand = at(byId(desk, handId("p2"))!);
    wiring.heard({
      kind: "presence",
      from: "p2",
      view: VIEW,
      pin: { mode: "screen", at: { x: 0.5, y: 0.5 } },
      state: "online",
      holding: false,
      shut: false,
      place: { at: { x: -3, y: 1 }, facing: 180 },
    });
    expect(wiring.placeOf("p2")?.at).toEqual({ x: -3, y: 1 });
    expect(at(byId(desk, chairId("p2"))!)).toEqual({ x: -3, y: 1 });
    expect(at(byId(desk, handId("p2"))!)).not.toEqual(wasHand);
  });

  it("a tap on my own chair turns my own lock and tells the room; a tap on anything else is not mine", () => {
    const desk = mapFor("cards");
    const clock = { ms: 0 };
    const { wiring, sent } = people(desk, "p1", clock);

    wiring.roster(ROSTER);
    expect(wiring.tapped(byId(desk, chairId("p1"))!)).toBe(true);
    expect(sent[sent.length - 1]?.shut).toBe(true);

    // NOT ON THE DISC. Nothing a finger does reaches it at all — it is a reading of a camera.
    expect(wiring.tapped(byId(desk, avatarId("p1"))!)).toBe(false);
    expect(wiring.tapped(byId(desk, handId("p1"))!)).toBe(false);
  });

  it("a message that is not a presence is not this wiring's", () => {
    const desk = mapFor("cards");
    const clock = { ms: 0 };
    const { wiring } = people(desk, "p1", clock);
    expect(wiring.heard({ kind: "hand", from: "p2" })).toBe(false);
  });
});
