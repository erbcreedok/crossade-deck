import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Path2Demo } from "./Path2Demo";
import { sessionEntry } from "./sessionEntry";
import "./theme.css";

// СИНХРОННО, до первого рендера: считать код переноса/приглашение из URL и сразу вычистить
// адрес — код восстановления не должен оставаться в урле ни на кадр (кэшируется, дальше
// useAccount/App читают тот же результат).
sessionEntry();

// POC Пути 2 живёт за #path2 — обычное приложение не трогает (см. PATH2.md / Path2Demo).
const isPath2Demo = window.location.hash === "#path2";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isPath2Demo ? <Path2Demo /> : <App />}</React.StrictMode>
);
