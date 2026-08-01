import { describe, expect, it } from "vitest";
import { readRuntimeConfig, resolveUrls } from "./runtimeConfig";

describe("readRuntimeConfig", () => {
  it("нет config.js вообще — пустой конфиг, а не падение", () => {
    expect(readRuntimeConfig({})).toEqual({ serverUrl: undefined, httpUrl: undefined });
  });

  it("читает адреса из window.__CRUSADE_CONFIG__", () => {
    const scope = { __CRUSADE_CONFIG__: { serverUrl: "wss://a", httpUrl: "https://a" } };
    expect(readRuntimeConfig(scope)).toEqual({ serverUrl: "wss://a", httpUrl: "https://a" });
  });

  // entrypoint пишет config.js всегда; незаданной переменной окружения соответствует "".
  it("пустая строка — это «не задано», а не адрес", () => {
    const scope = { __CRUSADE_CONFIG__: { serverUrl: "", httpUrl: "" } };
    expect(readRuntimeConfig(scope)).toEqual({ serverUrl: undefined, httpUrl: undefined });
  });

  it("мусор вместо объекта не роняет клиент", () => {
    expect(readRuntimeConfig({ __CRUSADE_CONFIG__: "нет" })).toEqual({});
    expect(readRuntimeConfig(null)).toEqual({});
  });

  it("один адрес задан, второй нет — половинчатый конфиг допустим", () => {
    const scope = { __CRUSADE_CONFIG__: { serverUrl: "wss://a" } };
    expect(readRuntimeConfig(scope)).toEqual({ serverUrl: "wss://a", httpUrl: undefined });
  });
});

describe("resolveUrls", () => {
  it("рантайм важнее вшитого на сборке — ради этого всё и затевалось", () => {
    const urls = resolveUrls(
      { serverUrl: "wss://runtime", httpUrl: "https://runtime" },
      { serverUrl: "wss://baked", httpUrl: "https://baked" }
    );
    expect(urls).toEqual({ serverUrl: "wss://runtime", httpUrl: "https://runtime" });
  });

  // Обратная совместимость: docker-compose.yml и старые образы собираются с VITE_*.
  it("без рантайма берёт вшитое на сборке", () => {
    const urls = resolveUrls({}, { serverUrl: "wss://baked", httpUrl: "https://baked" });
    expect(urls).toEqual({ serverUrl: "wss://baked", httpUrl: "https://baked" });
  });

  it("нет ничего — localhost, чтобы дев поднимался без настройки", () => {
    expect(resolveUrls({}, {})).toEqual({
      serverUrl: "ws://localhost:2567",
      httpUrl: "http://localhost:2567",
    });
  });

  it("вшитая пустая строка тоже пропускает ход до localhost", () => {
    expect(resolveUrls({}, { serverUrl: "", httpUrl: "" })).toEqual({
      serverUrl: "ws://localhost:2567",
      httpUrl: "http://localhost:2567",
    });
  });

  it("ступени смешиваются независимо: ws из рантайма, http вшитый", () => {
    const urls = resolveUrls({ serverUrl: "wss://runtime" }, { httpUrl: "https://baked" });
    expect(urls).toEqual({ serverUrl: "wss://runtime", httpUrl: "https://baked" });
  });
});
