import React from "react";
import ReactDOM from "react-dom/client";
import { Table } from "./Table";
import { FreeDesk } from "./FreeDesk";
import "./theme.css";

// client2 — новый автономный клиент стола (Путь 2: единый пул + настоящий drag-and-drop).
// Простой роут по пути: /free-desk — UI-kit-сторибук на канвасе, иначе — стол.
const view = window.location.pathname.startsWith("/free-desk") ? <FreeDesk /> : <Table />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{view}</React.StrictMode>
);
