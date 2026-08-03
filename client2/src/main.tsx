import React from "react";
import ReactDOM from "react-dom/client";
import { Menu } from "./Menu";
import { Table } from "./Table";
import { Playground } from "./Playground";
import { CensorDemoPage } from "./CensorDemo";
import { NoUiPage } from "./NoUi";
import { BrandBadge } from "./BrandBadge";
import { SolitaireGame } from "./SolitaireGame";
import { CrossadeGame } from "./CrossadeGame";
import { routePath } from "./nav";
import "./theme.css";

// client2 — новый автономный клиент, ЦЕЛИКОМ на канвасе. Роут по пути ОТНОСИТЕЛЬНО базы
// (в проде приложение под /v2/): playground — песочница, table — стол, motion — стенд анимаций
// (испытываем движущиеся объекты/эффекты), no-ui — дебаг-стенд чистой логики без канваса,
// solitaire — «Косынка» (issue #99), crossade — многопользовательский стол (CROSSADE-DESIGN.md),
// иначе — главное меню.
const rel = routePath();
const view = rel.startsWith("playground") ? (
  <Playground />
) : rel.startsWith("solitaire") ? (
  <SolitaireGame />
) : rel.startsWith("crossade") ? (
  <CrossadeGame />
) : rel.startsWith("motion") ? (
  <CensorDemoPage />
) : rel.startsWith("no-ui") ? (
  <NoUiPage />
) : rel.startsWith("table") ? (
  <Table />
) : (
  <Menu />
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrandBadge />
    {view}
  </React.StrictMode>
);
