import type { TableItem } from "./tableItem";

// ФИШКА/ФИГУРА — виды единого предмета стола (ui/tableItem.ts): рисованный визуал собирает
// ui/builtKind.ts, реестр конкретных видов — ui/pieceKinds.ts. Точка совместимости импортов.

export type Piece = TableItem;
export { makeBuilt, type BuiltOptions as PieceOptions } from "./builtKind";
