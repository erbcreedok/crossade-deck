import React from "react";
import ReactDOM from "react-dom/client";
import { Table } from "./Table";
import "./theme.css";

// client2 — новый автономный клиент стола (Путь 2: единый пул + настоящий drag-and-drop).
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Table />
  </React.StrictMode>
);
