import { describe, it, expect } from "vitest";
import { TEST_PORTS, useTestServer } from "./roomHarness.js";

describe("KitRoom", () => {
  const server = useTestServer(TEST_PORTS.kit);

  async function join(opts: Record<string, unknown> = {}) {
    const client = await server().sdk.joinOrCreate("kit_room", opts);
    const welcomePromise = new Promise<Record<string, unknown>>((resolve) => client.onMessage("welcome", resolve));
    client.send("hello");
    const welcome = await welcomePromise;
    return { client, welcome };
  }

  async function create(opts: Record<string, unknown> = {}) {
    const client = await server().sdk.create("kit_room", opts);
    const welcomePromise = new Promise<Record<string, unknown>>((resolve) => client.onMessage("welcome", resolve));
    client.send("hello");
    const welcome = await welcomePromise;
    return { client, welcome };
  }

  it("двое вошли → у обоих welcome с разными местами, третий — зритель", async () => {
    const a = await join({ accountId: "acc-1", name: "Alice" });
    const b = await join({ accountId: "acc-2", name: "Bob" });
    const c = await join({ accountId: "acc-3", name: "Charlie" });

    expect((a.welcome.you as { seat: string }).seat).toBe("p1");
    expect((b.welcome.you as { seat: string }).seat).toBe("p2");
    expect((c.welcome.you as { seat: string | null }).seat).toBeNull();
  });

  it("options.game едет в welcome; без него поля game нет", async () => {
    const withGame = await create({ accountId: "acc-nardy", game: "nardy" });
    expect(withGame.welcome.game).toBe("nardy");

    const withoutGame = await create({ accountId: "acc-plain" });
    expect(withoutGame.welcome.game).toBeUndefined();
  });

  it("set с верным baseRev → второй получил tree с rev + 1; отправитель эха не получает", async () => {
    const a = await join({ accountId: "acc-1" });
    const b = await join({ accountId: "acc-2" });

    let aGotTree = false;
    a.client.onMessage("tree", () => {
      aGotTree = true;
    });

    const bGotTreePromise = new Promise<Record<string, unknown>>((resolve) => b.client.onMessage("tree", resolve));

    const sampleTree = { id: "root", children: [] };
    a.client.send("set", { baseRev: 0, tree: sampleTree });

    const bRelayed = await bGotTreePromise;
    expect(bRelayed.rev).toBe(1);
    expect(bRelayed.tree).toEqual(sampleTree);
    expect(bRelayed.from).toBe("p1");
    expect(aGotTree).toBe(false);
  });

  it("set с устаревшим baseRev → stale с актуальным деревом, rev не сдвинулся", async () => {
    const a = await join({ accountId: "acc-1" });
    const b = await join({ accountId: "acc-2" });

    const initialTree = { id: "root-v1" };
    const bTree1 = new Promise<Record<string, unknown>>((resolve) => b.client.onMessage("tree", resolve));
    a.client.send("set", { baseRev: 0, tree: initialTree });
    await bTree1;

    const stalePromise = new Promise<Record<string, unknown>>((resolve) => b.client.onMessage("stale", resolve));
    b.client.send("set", { baseRev: 0, tree: { id: "root-stale" } });

    const staleRes = await stalePromise;
    expect(staleRes.rev).toBe(1);
    expect(staleRes.tree).toEqual(initialTree);

    const c = await join({ accountId: "acc-3" });
    expect(c.welcome.rev).toBe(1);
    expect(c.welcome.tree).toEqual(initialTree);
  });

  it("опоздавший получает в welcome последнее дерево и текущий rev", async () => {
    const a = await join({ accountId: "acc-1" });
    const treeV1 = { id: "root-1" };
    a.client.send("set", { baseRev: 0, tree: treeV1 });

    const treeV2 = { id: "root-2" };
    a.client.send("set", { baseRev: 1, tree: treeV2 });

    await new Promise((r) => setTimeout(r, 50));

    const late = await join({ accountId: "acc-late" });
    expect(late.welcome.rev).toBe(2);
    expect(late.welcome.tree).toEqual(treeV2);
  });

  it("обрыв + возврат тем же accountId в пределах окна → то же место; без accountId — нет", async () => {
    const a = await join({ accountId: "acc-persistent", name: "Player 1" });
    expect((a.welcome.you as { seat: string }).seat).toBe("p1");

    await a.client.leave();

    const aRejoined = await join({ accountId: "acc-persistent" });
    expect((aRejoined.welcome.you as { seat: string }).seat).toBe("p1");

    const guest = await join({ name: "Guest 1" });
    expect((guest.welcome.you as { seat: string }).seat).toBe("p2");

    await guest.client.leave();

    const guest2 = await join({ name: "Guest 2" });
    expect((guest2.welcome.you as { seat: string }).seat).toBe("p2");
  });
});
