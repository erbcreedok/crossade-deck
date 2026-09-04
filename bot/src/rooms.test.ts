import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoom } from "./rooms.js";

describe("createRoom", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts { game, by } and returns { code, game } from the response", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("http://localhost:2567/rooms");
      expect(JSON.parse(init.body as string)).toEqual({ game: "cards", by: "42" });
      return new Response(JSON.stringify({ code: "AB12", roomId: "room1", game: "cards" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const room = await createRoom("http://localhost:2567", "cards", "42");
    expect(room).toEqual({ code: "AB12", game: "cards" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("omits by when not given", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(init.body as string)).toEqual({ game: "chess" });
      return new Response(JSON.stringify({ code: "CD34", roomId: "room2", game: "chess" }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await createRoom("http://localhost:2567", "chess");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the server rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    await expect(createRoom("http://localhost:2567", "nardy")).rejects.toThrow();
  });
});
