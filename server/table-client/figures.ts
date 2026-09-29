// ФИГУРЫ ЗА СТОЛОМ — выключатель на этом устройстве. Выключены — стол как до фигур: кружок-аватар на стуле, без
// тел, спинок и рук, и спрайты не пекутся вовсе. Для слабых телефонов. По умолчанию включены.

const KEY = "crossade.table.figures";

export function readFigures(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeFigures(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Хранилище закрыто — выбор проживёт до перезагрузки.
  }
}
