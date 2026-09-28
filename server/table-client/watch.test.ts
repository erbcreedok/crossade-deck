/// <reference types="node" />
// ОБЁРТКА ХРАНИЛИЩА НЕ ЗАМОРАЖИВАЕТ ЖИВЫЕ ГЕТТЕРЫ (`watch.ts`, `witnessed`).
//
// Обёртка собирается через `...store`, и геттер при этом копируется значением: у экрана навсегда
// остаётся первый снимок. Так тела соседей застыли на первой позе. Здесь каждый геттер сетевого
// хранилища (`netStore.ts`) обязан остаться геттером — и отдавать свежее значение.

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import type { TableStore } from "./store.js";
import { witnessed } from "./watch.js";
import type { Witness } from "../src/table/telling.js";

const getters = [...readFileSync(new URL("./netStore.ts", import.meta.url), "utf8").matchAll(/^\s+get (\w+)\(\)/gm)].map((m) => m[1]!);

describe("watch.live-getters-stay-live", () => {
  it("у сетевого хранилища есть живые геттеры", () => {
    expect(getters).toEqual(expect.arrayContaining(["state", "carries", "eyes", "bodies"]));
  });

  it("обёртка отдаёт свежее значение каждого из них", () => {
    let tick = 0;
    const store = {} as Record<string, unknown>;
    for (const name of getters) Object.defineProperty(store, name, { get: () => `${name}:${tick}`, enumerable: true });
    for (const fn of ["onRefused", "onGone", "send"]) store[fn] = () => {};
    const w = { saw: () => {} } as unknown as Witness;
    const seen = witnessed(store as unknown as TableStore, w) as unknown as Record<string, unknown>;
    tick = 1;
    for (const name of getters) expect(seen[name], name).toBe(`${name}:1`);
  });
});
