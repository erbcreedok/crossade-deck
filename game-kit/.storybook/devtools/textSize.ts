/**
 * HOLD THE TYPE AT THE SIZE IT WAS WRITTEN — in every document the catalog owns.
 *
 * On a phone, Safari (and Chrome on Android) inflate the type in whatever they decide is a
 * page's main column. It is not applied at load: the boost is recomputed on layout, so a block
 * comes up correct and then doubles the first time something around it changes — an argument
 * moved, a panel switched. Monospace blocks are hit hardest, which is why the Code panel was
 * the one that jumped while the prose beside it stayed put.
 *
 * The catalog is TWO documents — the preview iframe and the manager around it — and they share
 * nothing, not a stylesheet and not a root. Pinned in one only, the other keeps the bug and it
 * reads as a different bug entirely. Hence one function, called in both.
 *
 * `100%` rather than `none`: both switch the boosting off, and `none` also used to disable
 * pinch-zoom on iOS. Nothing here is worth taking a reader's zoom away for.
 */
export function pinTextSize(doc: Document): void {
  if (doc.getElementById(PIN_ID)) return;
  const style = doc.createElement("style");
  style.id = PIN_ID;
  style.textContent = "html{-webkit-text-size-adjust:100%;text-size-adjust:100%}";
  doc.head.appendChild(style);
}

/** Named, so a second call is a no-op rather than a second identical rule. */
const PIN_ID = "gk-text-size";
