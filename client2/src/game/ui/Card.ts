import type { TableItem } from "./tableItem";

// КАРТА — теперь ВИД «card» единого предмета стола (ui/tableItem.ts), а не отдельный класс:
// собирается реестром видов (ui/cardKind.ts) так же, как chip/chess (ui/pieceKinds.ts).
// Этот файл — точка совместимости: старые импорты типов и фабрика живут здесь.

export type Card = TableItem;
export { makeCard } from "./cardKind";
export type { CardOptions, CardState, Pose } from "./cardTypes";
export type { ShadowShape } from "./shadow";
