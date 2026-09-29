import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.TABLE_SPRITE_JOBS = mkdtempSync(join(tmpdir(), "sprite-jobs-"));
const { cleanAsk, freeId, listJobs, oneJob, partFor, startJob } = await import("./spriteJobs.js");

describe("заказы спрайтов со страницы хозяина", () => {
  it("заказ читается целиком или никак", () => {
    expect(cleanAsk({ id: "pirate", slot: "head", sides: "6", brief: "пират в треуголке", keep: "#c98a4b" })).toEqual({ id: "pirate", slot: "head", sides: "6", brief: "пират в треуголке", keep: "#c98a4b" });
    expect(cleanAsk({ id: "Пират", slot: "head", sides: "6", brief: "x" }), "id латиницей").toBeNull();
    expect(cleanAsk({ id: "p", slot: "hands", sides: "6", brief: "x" }), "руки не рисуем").toBeNull();
    expect(cleanAsk({ id: "p", slot: "head", sides: "3", brief: "x" })).toBeNull();
    expect(cleanAsk({ id: "p", slot: "head", sides: "2", brief: " " })).toBeNull();
    expect(cleanAsk({ id: "p", slot: "head", sides: "2", brief: "x", photo: "../../etc/passwd" }), "фото — только своё имя").toBeNull();
  });

  it("другая попытка той же части — в новую папку, прежняя остаётся", () => {
    const taken = new Set(["pirate", "pirate-2"]);
    expect(freeId("pirate", "head", (d) => taken.has(d))).toBe("pirate-3");
    expect(freeId("fox", "head", () => false)).toBe("fox");
  });

  it("часть по сторонам: одна — к камере, с верхом — по ракурсу, иначе бумажная; правый бок даёт левый зеркалом", () => {
    const base = { id: "fox", slot: "head" as const, sides: "6" as const, brief: "лис", job: "j", at: 1 };
    expect(partFor({ ...base, views: ["front"] })).toMatchObject({ id: "fox:head", facing: "camera", art: { kind: "file", dir: "fox" } });
    expect(partFor({ ...base, views: ["front", "back", "right", "top", "bottom"] })).toMatchObject({ facing: "view", mirror: { left: "right" } });
    expect(partFor({ ...base, views: ["front", "back"], name: "Лис" })).toMatchObject({ facing: "tilt", name: "Лис" });
  });

  it("запуск кладёт заказ в свою папку; кончился — видно, годен ли и что сказал", async () => {
    let args: string[] = [];
    const job = await startJob({ id: "zzprobe", slot: "legs", sides: "2", brief: "ноги" }, 1_000, (a, dir) => { args = a; writeFileSync(join(dir, "out.txt"), "ГОДНО: front-legs.svg"); writeFileSync(join(dir, "exit"), "0\n"); return 1; });
    expect(args).toContain("--work");
    expect(args.at(-1)).toBe("ноги");
    const seen = await oneJob(job.job);
    expect(seen).toMatchObject({ state: "good", views: ["front", "back"] });
    expect(seen!.out).toContain("ГОДНО");
    expect((await listJobs()).map((j) => j.job)).toEqual([job.job]);
  });
});
