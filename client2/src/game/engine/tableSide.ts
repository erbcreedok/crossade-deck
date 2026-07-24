// Какой СТОРОНОЙ лежит карта в боксе (для этого клиента) и нужен ли переворот при переезде
// бокс→бокс (Путь 2, шаг 7). Чистые правила отображения — движок по ним решит, нести ли
// перелёту flip и в какую сторону. Тестируется без Pixi.
//
// Правила отображения (НЕ серверная правда, а как видит этот игрок):
//  - deck    — рубашкой (лица никто не видит, включая дилера);
//  - discard — рубашкой в покое (горка «сыграно и убрано» — display-правило, хотя на
//              сервере сброс лицом вверх);
//  - hand    — лицом (своя рука);
//  - play:N  — лицом вверх (зона общая, всё открыто);
//  - иное (чужое место) — не видим, считаем закрытым.
export function boxFaceUp(box: string): boolean {
  if (box === "hand") return true;
  if (box.startsWith("play:")) return true;
  return false; // deck, discard, чужое место — рубашкой
}

export interface MoveFlip {
  flip: boolean; // сторона на границе изменилась → перелёт несёт переворот
  fromFaceUp: boolean; // сторона в боксе-источнике (начало полёта)
  toFaceUp: boolean; // сторона в боксе-приёмнике (конец полёта)
}

/**
 * Нужен ли переворот при переезде from→to и в какую сторону. Совпадает с уже сделанным в
 * client (startFace≠faceUp): раздача колода→рука = рубашка→лицо; дроп в сброс/колоду =
 * лицо→рубашка; выкладка в зону = без переворота.
 */
export function flipForMove(from: string, to: string): MoveFlip {
  const fromFaceUp = boxFaceUp(from);
  const toFaceUp = boxFaceUp(to);
  return { flip: fromFaceUp !== toFaceUp, fromFaceUp, toFaceUp };
}
