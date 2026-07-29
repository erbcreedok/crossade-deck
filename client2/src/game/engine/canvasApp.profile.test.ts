import { describe, expect, it } from "vitest";
import { Application } from "pixi.js";
import { CanvasApp } from "./canvasApp";

// Профиль качества по FPS (issue #8) на базе CanvasApp. Мокать Pixi не нужно: feedFrameSample —
// чистый вход в метр/резолвер, setProfileOverride трогает только поля/хук, wake() без app — no-op.

class Probe extends CanvasApp {
  events: string[] = [];
  protected build(_app: Application): void {}
  protected frame(_dt: number): boolean {
    return false;
  }
  protected onProfileChange(p: string): void {
    this.events.push(p);
  }
  get profileValue(): string {
    return this.profile;
  }
  feed(ms: number, n: number): void {
    for (let k = 0; k < n; k++) this.feedFrameSample(ms);
  }
  force(o: "auto" | "full" | "reduced"): void {
    this.setProfileOverride(o);
  }
}

describe("CanvasApp quality profile", () => {
  it("стартует в full без данных", () => {
    const p = new Probe();
    p.feed(1000 / 60, 10); // мало для решения
    expect(p.profileValue).toBe("full");
    expect(p.events).toEqual([]);
  });

  it("устойчивая просадка FPS → авто-понижение до reduced", () => {
    const p = new Probe();
    p.feed(1000 / 30, 40); // ~30fps < DOWN
    expect(p.profileValue).toBe("reduced");
    expect(p.events).toEqual(["reduced"]);
  });

  it("восстановление FPS → авто-возврат к full", () => {
    const p = new Probe();
    p.feed(1000 / 30, 40);
    p.feed(1000 / 60, 60); // полностью заместили окно быстрыми кадрами
    expect(p.profileValue).toBe("full");
    expect(p.events).toEqual(["reduced", "full"]);
  });

  it("форс reduced держит профиль даже при 60fps", () => {
    const p = new Probe();
    p.force("reduced");
    p.feed(1000 / 60, 60);
    expect(p.profileValue).toBe("reduced");
  });

  it("форс full игнорирует просадку; возврат в auto подхватывает замер", () => {
    const p = new Probe();
    p.force("full");
    p.feed(1000 / 30, 40); // авто-тир под капотом стал reduced, но форс держит full
    expect(p.profileValue).toBe("full");
    p.force("auto");
    expect(p.profileValue).toBe("reduced"); // сразу отражает уже замеренный тир
    expect(p.events).toEqual(["reduced"]);
  });
});
