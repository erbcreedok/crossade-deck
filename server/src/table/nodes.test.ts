import { beforeEach, describe, expect, it } from "vitest";
import { cleanReport, describeSelf, forgetNodes, NODE_TTL_MS, nodesList, reportNode, type NodeReport } from "./nodes.js";

const facts = { version: "0.2.0", build: "dev", startedAt: 1, url: null, rooms: 2, people: 3, polling: null };
const bot = (over: Partial<NodeReport> = {}): NodeReport => ({ ...describeSelf("bot", { ...facts, rooms: null, people: null, polling: true }, "mac-host", { NODE_ID: "mac" }), ...over });

beforeEach(forgetNodes);

describe("cleanReport", () => {
  it("принимает целое сообщение и обрезает лишнее", () => {
    const got = cleanReport({ id: "mac", role: "bot", region: "home", host: "m", version: "1", build: "2", startedAt: 5, url: "https://a.b", rooms: null, people: null, polling: true, junk: "x" });
    expect(got).toMatchObject({ id: "mac", role: "bot", polling: true, url: "https://a.b" });
    expect(got).not.toHaveProperty("junk");
  });

  it("не пускает без имени, с чужой ролью и с именем-мусором", () => {
    expect(cleanReport({ role: "bot" })).toBeNull();
    expect(cleanReport({ id: "x", role: "admin" })).toBeNull();
    expect(cleanReport({ id: "<script>", role: "bot" })).toBeNull();
    expect(cleanReport(null)).toBeNull();
  });

  it("адрес не http(s) становится пустым, отрицательные числа — пустыми", () => {
    const got = cleanReport({ id: "x", role: "table", url: "javascript:1", rooms: -4, people: "много" });
    expect(got).toMatchObject({ url: null, rooms: null, people: null });
  });
});

describe("запасной узел в реестре", () => {
  it("принимается как отдельная роль с пояснением, лишнее обрезается", () => {
    const got = cleanReport({ id: "mac", role: "standby", note: "x".repeat(500), commit: "abcdef1234567890" });
    expect(got).toMatchObject({ role: "standby" });
    expect(got?.note?.length).toBe(120);
    expect(got?.commit).toBe("abcdef123456");
    expect(cleanReport({ id: "mac", role: "watcher" })).toBeNull();
  });

  it("запасной и стол с одним именем — два узла", () => {
    const self = describeSelf("table", facts, "mac-host", {});
    reportNode({ ...bot({ id: self.id }), role: "standby", note: "в запасе" }, 1000);
    expect(nodesList(self, 1000).map((n) => n.role).sort()).toEqual(["standby", "table"]);
  });
});

describe("nodesList", () => {
  const self = describeSelf("table", facts, "voyager-host", { NODE_ID: "voyager", NODE_REGION: "home" });

  it("отвечающий стол всегда жив и обслуживает", () => {
    const [me] = nodesList(self, 1000);
    expect(me).toMatchObject({ id: "voyager", up: true, serving: true });
  });

  it("узел жив, пока его слышали недавно, и гаснет по давности", () => {
    reportNode(bot(), 1000);
    expect(nodesList(self, 1000 + NODE_TTL_MS - 1).find((n) => n.id === "mac")?.up).toBe(true);
    expect(nodesList(self, 1000 + NODE_TTL_MS).find((n) => n.id === "mac")?.up).toBe(false);
  });

  it("живые идут выше погасших, а свой отчёт перекрывает чужую запись с тем же именем", () => {
    reportNode(bot({ id: "old" }), 0);
    reportNode(bot({ id: "voyager", role: "table" }), 999_999);
    const list = nodesList(self, 999_999);
    expect(list.filter((n) => n.id === "voyager")).toHaveLength(1);
    expect(list[list.length - 1]?.id).toBe("old");
  });
});

describe("бот и стол на одной машине", () => {
  it("называются одинаково, но это два узла", () => {
    const self = describeSelf("table", facts, "mac-host", {});
    reportNode(bot({ id: self.id }), 1000);
    const list = nodesList(self, 1000);
    expect(list.map((n) => n.role).sort()).toEqual(["bot", "table"]);
  });
});

describe("describeSelf", () => {
  it("имя и регион из окружения, иначе имя машины и home", () => {
    expect(describeSelf("table", facts, "eu-host", { NODE_ID: "eu-1", NODE_REGION: "eu" })).toMatchObject({ id: "eu-1", region: "eu" });
    const bare = describeSelf("table", facts, "some-host", {});
    expect(bare.region).toBe("home");
    expect(bare.id).toBe(bare.host);
  });
});
