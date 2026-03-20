import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TerminalPage } from "./TerminalPage";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

const isTerminalPage = window.location.pathname === "/terminal";

ReactDOM.createRoot(root).render(
  <React.StrictMode>{isTerminalPage ? <TerminalPage /> : <App />}</React.StrictMode>,
);
