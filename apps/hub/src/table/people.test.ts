// THE HUB'S OWN TRANSPORT — what only the hub knows: a seat, a camera and a relay, in place of the
// catalog's own local screens. Everything downstream of a `Presence[]` (placing discs, dressing
// rings, idle-return, taps) is the kit's own `withAvatars` and is checked there
// (`game-kit/src/render/avatars.test.ts`); this file checks only that `hubAvatarsTransport` turns a
// seat and a relay into the four things an `AvatarsTransport` promises — `mine`, `say`, `hear`, plus
// the hub's own `roster`/`heard`/`state` that feed it.

import { describe, it, expect } from "vitest";
import type { Presence, PresenceView } from "game-kit";
import { hubAvatarsTransport, inkOf, PRESENCE_EVERY_MS } from "./people.js";
import type { RelayMessage } from "../online/table.js";

const VIEW: PresenceView = { target: { x: 0, y: 0 }, zoom: 56, rotation: 0, glass: { w: 393, h: 800 } };

const ROSTER = [
  { seat: "p1", name: "Alice" },
  { seat: "p2", name: "Bob" },
];

function build(mine: string | null, clock: { ms: number }) {
  const sent: RelayMessage[] = [];
  const wiring = hubAvatarsTransport({
    mine: () => mine,
    view: () => VIEW,
    send: (msg) => sent.push(msg),
    now: () => clock.ms,
  });
  return { wiring, sent };
}

describe("inkOf: a seat's colour is the seat's own, never a roster's order", () => {
  it("reads the seat's own number, not its position in whatever list happened to be asked", () => {
    // `p2` seen alone (the picture on `p2`'s own screen the instant it opens, before `p1` is in its
    // local roster) must still be `p2`'s ink and not `p1`'s.
    expect(inkOf("p2")).toBe("alert");
    expect(inkOf("p1")).toBe("accent");
  });
});

describe("hubAvatarsTransport: the hub's relay in place of a local screen", () => {
  it("mine() is empty until the room has said who I am and my view has laid out", () => {
    const clock = { ms: 0 };
    const { wiring } = build(null, clock);
    expect(wiring.transport.mine()).toEqual([]);
  });

  it("mine() carries my seat, my name from the roster, and my own ink", () => {
    const clock = { ms: 0 };
    const { wiring } = build("p1", clock);
    wiring.roster(ROSTER);
    expect(wiring.transport.mine()).toEqual([
      { seat: "p1", name: "Alice", ink: "accent", state: "online", holding: false, view: VIEW },
    ]);
  });

  it("say() puts my own view on the wire no oftener than the throttle", () => {
    const clock = { ms: 1000 };
    const { wiring, sent } = build("p1", clock);
    wiring.roster(ROSTER);
    const mine = wiring.transport.mine()[0]!;

    wiring.transport.say(mine);
    expect(sent).toHaveLength(1);

    // The same presence again is not news at any interval.
    wiring.transport.say(mine);
    expect(sent).toHaveLength(1);

    // A different view within the throttle window waits.
    const moved: Presence = { ...mine, view: { ...VIEW, target: { x: 1, y: 1 } } };
    clock.ms += 1;
    wiring.transport.say(moved);
    expect(sent).toHaveLength(1);

    clock.ms += PRESENCE_EVERY_MS;
    wiring.transport.say(moved);
    expect(sent).toHaveLength(2);
  });

  it("say() sends a state change at once, even inside the throttle window", () => {
    const clock = { ms: 1000 };
    const { wiring, sent } = build("p1", clock);
    wiring.roster(ROSTER);
    const mine = wiring.transport.mine()[0]!;
    wiring.transport.say(mine);
    expect(sent).toHaveLength(1);

    clock.ms += 1;
    const away: Presence = { ...mine, state: "away" };
    wiring.transport.say(away);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.state).toBe("away");
  });

  it("roster() names every seat and returns the ones that just left", () => {
    const clock = { ms: 0 };
    const { wiring } = build("p1", clock);
    expect(wiring.roster(ROSTER)).toEqual([]);
    expect(wiring.roster([ROSTER[0]!])).toEqual(["p2"]);
  });

  it("heard() answers only for a presence, and never for my own seat", () => {
    const clock = { ms: 0 };
    const { wiring } = build("p1", clock);
    wiring.roster(ROSTER);
    expect(wiring.heard({ kind: "hand", from: "p2" })).toBe(false);

    let seen: Presence | undefined;
    wiring.transport.hear((p) => {
      seen = p;
    });

    // My own seat never arrives from outside — a stray echo is swallowed, not relayed.
    expect(wiring.heard({ kind: "presence", from: "p1", view: VIEW } as unknown as RelayMessage)).toBe(true);
    expect(seen).toBeUndefined();

    expect(wiring.heard({ kind: "presence", from: "p2", view: VIEW, state: "online", holding: false } as unknown as RelayMessage)).toBe(
      true,
    );
    expect(seen).toEqual({ seat: "p2", name: "Bob", ink: "alert", state: "online", holding: false, view: VIEW });
  });

  it("state() changes what mine() reports, ready for the next publish", () => {
    const clock = { ms: 0 };
    const { wiring } = build("p1", clock);
    wiring.roster(ROSTER);
    wiring.state("away");
    expect(wiring.transport.mine()[0]?.state).toBe("away");
  });
});
