import type { Slot } from "./elementPool";

// Сборка единого списка слотов стола из четырёх массивов состояния (Путь 2, см. PATH2.md).
// Раньше каждый бокс реконсилился сам по себе, и идентичность карты рвалась на границе.
// Здесь все видимые карты сводятся в один плоский список {card, box, within}, который
// TablePool применяет ОДНИМ прогоном — тогда переход карты из бокса в бокс виден как
// перелёт того же спрайта, а не «уничтожить тут, создать там».
//
// Зона (play) разворачивается в кучки box="play:N", within — позиция снизу вверх (как
// playFlat). Порядок боксов в списке роли не играет: место карты задаёт её (box, within).
export function assembleTable(
  deck: readonly string[],
  hand: readonly string[],
  discard: readonly string[],
  play: readonly (readonly string[])[],
): Slot[] {
  const out: Slot[] = [];
  deck.forEach((card, i) => out.push({ id: card, box: "deck", within: i }));
  hand.forEach((card, i) => out.push({ id: card, box: "hand", within: i }));
  discard.forEach((card, i) => out.push({ id: card, box: "discard", within: i }));
  play.forEach((stack, k) => stack.forEach((card, j) => out.push({ id: card, box: `play:${k}`, within: j })));
  return out;
}
