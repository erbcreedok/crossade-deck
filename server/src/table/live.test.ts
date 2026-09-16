import { describe, expect, it } from "vitest";
import { cleanLive, ear, floatsOf, JITTER_MAX, JITTER_MIN, LATE, LiveTalk, samplesOf, schedule, LIVE_FRAMES_PER_SEC, LIVE_MAX_BYTES, LIVE_MAX_MS, LIVE_RATE, resample, shortsOf } from "./live.js";

const frame = (n = 320) => new Uint8Array(n);

describe("живой голос", () => {
  it("кусок из сети: номер по порядку и вес не больше предела", () => {
    expect(cleanLive({ seq: 0, bytes: frame() })).toEqual({ seq: 0, bytes: frame() });
    // Colyseus кладёт байты обычным объектом с числовыми ключами — их тоже разбираем.
    expect(cleanLive({ seq: 3, bytes: { 0: 1, 1: 2 } })?.bytes).toEqual(Uint8Array.from([1, 2]));
    expect(cleanLive({ seq: 1, bytes: new Uint8Array(0) })).toBeNull();
    expect(cleanLive({ seq: 1, bytes: new Uint8Array(LIVE_MAX_BYTES + 2) })).toBeNull();
    // Нечётная длина — не знаковые 16 бит.
    expect(cleanLive({ seq: 1, bytes: new Uint8Array(321) })).toBeNull();
    expect(cleanLive({ bytes: frame() })).toBeNull();
    expect(cleanLive({ seq: -1, bytes: frame() })).toBeNull();
    expect(cleanLive({ seq: 1.5, bytes: frame() })).toBeNull();
    expect(cleanLive(null)).toBeNull();
    // Адресат — когда микрофон наведён на стул; наведён на сукно — его нет.
    expect(cleanLive({ seq: 2, bytes: frame(), to: "tg:7" })?.to).toBe("tg:7");
    expect(cleanLive({ seq: 2, bytes: frame(), to: "" })?.to).toBeUndefined();
    expect(cleanLive({ seq: 2, bytes: frame(), to: 5 })?.to).toBeUndefined();
  });

  it("чаще, чем вправе, не пересылается — но следующая секунда снова открыта", () => {
    const talk = new LiveTalk();
    let now = 1000;
    for (let i = 0; i < LIVE_FRAMES_PER_SEC; i += 1) expect(talk.take("a", now + i)).toBe(true);
    expect(talk.take("a", now + LIVE_FRAMES_PER_SEC)).toBe(false);
    now += 1100;
    expect(talk.take("a", now)).toBe(true);
  });

  it("говорить разом вправе все: чужой поток чужому не мешает", () => {
    const talk = new LiveTalk();
    for (let i = 0; i < LIVE_FRAMES_PER_SEC; i += 1) talk.take("a", 1000 + i);
    expect(talk.take("a", 1000 + LIVE_FRAMES_PER_SEC)).toBe(false);
    expect(talk.take("b", 1000 + LIVE_FRAMES_PER_SEC)).toBe(true);
  });

  it("дольше предела подряд — замолкает; после тишины речь считается новой", () => {
    const talk = new LiveTalk();
    let now = 1000;
    // Говорим по куску раз в 120 мс дольше предела.
    let last = true;
    for (; now < 1000 + LIVE_MAX_MS + 500; now += 120) last = talk.take("a", now);
    expect(last).toBe(false);
    // Отпустил кнопку, помолчал секунду — и снова вправе говорить.
    expect(talk.take("a", now + 1500)).toBe(true);
    talk.forget("a");
    expect(talk.take("a", now + 1600)).toBe(true);
  });

  it("отсчёты уходят знаковыми 16 битами и возвращаются собой", () => {
    const was = Float32Array.from([0, 0.5, -0.5, 1, -1]);
    const back = floatsOf(shortsOf(was));
    expect(back.length).toBe(was.length);
    for (let i = 0; i < was.length; i += 1) expect(back[i]!).toBeCloseTo(was[i]!, 3);
    // Громче предела не бывает: иначе на той стороне это щелчок.
    const loud = floatsOf(shortsOf(Float32Array.from([4, -4])));
    expect(loud[0]!).toBeLessThanOrEqual(1);
    expect(loud[1]!).toBeGreaterThanOrEqual(-1);
  });

  it("частота пересчитывается, иначе речь звучит ускоренной", () => {
    const at48 = new Float32Array(4800);
    // Ровная волна: после пересчёта она обязана остаться той же волной, только реже отсчётами.
    for (let i = 0; i < at48.length; i += 1) at48[i] = Math.sin((2 * Math.PI * 100 * i) / 48000);
    const out = resample(at48, 48000, LIVE_RATE);
    expect(out.length).toBe((at48.length * LIVE_RATE) / 48000);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]!).toBeCloseTo(Math.sin((2 * Math.PI * 100 * i) / LIVE_RATE), 2);
    }
    // Та же частота — тот же массив, без лишней работы.
    expect(resample(at48, LIVE_RATE, LIVE_RATE)).toBe(at48);
  });

  it("на приёме байты доезжают и обычным объектом — иначе речь молчит, а счётчики зелены", () => {
    const bytes = shortsOf(Float32Array.from([0.5, -0.5]));
    const plain = Object.fromEntries([...bytes].map((v, i) => [i, v]));
    const got = samplesOf(plain);
    expect(got).not.toBeNull();
    expect(got!.length).toBe(2);
    expect(got![0]!).toBeCloseTo(0.5, 3);
    expect(got![1]!).toBeCloseTo(-0.5, 3);
    // И настоящими байтами, конечно, тоже.
    expect(samplesOf(bytes)!.length).toBe(2);
    expect(samplesOf({})).toBeNull();
    expect(samplesOf(new Uint8Array(1))).toBeNull();
  });

  it("куски встают вплотную друг за другом — на стыке не должно быть щели", () => {
    const dur = 0.12;
    let mouth = { next: 0, jitter: JITTER_MIN };
    const first = schedule(mouth, 10, dur, true);
    expect(first.at).toBeCloseTo(10 + JITTER_MIN, 5);
    mouth = first.mouth;
    const second = schedule(mouth, 10.1, dur);
    expect(second.at).toBeCloseTo(first.at + dur, 5);
    expect(second.flush).toBe(false);
  });

  it("речь порвалась — копим дольше, чтобы не рваться на каждом чихе сети", () => {
    let mouth = { next: 10, jitter: JITTER_MIN };
    // Прошлый кусок уже отзвучал, новый только пришёл: это дыра.
    const one = schedule(mouth, 11, 0.12);
    expect(one.mouth.jitter).toBeGreaterThan(JITTER_MIN);
    expect(one.at).toBeCloseTo(11 + one.mouth.jitter, 5);
    // Рвётся и рвётся — копим всё дольше, но не бесконечно.
    mouth = one.mouth;
    for (let i = 0; i < 20; i += 1) mouth = schedule(mouth, 20 + i, 0.12).mouth;
    expect(mouth.jitter).toBeLessThanOrEqual(JITTER_MAX);
    expect(mouth.jitter).toBeCloseTo(JITTER_MAX, 5);
  });

  it("очередь разрослась — поставленное впрок СНИМАЕТСЯ, иначе оно звучит поверх нового", () => {
    const mouth = { next: 10 + LATE + 0.5, jitter: JITTER_MIN };
    const out = schedule(mouth, 10, 0.12);
    expect(out.flush).toBe(true);
    expect(out.at).toBeCloseTo(10 + JITTER_MIN, 5);
    // Часы переставлены на «сейчас», а не оставлены в будущем.
    expect(out.mouth.next).toBeCloseTo(10 + JITTER_MIN + 0.12, 5);
  });

  it("новая речь начинается с чистого листа", () => {
    const out = schedule({ next: 99, jitter: JITTER_MAX }, 10, 0.12, true);
    expect(out.flush).toBe(true);
    expect(out.at).toBeCloseTo(10 + JITTER_MAX, 5);
  });

  it("одно ухо на человека — слушает последнее открытое окно", () => {
    expect(ear(["s1"])).toBe("s1");
    // Открыл стол заново, старое окно висит в фоне: говорим в новое.
    expect(ear(["s1", "s2"])).toBe("s2");
    expect(ear(["s1", "s2", "s3"])).toBe("s3");
    expect(ear([])).toBeNull();
  });
});
