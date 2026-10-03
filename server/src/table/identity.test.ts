import { describe, expect, it } from "vitest";
import { whoIs } from "./identity.js";

describe("гость возвращается тем же человеком", () => {
  const doors = { guests: true };
  it("постоянный guestId даёт тот же ключ на любой загрузке; нет или мусор — ключ от соединения", () => {
    const a = whoIs({ door: "guest", name: "Ян", guestId: "abcdef0123456789abcd" }, "s1", doors);
    const b = whoIs({ door: "guest", name: "Ян", guestId: "abcdef0123456789abcd" }, "s2", doors);
    expect(a?.key).toBe("guest:abcdef0123456789abcd");
    expect(b?.key).toBe(a?.key);
    expect(whoIs({ door: "guest", name: "Ян" }, "s3", doors)?.key).toBe("guest:s3");
    expect(whoIs({ door: "guest", name: "Ян", guestId: "коротко" }, "s4", doors)?.key).toBe("guest:s4");
    expect(whoIs({ door: "guest", name: "Ян", guestId: "x".repeat(200) }, "s5", doors)?.key).toBe("guest:s5");
  });
});
