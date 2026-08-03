import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_STORAGE_KEY,
  clearAccount,
  createAccount,
  loadAccount,
  normalizeCode,
  renameAccount,
  restoreAccount,
  saveAccount,
  type StorageLike,
  type StoredAccount,
} from "./account";

// account.ts derives its base URL from runtimeConfig.httpUrl(), which itself reads
// VITE_HTTP_URL — a machine-dependent .env.local may set that for LAN testing. Pin it to the
// default here so these tests assert against a known address instead of whatever this machine
// happens to have configured.
beforeEach(() => {
  vi.stubEnv("VITE_HTTP_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function fakeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const account: StoredAccount = { id: "acc-1", name: "Alice", recoveryCode: "BOVAKI" };

describe("account storage", () => {
  it("round-trips save/load", () => {
    const storage = fakeStorage();
    saveAccount(storage, account);
    expect(loadAccount(storage)).toEqual(account);
  });

  it("returns null when nothing is stored", () => {
    expect(loadAccount(fakeStorage())).toBeNull();
  });

  it("returns null on corrupted JSON instead of throwing", () => {
    const storage = fakeStorage();
    storage.setItem(ACCOUNT_STORAGE_KEY, "{not json");
    expect(loadAccount(storage)).toBeNull();
  });

  it("returns null when the stored shape doesn't match StoredAccount", () => {
    const storage = fakeStorage();
    storage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({ id: "acc-1" }));
    expect(loadAccount(storage)).toBeNull();
  });

  it("clears the stored account", () => {
    const storage = fakeStorage();
    saveAccount(storage, account);
    clearAccount(storage);
    expect(loadAccount(storage)).toBeNull();
  });

  it("uses the shared storage key from the mockup client, so an account survives switching clients", () => {
    expect(ACCOUNT_STORAGE_KEY).toBe("crossade-deck:account");
  });
});

describe("normalizeCode", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeCode("bova-ki")).toBe("BOVAKI");
  });

  it("strips whitespace and punctuation", () => {
    expect(normalizeCode(" bo va.ki! ")).toBe("BOVAKI");
  });

  it("leaves an already-normalized code untouched", () => {
    expect(normalizeCode("BOVAKI")).toBe("BOVAKI");
  });

  it("keeps digits", () => {
    expect(normalizeCode("ab-12-cd")).toBe("AB12CD");
  });
});

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe("createAccount", () => {
  it("posts to /accounts and maps recoveryHash to recoveryCode", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("http://localhost:2567/accounts");
      expect(JSON.parse(init!.body as string)).toEqual({ name: "Alice" });
      return jsonResponse({ id: "acc-1", name: "Alice", recoveryHash: "BOVAKI" });
    });

    const result = await createAccount("Alice", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ id: "acc-1", name: "Alice", recoveryCode: "BOVAKI" });
  });

  it("throws when the server rejects the request", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false));
    await expect(createAccount("Alice", fetchImpl as unknown as typeof fetch)).rejects.toThrow();
  });
});

describe("restoreAccount", () => {
  it("normalizes the code before sending it as recoveryHash", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("http://localhost:2567/accounts/restore");
      expect(JSON.parse(init!.body as string)).toEqual({ recoveryHash: "BOVAKI" });
      return jsonResponse({ id: "acc-1", name: "Alice", recoveryHash: "BOVAKI" });
    });

    const result = await restoreAccount("bova-ki", fetchImpl as unknown as typeof fetch);
    expect(result.recoveryCode).toBe("BOVAKI");
  });

  it("throws when the code isn't found", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false));
    await expect(restoreAccount("bovaki", fetchImpl as unknown as typeof fetch)).rejects.toThrow();
  });
});

describe("renameAccount", () => {
  it("PATCHes /accounts/:id with name and the normalized recoveryHash", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("http://localhost:2567/accounts/acc-1");
      expect(init!.method).toBe("PATCH");
      expect(JSON.parse(init!.body as string)).toEqual({ name: "Bob", recoveryHash: "BOVAKI" });
      return jsonResponse({ id: "acc-1", name: "Bob", recoveryHash: "BOVAKI" });
    });

    const result = await renameAccount("acc-1", "bova-ki", "Bob", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ id: "acc-1", name: "Bob", recoveryCode: "BOVAKI" });
  });

  it("throws when the account/code pair is rejected", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false));
    await expect(
      renameAccount("acc-1", "bovaki", "Bob", fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow();
  });
});
