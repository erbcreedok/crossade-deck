import { describe, expect, it } from "vitest";
import type { BotEnv } from "./env.js";
import { resolveHubUrl } from "./hubUrl.js";

const ENV = (hubTunnel: boolean): BotEnv => ({
  botToken: "t",
  serverUrl: "http://localhost:2567",
  hubUrl: "http://localhost:9569",
  hubTunnel,
  appName: undefined,
});

describe("resolveHubUrl", () => {
  it("bot.hub-url-is-the-static-one-unless-asked-for-a-tunnel — HUB_TUNNEL off never shells out", async () => {
    const run = () => {
      throw new Error("must not be called");
    };
    await expect(resolveHubUrl(ENV(false), run as never)).resolves.toBe("http://localhost:9569");
  });

  it("bot.a-tunnel-address-wins-over-the-static-one — HUB_TUNNEL on asks the script", async () => {
    const url = await resolveHubUrl(ENV(true), async () => "https://cohen-paso-villages-louisiana.trycloudflare.com\n");
    expect(url).toBe("https://cohen-paso-villages-louisiana.trycloudflare.com");
  });

  it("bot.a-dead-tunnel-script-falls-back-to-HUB_URL — a stale link beats no link at all", async () => {
    const url = await resolveHubUrl(ENV(true), async () => {
      throw new Error("cloudflared gave no address");
    });
    expect(url).toBe("http://localhost:9569");
  });

  it("falls back to HUB_URL when the script prints nothing", async () => {
    const url = await resolveHubUrl(ENV(true), async () => "");
    expect(url).toBe("http://localhost:9569");
  });
});
