import { describe, it, expect } from "vitest";
import { avatarId, byId, installStockSurfaces, type Node, type PresenceView } from "game-kit";
import { handId, roundPlaces, ROUND_R } from "@game-presets/desks";
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

  it("a seat's own hand stands beside its own disc", () => {
    const desk = mapFor("cards");
    const clock = { ms: 0 };
    const { wiring } = people(desk, "p1", clock);

    wiring.roster(ROSTER);
    const hand = byId(desk, handId("p1"));
    const avatar = byId(desk, avatarId("p1"));
    expect(hand).toBeDefined();
    expect(avatar).toBeDefined();
  });

  it("a tap on my own disc turns my own lock and tells the room; a tap on anything else is not mine", () => {
    const desk = mapFor("cards");
    const clock = { ms: 0 };
    const { wiring, sent } = people(desk, "p1", clock);

    wiring.roster(ROSTER);
    const mine = byId(desk, avatarId("p1"))!;
    expect(wiring.tapped(mine)).toBe(true);
    expect(sent[sent.length - 1]?.shut).toBe(true);

    const other = byId(desk, handId("p1"))!;
    expect(wiring.tapped(other)).toBe(false);
  });

  it("a message that is not a presence is not this wiring's", () => {
    const desk = mapFor("cards");
    const clock = { ms: 0 };
    const { wiring } = people(desk, "p1", clock);
    expect(wiring.heard({ kind: "hand", from: "p2" })).toBe(false);
  });
});
