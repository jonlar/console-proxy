import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

interface TerminalComponentProps {
  portId: string;
  portName: string;
  takeover?: boolean;
  ws: WebSocket;
  userName: string;
  onClose: () => void;
}

export function TerminalComponent({
  portId,
  portName,
  takeover,
  ws,
  userName,
  onClose,
}: TerminalComponentProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const accessGrantedShown = useRef<boolean>(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ws object is stable and shouldn't trigger re-renders
  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      disableStdin: false,
      theme: {
        background: "#1a1a1a",
        foreground: "#ffffff",
        cursor: "#ffffff",
      },
    });

    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(terminalRef.current);

    // Store references
    terminalInstance.current = terminal;
    fitAddon.current = fit;

    // Fit terminal to container and focus
    setTimeout(() => {
      fit.fit();
      terminal.focus();
    }, 100);

    // Use shared WebSocket connection
    const handleWsMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);

        // Only process messages for this terminal
        if (message.data?.portId && message.data.portId !== portId) {
          return;
        }

        if (message.type === "terminal_access_denied" && message.data.portId === portId) {
          terminal.writeln(`\x1b[31m● Access denied: ${message.data.reason}\x1b[0m`);
          terminal.writeln("\x1b[33m● Someone else is using this terminal\x1b[0m");
          return;
        }

        if (message.type === "terminal_access_granted" && message.data.portId === portId) {
          if (!accessGrantedShown.current) {
            terminal.writeln(
              `\x1b[32m● Terminal access granted${takeover ? " (session taken over)" : ""}\x1b[0m`,
            );
            accessGrantedShown.current = true;
          }
        }

        if (message.type === "terminal_taken_over" && message.data.portId === portId) {
          const newOwnerName = message.data.newOwner?.userName || "another user";
          terminal.writeln(`\x1b[31m● Your session has been taken over by ${newOwnerName}\x1b[0m`);
          terminal.writeln("\x1b[33m● You can close this window\x1b[0m");
          // Disable terminal input
          terminal.options.disableStdin = true;
          return;
        }

        if (message.type === "connection_status_changed" && message.data.portId === portId) {
          const status = message.data.connectionInfo.status;
          if (status === "connected") {
            terminal.writeln(`\x1b[32m● Connected to ${portName}\x1b[0m`);
          } else if (status === "error" || status === "disconnected") {
            const error = message.data.connectionInfo.lastError || "Connection lost";
            terminal.writeln(`\x1b[31m● ${error}\x1b[0m`);
          }
        } else if (message.type === "port_data" && message.data.portId === portId) {
          // Write data exactly as received from telnet server
          terminal.write(message.data.data);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    };

    // Add event listener to shared WebSocket
    ws.addEventListener("message", handleWsMessage);

    // Show initial message
    terminal.writeln(`\x1b[33m● Checking connection to ${portName}...\x1b[0m`);

    // Send terminal open message
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "terminal_open",
          portId: portId,
          takeover: takeover || false,
          userAgent: navigator.userAgent,
          userName: userName,
        }),
      );
    }

    // Handle user input - don't echo locally, let the server handle echo
    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "send_data",
            portId: portId,
            data: data,
          }),
        );
      }
    });

    // Cleanup function
    return () => {
      // Send close message before cleanup
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "terminal_close",
            portId: portId,
          }),
        );
      }

      // Remove event listener
      ws.removeEventListener("message", handleWsMessage);

      terminal.dispose();
    };
  }, [portId, portName, takeover]);

  return (
    <div className="terminal-overlay">
      <div className="terminal-container">
        <div className="terminal-header">
          <span className="terminal-title">💻 {portName}</span>
          <button type="button" className="terminal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="terminal-content" ref={terminalRef} />
      </div>
    </div>
  );
}
