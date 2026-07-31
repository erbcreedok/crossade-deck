import { describe, it, expect } from "vitest";
import { ResourcePool } from "./canvasPool";

// Пул — единственная защита от классической беды «Pixi в сторибуке»: браузер держит ~16 живых
// WebGL-контекстов, а HMR и переключение стори норовят создавать новый на каждый чих. Логика
// счётчиков чистая, поэтому проверяется тут, без браузера; что она РЕАЛЬНО удерживает один
// контекст — проверяется руками (см. чеклист в docs/HANDOFF.md).

function fake() {
  const created: string[] = [];
  const disposed: string[] = [];
  const pool = new ResourcePool<string, { key: string }>({
    create: (k) => (created.push(k), { key: k }),
    dispose: (v) => void disposed.push(v.key),
    cap: 2,
  });
  return { pool, created, disposed };
}

describe("ResourcePool", () => {
  it("первый acquire создаёт, повторный на тот же ключ — переиспользует", () => {
    const { pool, created } = fake();
    const a = pool.acquire("k");
    const b = pool.acquire("k");
    expect(a).toBe(b);
    expect(created).toEqual(["k"]);
  });

  it("release не сносит ресурс, пока он в пределах cap — ради этого пул и нужен", () => {
    const { pool, created, disposed } = fake();
    pool.acquire("k");
    pool.release("k");
    expect(disposed).toEqual([]);
    pool.acquire("k"); // вернулись на ту же стори
    expect(created).toEqual(["k"]); // второго контекста не появилось
  });

  it("живой (не отпущенный) ресурс не вытесняется, даже когда ключей больше cap", () => {
    const { pool, disposed } = fake();
    pool.acquire("a");
    pool.acquire("b");
    pool.acquire("c"); // cap=2, но все три заняты
    expect(disposed).toEqual([]);
    expect(pool.stats().live).toBe(3);
  });

  it("вытесняет ПО ОДНОМУ отпущенному, самый давний, когда отпущенных больше cap", () => {
    const { pool, disposed } = fake();
    for (const k of ["a", "b", "c"]) {
      pool.acquire(k);
      pool.release(k);
    }
    expect(disposed).toEqual(["a"]); // b и c остаются в кэше (cap=2)
  });

  it("повторный acquire освежает давность — вытесняется не он", () => {
    const { pool, disposed } = fake();
    pool.acquire("a");
    pool.release("a");
    pool.acquire("b");
    pool.release("b");
    pool.acquire("a"); // «a» снова использована
    pool.release("a");
    pool.acquire("c");
    pool.release("c");
    expect(disposed).toEqual(["b"]);
  });

  it("счётчик ссылок держит ресурс, пока его не отпустят столько же раз", () => {
    const { pool, disposed } = fake();
    pool.acquire("k");
    pool.acquire("k");
    pool.release("k");
    expect(pool.stats().live).toBe(1);
    pool.release("k");
    expect(pool.stats().live).toBe(0);
    expect(disposed).toEqual([]); // отпущен, но в кэше — cap не превышен
  });

  it("лишний release не уводит счётчик в минус и не сносит ресурс дважды", () => {
    const { pool, disposed } = fake();
    pool.acquire("k");
    pool.release("k");
    pool.release("k");
    pool.release("k");
    expect(disposed).toEqual([]);
    expect(pool.stats().live).toBe(0);
  });

  it("disposeAll сносит всё и обнуляет счёт живых — это то, что зовёт HMR", () => {
    const { pool, disposed } = fake();
    pool.acquire("a");
    pool.acquire("b");
    pool.release("b");
    pool.disposeAll();
    expect(disposed.sort()).toEqual(["a", "b"]);
    expect(pool.stats().live).toBe(0);
  });

  it("stats считает created/disposed за всё время — по ним и ловится утечка", () => {
    const { pool } = fake();
    pool.acquire("a");
    pool.release("a");
    pool.acquire("a");
    pool.release("a");
    expect(pool.stats().created).toBe(1); // ← главная проверка: обход стори НЕ плодит контексты
    expect(pool.stats().disposed).toBe(0);
  });

  it("cap=0 сносит ресурс сразу по последнему release (режим docs)", () => {
    const disposed: string[] = [];
    const pool = new ResourcePool<string, string>({ create: (k) => k, dispose: (v) => void disposed.push(v), cap: 0 });
    pool.acquire("a");
    pool.release("a");
    expect(disposed).toEqual(["a"]);
  });
});
