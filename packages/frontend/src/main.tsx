import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LogViewerPage } from "./LogViewerPage";
import { TerminalPage } from "./TerminalPage";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

const { pathname } = window.location;

let page: React.ReactNode;
if (pathname === "/terminal") {
  page = <TerminalPage />;
} else if (pathname === "/logs") {
  page = <LogViewerPage />;
} else {
  page = <App />;
}

ReactDOM.createRoot(root).render(<React.StrictMode>{page}</React.StrictMode>);
