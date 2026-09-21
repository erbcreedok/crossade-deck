import { describe, expect, it } from "vitest";
import { runStop } from "./shutdown.js";

describe("мягкая остановка", () => {
  it("шаги идут по порядку, и упавший не отменяет следующие", async () => {
    const done: string[] = [];
    const said: string[] = [];
    await runStop(
      [
        { name: "комнаты", run: async () => void done.push("комнаты") },
        { name: "маяк", run: () => { throw new Error("нет сети"); } },
        { name: "база", run: () => void done.push("база") },
      ],
      (line) => said.push(line),
    );
    expect(done).toEqual(["комнаты", "база"]);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("маяк");
  });
});
