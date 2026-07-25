import React from "react";
import ReactDOM from "react-dom/client";
import { Menu } from "./Menu";
import { Table } from "./Table";
import { FreeDesk } from "./FreeDesk";
import "./theme.css";

// client2 — новый автономный клиент, ЦЕЛИКОМ на канвасе. Простой роут по пути:
//   /free-desk — песочница (UI-kit), /table — стол, иначе — главное меню.
const path = window.location.pathname;
const view = path.startsWith("/free-desk") ? <FreeDesk /> : path.startsWith("/table") ? <Table /> : <Menu />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{view}</React.StrictMode>
);
