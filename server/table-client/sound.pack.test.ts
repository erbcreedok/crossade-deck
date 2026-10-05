// ПАККИ ЗВУКОВ: отрезок из сшитой записи вырезается ровно по секундам, каналы сохраняются.

import { describe, expect, it } from "vitest";
import { sliceBuffer } from "./sound.js";

const SR = 1000;
const fake = {
  createBuffer(channels: number, length: number, rate: number): AudioBuffer {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: (c: number) => data[c]! } as unknown as AudioBuffer;
  },
};
/** Сшитая запись: секунда за секундой значения 1, 2, 3… — по ним видно, откуда вырезано. */
const stitched = (): AudioBuffer => {
  const b = fake.createBuffer(2, 3 * SR, SR);
  for (let c = 0; c < 2; c += 1) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i += 1) d[i] = Math.floor(i / SR) + 1 + c * 10; }
  return b;
};

describe("sliceBuffer", () => {
  it("режет отрезок по секундам, длина и значения те, что нужно", () => {
    const clip = sliceBuffer(fake, stitched(), 1, 2);
    expect(clip.length).toBe(SR);
    expect(clip.getChannelData(0)[0]).toBe(2);
    expect(clip.getChannelData(0)[SR - 1]).toBe(2);
    expect(clip.getChannelData(1)[0]).toBe(12);
  });
  it("за краем записи — до конца, не падает", () => {
    const clip = sliceBuffer(fake, stitched(), 2.5, 9);
    expect(clip.length).toBe(Math.floor(0.5 * SR));
  });
  it("отрезок нулевой длины остаётся хотя бы в один сэмпл", () => {
    expect(sliceBuffer(fake, stitched(), 1, 1).length).toBe(1);
  });
});
