import { describe, expect, it } from "vitest";
import { Application } from "pixi.js";
import { CanvasApp } from "./canvasApp";

// Проверяем OR-логику «без вспышек» на базе CanvasApp (issue #9): flashOff = reduceMotion || reduceFlash.
// reduce-motion — надмножество: включённое движение-гашение гасит и вспышки. Мокать Pixi не нужно —
// сеттеры трогают только поля/хуки, а wake() без app — no-op.

class Probe extends CanvasApp {
  flashEvents: boolean[] = [];
  motionEvents: boolean[] = [];
  protected build(_app: Application): void {}
  protected frame(_dt: number): boolean {
    return false;
  }
  protected onFlashChange(v: boolean): void {
    this.flashEvents.push(v);
  }
  protected onReduceMotionChange(v: boolean): void {
    this.motionEvents.push(v);
  }
  get flashOffValue(): boolean {
    return this.flashOff;
  }
}

describe("CanvasApp flash gate", () => {
  it("флаг «без вспышек» сам по себе включает flashOff", () => {
    const p = new Probe();
    p.setReduceFlash(true);
    expect(p.flashOffValue).toBe(true);
    expect(p.flashEvents).toEqual([true]);
  });

  it("reduce-motion гасит вспышки даже без отдельного флага", () => {
    const p = new Probe();
    p.setReduceMotion(true);
    expect(p.flashOffValue).toBe(true);
    expect(p.flashEvents).toEqual([true]);
  });

  it("снятие reduce-motion не возвращает вспышки, пока держит отдельный флаг", () => {
    const p = new Probe();
    p.setReduceFlash(true);
    p.setReduceMotion(true);
    expect(p.flashEvents).toEqual([true]); // второй источник — тот же итог, без повторного события
    p.setReduceMotion(false);
    expect(p.flashOffValue).toBe(true); // всё ещё держит reduceFlash
    expect(p.flashEvents).toEqual([true]);
  });

  it("flashOff гаснет лишь когда сняты ОБА источника", () => {
    const p = new Probe();
    p.setReduceMotion(true);
    p.setReduceFlash(true);
    p.setReduceMotion(false);
    expect(p.flashOffValue).toBe(true);
    p.setReduceFlash(false);
    expect(p.flashOffValue).toBe(false);
    expect(p.flashEvents).toEqual([true, false]);
  });

  it("повторная установка того же значения не дёргает хук", () => {
    const p = new Probe();
    p.setReduceFlash(true);
    p.setReduceFlash(true);
    expect(p.flashEvents).toEqual([true]);
  });
});
