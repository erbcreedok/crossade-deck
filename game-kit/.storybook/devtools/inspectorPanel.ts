// The inspector — dev tooling for reading a tree, and part of the CATALOG, not of the kit.
//
// Storybook's measure and outline addons work on DOM boxes; our scene is one <canvas>, so to
// them it is a single opaque element. And an addon would tie debugging to the catalog's
// iframe protocol, when what needs debugging is the product — the same view can be dropped
// into a real app behind a dev flag, which is why it takes plain data and a text source and
// asks nothing else of its surroundings.
//
// It goes through ONE door — `inspect(root)` — and never walks the tree itself. The markup is
// a pure function of that data, which is what lets the SAME view render in the catalog's
// bottom panel (a different document, across the iframe boundary) and beside a docs scene.

import { accentWash, s, t, type InspectNode } from "../../src/index.js";
import { type CatalogText } from "../locales/catalog.js";

/** The whole panel body as markup: data in, HTML out, no document required. */
export function inspectorMarkup(nodes: readonly InspectNode[], text: CatalogText): string {
  return (
    `<div style="color:${t("textFaint")};letter-spacing:.6px;text-transform:uppercase;font-size:10px;` +
    `font-weight:700;margin-bottom:10px">${text.text("inspector.title")} · ` +
    `${text.plural("inspector.nodes", nodes.length)}</div>` +
    nodes.map((n) => row(n, text)).join("")
  );
}

/** The typography and colours the markup expects, so a host document can adopt them. */
export function inspectorBodyStyle(): string {
  return [
    `font:${s("font.size.m")}/${s("font.line.normal")} ${s("font.mono")}`,
    `color:${t("text")}`,
    `background:${t("panelBg")}`,
    `padding:${s("space.l")} ${s("space.l")}`,
    "overflow:auto",
    "height:100%",
    "box-sizing:border-box",
  ].join(";");
}

export function inspectorPanel(
  doc: Document,
  read: () => readonly InspectNode[],
  text: () => CatalogText,
): { el: HTMLElement; refresh: () => void } {
  const el = doc.createElement("div");
  el.setAttribute("data-inspector", "");
  el.style.cssText = `${inspectorBodyStyle()};border-left:1px solid ${t("panelBorder")}`;

  const refresh = (): void => {
    el.innerHTML = inspectorMarkup(read(), text());
  };
  refresh();
  return { el, refresh };
}

function row(n: InspectNode, text: CatalogText): string {
  const atoms = n.atoms.length
    ? n.atoms.join(" · ")
    : `<span style="color:${t("textFaint")}">${text.text("inspector.noAtoms")}</span>`;
  const badge = n.isRoot
    ? `<span style="color:${t("accent")};background:${accentWash()};border-radius:20px;` +
      `padding:1px 8px;font-size:10px;font-weight:700">${text.text("inspector.root")}</span>`
    : "";
  const kids = n.childCount
    ? `<span style="color:${t("textFaint")};font-weight:400"> · ${text.plural("inspector.children", n.childCount)}</span>`
    : "";

  return (
    `<div style="margin-left:${n.depth * 16}px;border-left:2px solid ${n.isRoot ? t("accent") : t("panelBorder")};` +
    `padding:5px 0 10px 11px;margin-bottom:2px">` +
    `<div style="display:flex;gap:8px;align-items:center;font-weight:700;margin-bottom:5px">` +
    `<span>${n.isRoot ? "▣" : "▪"} ${n.id}${kids}</span>${badge}</div>` +
    line(text.text("inspector.atoms"), atoms) +
    n.fields.map((f) => line(f.key, f.value, f.cls)).join("") +
    (n.absent.length ? line(text.text("inspector.absent"), n.absent.join(" · "), undefined, t("alert")) : "") +
    `</div>`
  );
}

function line(key: string, value: string, cls?: string, colour?: string): string {
  return (
    `<div style="display:flex;gap:10px;align-items:baseline${colour ? `;color:${colour}` : ""}">` +
    `<span style="color:${colour ?? t("textMuted")};min-width:108px;flex:none">${key}</span>` +
    `<span style="flex:1">${value}</span>` +
    (cls ? `<span style="color:${t("textFaint")};font-size:10px;flex:none">${cls}</span>` : "") +
    `</div>`
  );
}
