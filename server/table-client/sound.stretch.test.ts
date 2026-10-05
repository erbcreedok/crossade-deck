// РАСТЯЖЕНИЕ ЗАПИСИ БЕЗ СМЕНЫ ВЫСОТЫ: длина меняется во столько раз, во сколько просили, а частота звука остаётся той же.

import { describe, expect, it } from "vitest";
import { stretchBuffer } from "./sound.js";

const SR = 44100;
const fake = {
  createBuffer(channels: number, length: number, rate: number): AudioBuffer {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: (c: number) => data[c]! } as unknown as AudioBuffer;
  },
};
const sine = (hz: number, sec: number): AudioBuffer => {
  const b = fake.createBuffer(1, Math.floor(SR * sec), SR), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.sin((2 * Math.PI * hz * i) / SR);
  return b;
};
/** Частота по переходам через ноль в середине записи, Гц. */
const hzOf = (b: AudioBuffer): number => {
  const d = b.getChannelData(0), from = Math.floor(d.length * 0.25), to = Math.floor(d.length * 0.75);
  let up = 0;
  for (let i = from + 1; i < to; i += 1) if (d[i - 1]! < 0 && d[i]! >= 0) up += 1;
  return up / ((to - from) / SR);
};

describe("stretchBuffer", () => {
  it("длиннее в T раз, высота та же (в пределах 8%: простое наложение зёрен даёт небольшие скачки фазы)", () => {
    const src = sine(440, 0.6), out = stretchBuffer(fake, src, 2);
    expect(out.length / src.length).toBeGreaterThan(1.95);
    expect(out.length / src.length).toBeLessThan(2.1);
    expect(hzOf(out)).toBeGreaterThan(405);
    expect(hzOf(out)).toBeLessThan(475);
  });
  it("короче в T раз (T < 1), высота та же (в пределах 8%: простое наложение зёрен даёт небольшие скачки фазы)", () => {
    const src = sine(440, 0.6), out = stretchBuffer(fake, src, 0.5);
    expect(out.length / src.length).toBeGreaterThan(0.45);
    expect(out.length / src.length).toBeLessThan(0.62);
    expect(hzOf(out)).toBeGreaterThan(405);
    expect(hzOf(out)).toBeLessThan(475);
  });
  it("громкость не проваливается: середина растянутой записи не тише исходной", () => {
    const src = sine(300, 0.5), out = stretchBuffer(fake, src, 1.5);
    const peak = (b: AudioBuffer) => b.getChannelData(0).slice(Math.floor(b.length * 0.3), Math.floor(b.length * 0.7)).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak(out)).toBeGreaterThan(peak(src) * 0.9);
  });
});
