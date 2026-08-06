// ФАБРИКА УЗЛОВ БОРДЫ: ElementDef → визуальный узел (карта / фигура / фишка). Registry-подход
// (пресеты вместо подклассов): сцена не знает КАК строится узел, она просит фабрику по спеке.

import type { Renderer } from "pixi.js";
import { TEX_H } from "../../engine/constants";
import { makeCard } from "../../ui/Card";
import type { Piece } from "../../ui/Piece";
import { buildPiece, type PieceSpec } from "../../ui/pieceKinds";
import type { CardTextureCache } from "../../ui/CardTextureCache";
import { CARD } from "../../crossade/tree";
import type { ElementDef } from "../core/spec";
import type { TableItem } from "../../ui/tableItem";

export type BoardNode = TableItem;

/** Высота карты в полосе чужого места (ряд рубашек). */
export const SEAT_STRIP_CARD_H = 83;

export function buildBoardNode(id: string, def: ElementDef | undefined, tex: CardTextureCache, renderer: Renderer | null): BoardNode {
  if (!def || def.kind === "card") {
    return makeCard({ id, card: def?.kind === "card" ? def.face : "A♠", faceUp: true, flippable: true }, tex, CARD.h / TEX_H);
  }
  const spec: PieceSpec =
    def.kind === "piece"
      ? { kind: "chess", dark: def.dark, glyph: def.glyph }
      : def.kind === "widget"
        ? { kind: "widget", label: def.label, w: def.w, h: def.h }
        : { kind: "chip", color: 0x2e6b45, denom: String(def.denom) };
  return buildPiece(id, spec, 30, renderer);
}

/** Масштаб узла в слоте: в полосе чужого места карта ужимается до строки рубашек. */
export function nodeScaleIn(node: BoardNode, slot: string): number {
  if (node.kind !== "card") return node.restScale;
  const strip = slot.startsWith("seat:");
  return (strip ? SEAT_STRIP_CARD_H / CARD.h : 1) * node.restScale;
}
