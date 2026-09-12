import { describe, it, expect } from "vitest";
import { TEST_PORTS, useTestServer } from "./roomHarness.js";
import { createAccount } from "./accounts.js";

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

  // ИМЯ ЗА СТОЛОМ ПРИНАДЛЕЖИТ АККАУНТУ. Клиент может прислать какое угодно — ростер назовёт
  // человека так, как он назван у себя в профиле.
  it("имя в ростере берётся из аккаунта, а не из options.name", async () => {
    const account = createAccount("Ербол");

    const { welcome } = await create({ accountId: account.id, name: "Кто-то другой" });
    const roster = welcome.roster as { accountId?: string; name: string }[];

    expect(roster.find((one) => one.accountId === account.id)?.name).toBe("Ербол");
  });

  it("у кого аккаунта нет — зовётся тем, что прислал, а без этого кличкой по сессии", async () => {
    const { welcome } = await create({ name: "Безаккаунтный" });
    const roster = welcome.roster as { name: string }[];
    expect(roster[0]?.name).toBe("Безаккаунтный");

    const bare = await create({});
    expect(((bare.welcome.roster as { name: string }[])[0]?.name ?? "").split(" ")).toHaveLength(2);
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

  it("relay доходит второму с from отправителя, первому не возвращается, rev не растёт", async () => {
    const a = await join({ accountId: "acc-1" });
    const b = await join({ accountId: "acc-2" });

    let aGotRelay = false;
    a.client.onMessage("relay", () => {
      aGotRelay = true;
    });

    const bRelayPromise = new Promise<Record<string, unknown>>((resolve) => b.client.onMessage("relay", resolve));
    a.client.send("relay", { kind: "hand", at: { x: 1, y: 2 }, done: false });

    const got = await bRelayPromise;
    expect(got.kind).toBe("hand");
    expect(got.from).toBe("p1");
    expect(got.at).toEqual({ x: 1, y: 2 });
    expect(aGotRelay).toBe(false);

    const late = await join({ accountId: "acc-late" });
    expect(late.welcome.rev).toBe(0);
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

// СТОРОЖ `kit.chairs-and-people-are-two-counts`.
//
// Стул — место за столом, и сколько их, решает стол: в картах их наплодят сколько нужно, в шахматах
// их всегда два. Человек в комнате — другой счёт: в него входят игроки, зрители, админы и ушедшие,
// и держит комната не больше тридцати двух. Раньше это было ОДНО поле, и оно врало обеим сторонам:
// третий за двухместным столом считался лишним в комнате, хотя он всего лишь зритель.
describe("kit.chairs-and-people-are-two-counts", () => {
  const server = useTestServer(TEST_PORTS.kitCounts);

  const sit = async (opts: Record<string, unknown>) => {
    const client = await server().sdk.joinById(roomId!, opts);
    const welcome = new Promise<Record<string, unknown>>((r) => client.onMessage("welcome", r));
    client.send("hello");
    return { client, welcome: await welcome };
  };
  let roomId: string | undefined;

  it("стульев меньше, чем людей: лишние садятся зрителями, а сверх вместимости не пускают", async () => {
    const first = await server().sdk.create("kit_room", { chairs: 2, capacity: 3, accountId: "acc-1", name: "Алия" });
    roomId = first.roomId;

    const second = await sit({ accountId: "acc-2", name: "Тимур" });
    const third = await sit({ accountId: "acc-3", name: "Дана" });

    expect((second.welcome.you as { seat: string | null }).seat).toBe("p2");
    // Стульев два, человек третий — он в комнате, но без стула.
    expect((third.welcome.you as { seat: string | null }).seat).toBeNull();

    // ...а четвёртому места в комнате уже нет: это про людей, а не про стулья.
    await expect(server().sdk.joinById(roomId!, { accountId: "acc-4", name: "Канат" })).rejects.toThrow();

    first.leave();
    second.client.leave();
    third.client.leave();
  });
});
