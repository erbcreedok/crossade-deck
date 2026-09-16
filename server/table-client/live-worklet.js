// МИКРОФОН КУСКАМИ — отдельный файл, а не часть сборки: `AudioWorklet` грузит только самостоятельный модуль
// и своим адресом. Он живёт в звуковом потоке, поэтому здесь ничего тяжёлого — только набрать кусок и отдать.
//
// Отсчёты приходят долями от -1 до 1 и уходят знаковыми 16 битами: вчетверо легче и кладётся в `AudioBuffer`
// без разбора. Частоту задаёт сам звуковой поток; клиент пересчитывает её к `LIVE_RATE` на той стороне.

class LiveMic extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = options?.processorOptions?.size ?? 1920;
    this.buf = new Int16Array(this.size);
    this.at = 0;
  }

  process(inputs) {
    const one = inputs[0]?.[0];
    if (!one) return true;
    for (let i = 0; i < one.length; i += 1) {
      const v = Math.max(-1, Math.min(1, one[i]));
      this.buf[this.at] = v < 0 ? v * 0x8000 : v * 0x7fff;
      this.at += 1;
      if (this.at === this.size) {
        // Копия уходит владельцем: сам буфер набирается дальше, не дожидаясь той стороны.
        const out = this.buf.slice();
        this.port.postMessage(out, [out.buffer]);
        this.at = 0;
      }
    }
    return true;
  }
}

registerProcessor("live-mic", LiveMic);
