import { describe, expect, it } from "vitest";
import { nodeCard, nodeDoing, sinceText } from "./adminNodes.js";

const base = { id: "voyager", role: "table" as const, region: "home", host: "voyager", version: "0.2.0", build: "dev", startedAt: 0, url: null, rooms: 2, people: 3, polling: null, seenAt: 0, up: true, serving: true };

describe("узлы на странице хозяина", () => {
  it("называет, что узел делает", () => {
    expect(nodeDoing(base)).toBe("отвечает на постоянном адресе");
    expect(nodeDoing({ ...base, serving: false })).toBe("в запасе");
    expect(nodeDoing({ ...base, role: "bot", polling: true })).toBe("держит Telegram");
    expect(nodeDoing({ ...base, role: "bot", polling: false })).toBe("запускается");
    expect(nodeDoing({ ...base, up: false })).toBe("молчит");
    expect(nodeDoing({ ...base, role: "standby" })).toBe("следит");
  });

  it("считает давность по-человечески", () => {
    expect(sinceText(0, 30_000)).toBe("30 с назад");
    expect(sinceText(0, 10 * 60_000)).toBe("10 мин назад");
    expect(sinceText(0, 3 * 3_600_000)).toBe("3 ч назад");
  });

  it("запасной узел показывает своё пояснение и коммит", () => {
    const html = nodeCard({ ...base, role: "standby", note: "стол в запасе, снимок 40 с назад", commit: "abcdef1234" }, 1000);
    expect(html).toContain("запасной");
    expect(html).toContain("стол в запасе, снимок 40 с назад");
    expect(html).toContain("abcdef12");
  });

  it("не пускает разметку из чужих полей в страницу", () => {
    const html = nodeCard({ ...base, id: "<img src=x onerror=1>", host: "\"><b>" }, 1000);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
