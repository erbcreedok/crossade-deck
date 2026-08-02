import { describe, it, expect } from "vitest";
import { sourceFor } from "./storySource";

// «Show code» отвечает на вопрос «как получить ЭТУ картинку», а не «как написана стори».

describe("sourceFor", () => {
  it("печатает код КОМПОНЕНТА с аргументами этой стори, а не исходник стори", () => {
    const out = sourceFor("<CanvasStage build={() => {}} />", {
      args: { card: "A♠", pose: "lifted" },
      parameters: { code: (a) => `ctx.card({ card: "${a.card}", pose: "${a.pose}" });` },
    });
    expect(out).toBe('ctx.card({ card: "A♠", pose: "lifted" });');
    expect(out).not.toContain("CanvasStage");
  });

  it("берёт ТЕКУЩИЕ аргументы панели, а не начальные: код обязан совпадать с картинкой", () => {
    const out = sourceFor("", {
      args: { pose: "held" },
      initialArgs: { pose: "rest" },
      parameters: { code: (a) => `pose: ${a.pose}` },
    });
    expect(out).toBe("pose: held");
  });

  it("без аргументов панели падает на начальные — стори могла ещё не тронуть контролы", () => {
    const out = sourceFor("", { initialArgs: { pose: "rest" }, parameters: { code: (a) => `pose: ${a.pose}` } });
    expect(out).toBe("pose: rest");
  });

  it("раздел не описал шаблон — печатаем аргументы и ЧЕСТНО говорим, что это не код компонента", () => {
    const out = sourceFor("{}", { args: { size: 1, faceUp: true } });
    expect(out).toContain("Кода компонента у раздела не описано");
    expect(out).toContain("size: 1");
    expect(out).toContain("faceUp: true");
  });

  it("ни шаблона, ни аргументов — прямое объяснение вместо пустого «{}»", () => {
    // Пустой блок выглядит сломанным, хотя ломаться в нём нечему.
    expect(sourceFor("{}", {})).toContain("не описан parameters.code");
    expect(sourceFor("", {})).toContain("не описан parameters.code");
  });

  it("свой исходник у стори есть, а шаблона нет — печатаем исходник, он лучше пустоты", () => {
    expect(sourceFor("const x = 1;", {})).toBe("const x = 1;");
  });
});
