import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpUrl, resolveUrl, serverUrl } from "./runtimeConfig";

describe("resolveUrl", () => {
  it("prefers the runtime value when it is set", () => {
    expect(resolveUrl("ws://runtime", "ws://env", "ws://fallback")).toBe("ws://runtime");
  });

  it("falls back to env when runtime is undefined", () => {
    expect(resolveUrl(undefined, "ws://env", "ws://fallback")).toBe("ws://env");
  });

  it("falls back to the default when both are undefined", () => {
    expect(resolveUrl(undefined, undefined, "ws://fallback")).toBe("ws://fallback");
  });

  it("treats an empty runtime string as not set", () => {
    expect(resolveUrl("", "ws://env", "ws://fallback")).toBe("ws://env");
  });

  it("treats an empty env string as not set", () => {
    expect(resolveUrl(undefined, "", "ws://fallback")).toBe("ws://fallback");
  });

  it("treats empty runtime AND empty env as not set", () => {
    expect(resolveUrl("", "", "ws://fallback")).toBe("ws://fallback");
  });
});

describe("serverUrl/httpUrl", () => {
  // .env.local (машинно-зависимый, для доступа с телефона по LAN-IP) может подменять
  // VITE_SERVER_URL/VITE_HTTP_URL в этом самом окружении — эти тесты проверяют ЦЕПОЧКУ, поэтому
  // сами явно приводят env-ступень к пустой, а не полагаются на то, что дефолт .env не задан.
  beforeEach(() => {
    vi.stubEnv("VITE_SERVER_URL", "");
    vi.stubEnv("VITE_HTTP_URL", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("default to localhost:2567 with no window and no env override", () => {
    expect(serverUrl()).toBe("ws://localhost:2567");
    expect(httpUrl()).toBe("http://localhost:2567");
  });

  it("reads window.__CRUSADE_CONFIG__ when present", () => {
    vi.stubGlobal("window", { __CRUSADE_CONFIG__: { serverUrl: "ws://injected", httpUrl: "http://injected" } });
    expect(serverUrl()).toBe("ws://injected");
    expect(httpUrl()).toBe("http://injected");
  });

  it("ignores an empty string injected at runtime", () => {
    vi.stubGlobal("window", { __CRUSADE_CONFIG__: { serverUrl: "", httpUrl: "" } });
    expect(serverUrl()).toBe("ws://localhost:2567");
    expect(httpUrl()).toBe("http://localhost:2567");
  });

  it("falls back to the build-time env when no runtime config is injected", () => {
    vi.stubEnv("VITE_SERVER_URL", "ws://baked");
    vi.stubEnv("VITE_HTTP_URL", "http://baked");
    expect(serverUrl()).toBe("ws://baked");
    expect(httpUrl()).toBe("http://baked");
  });
});
