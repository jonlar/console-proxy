import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import "./LogViewer.css";

interface LogEntry {
  timestamp: string;
  direction: "in" | "out";
  data: string;
}

interface LogViewerProps {
  uuid: string;
  portName: string;
  onClose: () => void;
  fullPage?: boolean;
}

const MAX_ENTRIES = 500;

function formatEntryTimestamp(iso: string): string {
  // "2026-03-20T14:35:22.123Z" → "2026-03-20 14:35:22"
  try {
    const [datePart, timePart] = iso.split("T");
    if (datePart && timePart) {
      return `${datePart} ${timePart.substring(0, 8)}`;
    }
  } catch {
    // fall through
  }
  return iso;
}

export function LogViewer({ uuid, portName, onClose, fullPage = false }: LogViewerProps) {
  const now = () => new Date();
  const defaultFrom = () => {
    const d = now();
    d.setHours(d.getHours() - 12);
    return d;
  };

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [fromDatetime, setFromDatetime] = useState<Date>(defaultFrom);
  const [toDatetime, setToDatetime] = useState<Date>(now);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);

  const fetchLogs = useCallback(
    async (from: Date, to: Date, search?: string, silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        // Build date param — may span two calendar days
        const fromDate = from.toISOString().slice(0, 10);
        const toDate = to.toISOString().slice(0, 10);
        const dateParam = fromDate === toDate ? fromDate : `${fromDate},${toDate}`;

        const params = new URLSearchParams({ date: dateParam, limit: "1000" });
        if (search) params.set("search", search);

        const response = await fetch(`/api/logs/${uuid}?${params}`);

        if (response.ok) {
          const data = await response.json();
          const fromIso = from.toISOString();
          const toIso = to.toISOString();

          // Filter by exact datetime range, sort ascending (oldest first)
          let filtered: LogEntry[] = (data.entries as LogEntry[])
            .filter((e) => e.timestamp >= fromIso && e.timestamp <= toIso)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

          // Cap at last MAX_ENTRIES
          const wasTruncated = filtered.length > MAX_ENTRIES;
          if (wasTruncated) {
            filtered = filtered.slice(filtered.length - MAX_ENTRIES);
          }
          setTruncated(wasTruncated);
          setEntries(filtered);
        } else if (response.status === 404) {
          setEntries([]);
          setError(null);
        } else {
          setError("Failed to fetch logs");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [uuid],
  );

  // Load on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only run on mount
  useEffect(() => {
    fetchLogs(fromDatetime, toDatetime);
    if (searchInputRef.current) searchInputRef.current.focus();
  }, []);

  // Debounced search re-fetch
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchLogs(fromDatetime, toDatetime, searchTerm || undefined);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchTerm, fromDatetime, toDatetime, fetchLogs]);

  // WebSocket for live updates — disabled only when a search filter is active
  useEffect(() => {
    const liveEligible = !searchTerm;

    if (!liveEligible) {
      setIsLiveMode(false);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    setIsLiveMode(true);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe_logs", uuid }));
    };

    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 25000);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "log_entry" && message.data?.uuid === uuid) {
          const entry: LogEntry = message.data.entry;
          // Write live entry directly to terminal — avoids the clear+rewrite
          // cycle that the entries-state effect uses, preventing a race where
          // two rapid entries (out then in) cause the second clear to wipe both.
          const terminal = terminalInstance.current;
          if (!terminal) return;
          const ts = formatEntryTimestamp(entry.timestamp);
          const dirColor = entry.direction === "in" ? "\x1b[36m" : "\x1b[33m";
          const dirSymbol = entry.direction === "in" ? "◀" : "▶";
          const reset = "\x1b[0m";
          terminal.write(`${dirColor}${ts} ${dirSymbol}${reset} `);
          try {
            terminal.write(formatData(entry.data));
          } catch {
            terminal.write(entry.data);
          }
          terminal.writeln("");
          terminal.scrollToBottom();
        }
      } catch (err) {
        console.error("Error handling log update:", err);
      }
    };

    ws.onerror = () => {
      /* handled by onclose */
    };
    ws.onclose = () => {
      clearInterval(heartbeatInterval);
    };

    return () => {
      clearInterval(heartbeatInterval);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "unsubscribe_logs", uuid }));
      }
      ws.close();
      wsRef.current = null;
    };
  }, [uuid, searchTerm]);

  const formatData = useCallback((data: string) => {
    try {
      return JSON.parse(`"${data}"`);
    } catch {
      return data;
    }
  }, []);

  // Initialize xterm terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: false,
      fontSize: 13,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", "Courier New", monospace',
      convertEol: true,
      disableStdin: true,
      theme: {
        background: "#0a0a0a",
        foreground: "#e0e0e0",
        cursor: "#ffffff",
        cursorAccent: "#000000",
        selectionBackground: "rgba(255,255,255,0.3)",
      },
      allowTransparency: false,
      rows: 40,
      cols: 120,
    });

    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(terminalRef.current);
    terminalInstance.current = terminal;
    fitAddon.current = fit;

    setTimeout(() => fit.fit(), 100);

    const handleResize = () => {
      fitAddon.current?.fit();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      terminal.dispose();
      terminalInstance.current = null;
      fitAddon.current = null;
    };
  }, []);

  // Re-render entries in terminal whenever entries change
  useEffect(() => {
    const terminal = terminalInstance.current;
    if (!terminal) return;

    terminal.clear();

    for (const entry of entries) {
      const ts = formatEntryTimestamp(entry.timestamp);
      const dirColor = entry.direction === "in" ? "\x1b[36m" : "\x1b[33m";
      const dirSymbol = entry.direction === "in" ? "◀" : "▶";
      const reset = "\x1b[0m";

      terminal.write(`${dirColor}${ts} ${dirSymbol}${reset} `);
      try {
        terminal.write(formatData(entry.data));
      } catch {
        terminal.write(entry.data);
      }
      terminal.writeln("");
    }

    terminal.scrollToBottom();
  }, [entries, formatData]);

  function applyRange(from: Date, to: Date) {
    setFromDatetime(from);
    setToDatetime(to);
    fetchLogs(from, to, searchTerm || undefined);
  }

  function setLast12h() {
    const to = new Date();
    const from = new Date(to.getTime() - 12 * 60 * 60 * 1000);
    applyRange(from, to);
  }

  function setLast24h() {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    applyRange(from, to);
  }

  function setLast7Days() {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    applyRange(from, to);
  }

  function setLastMonth() {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    applyRange(from, to);
  }

  const modal = (
    <div className={fullPage ? "log-viewer-fullpage" : "log-viewer-modal"}>
      <div className="log-viewer-header">
        <h2>Logs: {portName}</h2>
        <button type="button" className="close-button" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="log-viewer-controls">
        <div className="control-group quick-range-buttons">
          <button type="button" className="range-btn" onClick={setLast12h} disabled={loading}>
            Last 12h
          </button>
          <button type="button" className="range-btn" onClick={setLast24h} disabled={loading}>
            Last 24h
          </button>
          <button type="button" className="range-btn" onClick={setLast7Days} disabled={loading}>
            Last 7 days
          </button>
          <button type="button" className="range-btn" onClick={setLastMonth} disabled={loading}>
            Last 30 days
          </button>
        </div>

        <div className="control-group search-group">
          <label htmlFor="search-input">Filter:</label>
          <input
            ref={searchInputRef}
            id="search-input"
            type="text"
            placeholder="Filter logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={loading}
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm("")} disabled={loading}>
              Clear
            </button>
          )}
        </div>
      </div>

      {truncated && !loading && (
        <div className="log-truncated-notice">
          Showing last {MAX_ENTRIES} entries — narrow the time range to see earlier messages
        </div>
      )}

      {loading && <div className="log-loading">Loading logs...</div>}
      {error && <div className="log-error">{error}</div>}
      {!loading && !error && entries.length === 0 && (
        <div className="log-empty">
          {searchTerm ? "No logs match your filter" : "No logs in this time range"}
        </div>
      )}

      <div className="log-viewer-terminal-container">
        <div ref={terminalRef} className="log-viewer-terminal" />
      </div>

      <div className="log-viewer-footer">
        <div className="log-stats">
          {!loading && !error && (
            <>
              <span>{entries.length} entries</span>
              {isLiveMode && <span className="live-indicator">🔴 LIVE</span>}
              {searchTerm && <span className="search-indicator">Filtered</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (fullPage) return modal;
  return <div className="log-viewer-overlay">{modal}</div>;
}
