import { describe, it, expect } from "vitest";
import { TEST_PORTS, useTestServer } from "./roomHarness.js";

// Песочница-live: ретранслятор снимков + присутствие. Правил борды на сервере нет намеренно
// (клиент считает — сервер раздаёт), поэтому тесты — про identity, лок и доставку.

describe("SandboxRoom", () => {
  const server = useTestServer(TEST_PORTS.sandbox);

  async function join(opts: Record<string, unknown> = {}) {
    const client = await server().sdk.joinOrCreate("sandbox_room", opts);
    const welcome = new Promise<Record<string, unknown>>((resolve) => client.onMessage("welcome", resolve));
    client.send("hello");
    return { client, welcome: await welcome };
  }

  it("бестокенный гость получает ник «цвет + животное», место за столом и код комнаты", async () => {
    const { welcome } = await join();
    const you = welcome.you as { name: string; seat: string; color: number };
    expect(you.name).toMatch(/^\S+ \S+$/);
    expect(you.seat).toBe("p1");
    expect(you.color).toBeGreaterThan(0);
    expect(String(welcome.code)).toMatch(/^\d{4}$/);
  });

  it("старый аккаунт первого клиента едет как есть: имя из options, не «панда»", async () => {
    const { welcome } = await join({ accountId: "acc-1", name: "Ербол" });
    expect((welcome.you as { name: string }).name).toBe("Ербол");
  });

  it("команда борды: автор применил сам, остальным летит cmd+снимок; поздний гость получает снимок", async () => {
    const a = await join();
    const b = await join();
    const got = new Promise<Record<string, unknown>>((resolve) => b.client.onMessage("cmd", resolve));
    a.client.send("cmd", { cmd: { t: "move" }, state: { marker: 42 } });
    const relayed = await got;
    expect((relayed.state as { marker: number }).marker).toBe(42);
    const late = await join();
    expect((late.welcome.state as { marker: number }).marker).toBe(42);
  });

  it("драг-стрим ретранслируется остальным; после выхода тащившего остальным летит null", async () => {
    const a = await join();
    const b = await join();
    const got = new Promise<Record<string, unknown>>((resolve) => b.client.onMessage("drag", resolve));
    a.client.send("drag", { el: "A♠", at: { x: 5, y: 6 } });
    const relayed = await got;
    expect(relayed.el).toBe("A♠");
    expect((relayed.at as { x: number }).x).toBe(5);
    const gone = new Promise<Record<string, unknown>>((resolve) => b.client.onMessage("drag", resolve));
    await a.client.leave();
    expect((await gone).at).toBeNull();
  });

  it("настройки борды: остальным летит settings+снимок, поздний гость получает их в welcome", async () => {
    const a = await join();
    const b = await join();
    const got = new Promise<Record<string, unknown>>((resolve) => b.client.onMessage("settings", resolve));
    a.client.send("settings", { settings: { shape: "rect" }, state: { marker: 7 } });
    const relayed = await got;
    expect((relayed.settings as { shape: string }).shape).toBe("rect");
    expect((relayed.state as { marker: number }).marker).toBe(7);
    const late = await join();
    expect((late.welcome.settings as { shape: string }).shape).toBe("rect");
    expect((late.welcome.state as { marker: number }).marker).toBe(7);
  });

  it("лок «кто первый схватил»: второму — grab_denied, после release элемент свободен", async () => {
    const a = await join();
    const b = await join();
    a.client.send("grab", { el: "A♠" });
    const denied = new Promise<Record<string, unknown>>((resolve) => b.client.onMessage("grab_denied", resolve));
    b.client.send("grab", { el: "A♠" });
    expect(((await denied).el as string)).toBe("A♠");
    const freed = new Promise<Record<string, string>>((resolve) =>
      b.client.onMessage("held", (m: { held: Record<string, string> }) => {
        if (!m.held["A♠"]) resolve(m.held);
      }),
    );
    a.client.send("release", { el: "A♠" });
    expect((await freed)["A♠"]).toBeUndefined();
  });

  it("пятый участник за стол не садится — входит призраком (seat null)", async () => {
    await join();
    await join();
    await join();
    await join();
    const fifth = await join();
    expect((fifth.welcome.you as { seat: string | null }).seat).toBeNull();
  });
});
