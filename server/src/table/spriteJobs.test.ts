import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.TABLE_SPRITE_JOBS = mkdtempSync(join(tmpdir(), "sprite-jobs-"));
process.env.TABLE_SPRITE_LIB = mkdtempSync(join(tmpdir(), "sprite-lib-"));
const { cleanAsk, freeId, listJobs, oneJob, startJob } = await import("./spriteJobs.js");
const { dropSprite, keepSprite, kindOf } = await import("./spriteLib.js");
const { libSprites } = await import("../db/tableSpritesRepo.js");

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

  it("библиотека берёт PNG и чистый SVG; SVG со скриптом, обработчиком или внешней ссылкой — нет", () => {
    const svg = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`);
    expect(kindOf(svg('<circle r="4" fill="#b3221f"/><use href="#a"/>'))).toEqual({ ext: "svg" });
    expect(kindOf(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]))).toEqual({ ext: "png" });
    expect(kindOf(svg("<script>alert(1)</script>"))).toEqual({ error: "unsafe_svg" });
    expect(kindOf(svg('<rect onload="x()"/>'))).toEqual({ error: "unsafe_svg" });
    expect(kindOf(svg('<image href="https://evil/x.png"/>'))).toEqual({ error: "unsafe_svg" });
    expect(kindOf(Buffer.from("hello"))).toEqual({ error: "not_an_image" });
  });

  it("картинка ложится в библиотеку со своим именем и уходит из неё", async () => {
    const one = await keepSprite(Buffer.from('<svg viewBox="0 0 1 1"/>'), "Лис · лицо", "upload", 5);
    expect("error" in one).toBe(false);
    if ("error" in one) return;
    expect(libSprites().map((s) => s.name)).toContain("Лис · лицо");
    await dropSprite(one);
    expect(libSprites().some((s) => s.id === one.id)).toBe(false);
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
