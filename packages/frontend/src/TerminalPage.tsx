import { useEffect, useRef, useState } from "react";
import { TerminalComponent } from "./Terminal";

function getCookie(name: string): string | null {
  const nameEQ = `${name}=`;
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === " ") c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

export function TerminalPage() {
  const params = new URLSearchParams(window.location.search);
  const portId = params.get("portId") ?? "";
  const portName = params.get("portName") ?? "Unknown";
  const takeover = params.get("takeover") === "true";

  const userName = getCookie("userName");

  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsUnmountedRef = useRef(false);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!userName) {
      window.location.replace("/");
      return;
    }
    if (!portId) {
      window.location.replace("/");
      return;
    }

    wsUnmountedRef.current = false;

    function connect() {
      const wsUrl = import.meta.env.PROD
        ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
        : "ws://localhost:3001/ws";
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log("WebSocket connected");
        setWs(socket);
      };

      socket.onclose = () => {
        console.log("WebSocket disconnected");
        setWs(null);
        if (!wsUnmountedRef.current) {
          wsReconnectTimerRef.current = setTimeout(connect, 10000);
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    }

    connect();

    return () => {
      wsUnmountedRef.current = true;
      if (wsReconnectTimerRef.current !== null) {
        clearTimeout(wsReconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [portId, userName]);

  useEffect(() => {
    if (portName) {
      document.title = `${portName} — Console Proxy`;
    }
  }, [portName]);

  if (!userName || !portId) {
    return null;
  }

  if (!ws) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#1a1a1a",
          color: "#ffffff",
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          fontSize: "14px",
        }}
      >
        Connecting…
      </div>
    );
  }

  return (
    <TerminalComponent
      portId={portId}
      portName={portName}
      takeover={takeover}
      ws={ws}
      userName={userName}
      onClose={() => window.close()}
      fullPage
    />
  );
}
