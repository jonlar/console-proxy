import { useEffect } from "react";
import { LogViewer } from "./LogViewer";

export function LogViewerPage() {
  const params = new URLSearchParams(window.location.search);
  const uuid = params.get("uuid") ?? "";
  const portName = params.get("portName") ?? "Unknown";

  useEffect(() => {
    if (localStorage.getItem("darkMode") === "true") {
      document.body.classList.add("dark-mode");
    }
  }, []);

  useEffect(() => {
    if (!uuid) {
      window.location.replace("/");
      return;
    }
    document.title = `Logs: ${portName} — Console Proxy`;
  }, [uuid, portName]);

  if (!uuid) return null;

  return <LogViewer uuid={uuid} portName={portName} fullPage onClose={() => window.close()} />;
}
