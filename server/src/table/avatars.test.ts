import { describe, expect, it } from "vitest";
import { saveTableProfile } from "../db/tableProfilesRepo.js";
import { faceOf } from "./avatars.js";

describe("лицо за столом — надетый снимок-аватар", () => {
  it("новое фото в Telegram — ещё один снимок, а сидит он прежним; выбрал новый — им", async () => {
    const first = await faceOf("tg:9101", "data:image/jpeg;base64,AAA");
    expect(first).toMatchObject({ photo: "data:image/jpeg;base64,AAA", worn: 1 });
    const changed = await faceOf("tg:9101", "data:image/jpeg;base64,BBB");
    expect(changed.avatars.map((a) => a.n), "прежний снимок остался, новый добавился").toEqual([1, 2]);
    expect(changed.photo, "за столом — прежний снимок, не новое фото").toBe("data:image/jpeg;base64,AAA");
    saveTableProfile("tg:9101", { avatar: 2 });
    expect((await faceOf("tg:9101", "data:image/jpeg;base64,BBB")).photo).toBe("data:image/jpeg;base64,BBB");
  });

  it("гость без Telegram снимков не копит", async () => {
    expect(await faceOf("dev:x", "data:x")).toEqual({ photo: "data:x", avatars: [] });
  });
});
