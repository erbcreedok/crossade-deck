import React from "react";
import ReactDOM from "react-dom/client";
import { Menu } from "./Menu";
import { Table } from "./Table";
import { FreeDesk } from "./FreeDesk";
import { CensorDemoPage } from "./CensorDemo";
import { BrandBadge } from "./BrandBadge";
import { routePath } from "./nav";
import "./theme.css";

// client2 — новый автономный клиент, ЦЕЛИКОМ на канвасе. Роут по пути ОТНОСИТЕЛЬНО базы
// (в проде приложение под /v2/): free-desk — песочница, table — стол, motion — стенд анимаций
// (испытываем движущиеся объекты/эффекты), иначе — главное меню.
const rel = routePath();
const view = rel.startsWith("free-desk") ? <FreeDesk /> : rel.startsWith("motion") ? <CensorDemoPage /> : rel.startsWith("table") ? <Table /> : <Menu />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrandBadge />
    {view}
  </React.StrictMode>
);
