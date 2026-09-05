import { describe, it, expect, beforeEach, vi } from "vitest";
import { joinTable } from "./table.js";
import { node, revOf, toSpec, Container, Bounded, rect } from "game-kit";

// A table with no code yet is created through the HTTP door (`POST /rooms`), same as a real link
// would use — see online/table.ts. The socket layer is faked by `FakeColyseusClient` below; only
// this one HTTP call needs a stub.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ roomId: "room-123" }) })),
  );
});

class FakeColyseusRoom {
  id = "room-123";
  handlers = new Map<string, (msg: any) => void>();
  sentMessages: Array<{ type: string; message: any }> = [];
  left = false;

  onMessage(type: string, cb: (msg: any) => void) {
    this.handlers.set(type, cb);
  }

  send(type: string, message?: any) {
    this.sentMessages.push({ type, message });
    if (type === "hello") {
      const welcomeHandler = this.handlers.get("welcome");
      if (welcomeHandler) {
        welcomeHandler({
          you: { seat: "p1", name: "Alice" },
          code: "1234",
          roomId: "room-123",
          rev: 5,
          tree: { id: "desk", atoms: {}, children: [] },
          roster: [{ seat: "p1", name: "Alice" }],
        });
      }
    }
  }

  leave() {
    this.left = true;
  }

  emit(type: string, msg: any) {
    const handler = this.handlers.get(type);
    if (handler) handler(msg);
  }
}

class FakeColyseusClient {
  room = new FakeColyseusRoom();
  async create(_name: string, _options: any) {
    return this.room;
  }
  async joinById(_id: string, _options: any) {
    return this.room;
  }
}

describe("joinTable online adapter", () => {
  it("processes welcome message: sets root, rev, seat, code, roomId", async () => {
    const client = new FakeColyseusClient();
    const table = await joinTable({ game: "table", client });

    expect(table.seat).toBe("p1");
    expect(table.code).toBe("1234");
    expect(table.roomId).toBe("room-123");
    expect(table.rev).toBe(5);
    expect(table.root.id).toBe("desk");
    expect(revOf(table.root)).toBe(5);
  });

  it("send(next): sends baseRev and spec, updates local root and rev optimistically", async () => {
    const client = new FakeColyseusClient();
    const table = await joinTable({ game: "table", client });

    const nextNode = node("desk", Bounded({ bounds: rect(2, 2) }));
    table.send(nextNode);

    const setMsg = client.room.sentMessages.find((m) => m.type === "set");
    expect(setMsg).toBeDefined();
    expect(setMsg?.message.baseRev).toBe(5);
    expect(setMsg?.message.tree.id).toBe("desk");

    expect(table.rev).toBe(6);
    expect(revOf(table.root)).toBe(6);
  });

  it("tree message replaces root, updates rev, and notifies onTree listeners", async () => {
    const client = new FakeColyseusClient();
    const table = await joinTable({ game: "table", client });

    let notifiedRoot: any = null;
    let notifiedFrom: string | null = null;

    table.onTree((r, from) => {
      notifiedRoot = r;
      notifiedFrom = from;
    });

    const newTreeSpec = { id: "desk-v2", atoms: {}, children: [] };
    client.room.emit("tree", { rev: 10, tree: newTreeSpec, from: "p2" });

    expect(table.rev).toBe(10);
    expect(table.root.id).toBe("desk-v2");
    expect(notifiedFrom).toBe("p2");
    expect(notifiedRoot?.id).toBe("desk-v2");
  });

  it("sendRelay uploads the message as is; onRelay hands an arriving one over with its `from`", async () => {
    const client = new FakeColyseusClient();
    const table = await joinTable({ game: "table", client });

    table.sendRelay({ kind: "hand", done: false });
    const sent = client.room.sentMessages.find((m) => m.type === "relay");
    expect(sent?.message).toEqual({ kind: "hand", done: false });

    let got: any = null;
    table.onRelay((msg) => {
      got = msg;
    });
    client.room.emit("relay", { kind: "presence", from: "p2", state: "online" });
    expect(got?.kind).toBe("presence");
    expect(got?.from).toBe("p2");
  });

  it("roster comes in with the welcome and is replaced by every roster message", async () => {
    const client = new FakeColyseusClient();
    const table = await joinTable({ game: "table", client });

    expect(table.roster).toEqual([{ seat: "p1", name: "Alice" }]);

    let told: any = null;
    table.onRoster((roster) => {
      told = roster;
    });
    const both = [
      { seat: "p1", name: "Alice" },
      { seat: "p2", name: "Bob" },
    ];
    client.room.emit("roster", { roster: both });

    expect(table.roster).toEqual(both);
    expect(told).toEqual(both);
  });

  it("stale message replaces root, updates rev, and notifies onTree with from: server", async () => {
    const client = new FakeColyseusClient();
    const table = await joinTable({ game: "table", client });

    let notifiedFrom: string | null = null;
    table.onTree((_r, from) => {
      notifiedFrom = from;
    });

    const serverTreeSpec = { id: "desk-authoritative", atoms: {}, children: [] };
    client.room.emit("stale", { rev: 12, tree: serverTreeSpec });

    expect(table.rev).toBe(12);
    expect(table.root.id).toBe("desk-authoritative");
    expect(notifiedFrom).toBe("server");
  });
});
