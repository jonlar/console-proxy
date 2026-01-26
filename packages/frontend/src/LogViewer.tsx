import { useCallback, useEffect, useRef, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
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
}

export function LogViewer({ uuid, portName, onClose }: LogViewerProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortDescending, setSortDescending] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchLogs = useCallback(
    async (
      start?: Date | null,
      end?: Date | null,
      search?: string,
      silent = false,
      limit = 1000,
      offset = 0,
      append = false,
    ) => {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        let dateParam: string | undefined;

        if (start && end) {
          // Date range: get all dates between start and end
          const startStr = start.toISOString().slice(0, 10);
          const endStr = end.toISOString().slice(0, 10);
          if (startStr === endStr) {
            dateParam = startStr;
          } else {
            dateParam = `${startStr},${endStr}`;
          }
        } else if (start) {
          dateParam = start.toISOString().slice(0, 10);
        }

        const response = await fetch(
          `/api/logs/${uuid}?${new URLSearchParams({
            ...(dateParam && { date: dateParam }),
            ...(search && { search }),
            limit: limit.toString(),
            offset: offset.toString(),
          })}`,
        );

        if (response.ok) {
          const data = await response.json();
          // Sort entries on frontend (descending by default - most recent first)
          const sorted = [...data.entries].sort((a, b) =>
            sortDescending
              ? b.timestamp.localeCompare(a.timestamp)
              : a.timestamp.localeCompare(b.timestamp),
          );

          if (append) {
            setEntries((prev) => [...prev, ...sorted]);
          } else {
            setEntries(sorted);
          }

          setAvailableDates(data.availableDates);
          setHasMore(data.hasMore);
          setTotal(data.total);
        } else if (response.status === 404) {
          setError("No logs found for this port");
          setEntries([]);
          setAvailableDates([]);
          setHasMore(false);
          setTotal(0);
        } else {
          setError("Failed to fetch logs");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [uuid, sortDescending],
  );

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    fetchLogs(startDate, endDate, searchTerm || undefined, false, 1000, entries.length, true);
  }, [hasMore, loading, fetchLogs, startDate, endDate, searchTerm, entries.length]);

  // Handle scroll for infinite loading
  useEffect(() => {
    const container = logContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Load more when scrolled near bottom (within 200px)
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadMore();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [loadMore]);

  const toggleSortOrder = () => {
    setSortDescending(!sortDescending);
    // Re-sort existing entries
    setEntries([...entries].reverse());
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: Only run on mount
  useEffect(() => {
    // Load today by default
    const today = new Date();
    setStartDate(today);
    setEndDate(today);
    fetchLogs(today, today);

    // Focus search input on mount
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Auto-filter when searchTerm changes (with debouncing)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (startDate && endDate) {
        fetchLogs(startDate, endDate, searchTerm || undefined);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, startDate, endDate, fetchLogs]);

  // Maintain focus on search input after filtering updates
  // biome-ignore lint/correctness/useExhaustiveDependencies: We need entries to refocus after fetch completes
  useEffect(() => {
    if (searchInputRef.current && searchTerm) {
      searchInputRef.current.focus();
    }
  }, [entries, searchTerm]);

  // WebSocket connection for live updates
  useEffect(() => {
    // Only connect if viewing today's logs
    const today = new Date().toISOString().slice(0, 10);
    const startStr = startDate?.toISOString().slice(0, 10);
    const endStr = endDate?.toISOString().slice(0, 10);
    const viewingToday = startStr === today && endStr === today;

    if (!viewingToday || searchTerm) {
      setIsLiveMode(false);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    setIsLiveMode(true);

    // Connect to WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Subscribe to logs for this UUID
      ws.send(JSON.stringify({ type: "subscribe_logs", uuid }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "log_entry" && message.data?.uuid === uuid) {
          const entry = message.data.entry;
          // Add new entry to the list
          setEntries((prev) => {
            // Check if we're in descending mode (newest first)
            if (sortDescending) {
              // Add to beginning
              return [entry, ...prev];
            }
            // Add to end
            return [...prev, entry];
          });
          setTotal((prev) => prev + 1);
        }
      } catch (error) {
        console.error("Error handling log update:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      // WebSocket closed
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "unsubscribe_logs", uuid }));
      }
      ws.close();
      wsRef.current = null;
    };
  }, [uuid, startDate, endDate, searchTerm, sortDescending]);

  // Auto-refresh logs every 5 seconds when not in live mode
  useEffect(() => {
    if (isLiveMode) {
      return; // Don't poll when using WebSocket
    }

    const interval = setInterval(() => {
      if (startDate && endDate) {
        fetchLogs(startDate, endDate, searchTerm || undefined, true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [startDate, endDate, searchTerm, fetchLogs, isLiveMode]);

  const handleDateChange = (dates: [Date | null, Date | null]) => {
    const [start, end] = dates;
    setStartDate(start);
    setEndDate(end);
    if (start && end) {
      fetchLogs(start, end, searchTerm || undefined);
    }
  };

  const setToday = () => {
    const today = new Date();
    setStartDate(today);
    setEndDate(today);
    fetchLogs(today, today, searchTerm || undefined);
  };

  const setLastWeek = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    setStartDate(start);
    setEndDate(end);
    fetchLogs(start, end, searchTerm || undefined);
  };

  const formatTimestamp = (timestamp: string) => {
    // Show full ISO timestamp: YYYY-MM-DD HH:MM:SS.ms
    try {
      const [datePart, timePart] = timestamp.split("T");
      if (datePart && timePart) {
        const parts = timePart.split(".");
        if (parts.length >= 2) {
          const time = parts[0];
          const ms = parts[1].substring(0, 3);
          return `${datePart} ${time}.${ms}`;
        }
        return `${datePart} ${parts[0]}`;
      }
    } catch {
      // Fallback to original
    }
    return timestamp;
  };

  const formatData = (data: string) => {
    // Decode escaped characters
    try {
      return JSON.parse(`"${data}"`);
    } catch {
      return data;
    }
  };

  const stripAnsiCodes = (text: string) => {
    // Remove ANSI escape sequences and control characters
    return text
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "") // ANSI CSI sequences
      .replace(/\x1b[()][AB012]/g, "") // Character set selection
      .replace(/\x1b[=>]/g, "") // Keypad modes
      .replace(/\x1b[78]/g, "") // Save/restore cursor
      .replace(/\x9b[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "") // CSI sequences
      .replace(/\x00/g, "") // NULL
      .replace(/\x07/g, "") // BELL
      .replace(/\x08/g, "") // Backspace
      .replace(/\x7f/g, "") // DEL
      .replace(/\r/g, ""); // Carriage return
  };

  return (
    <div className="log-viewer-overlay">
      <div className="log-viewer-modal">
        <div className="log-viewer-header">
          <h2>Logs: {portName}</h2>
          <button type="button" className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="log-viewer-controls">
          <div className="control-group date-range-group">
            <span className="label">Date Range:</span>
            <DatePicker
              selectsRange
              startDate={startDate}
              endDate={endDate}
              onChange={handleDateChange}
              dateFormat="yyyy-MM-dd"
              maxDate={availableDates[0] ? new Date(`${availableDates[0]}T00:00:00`) : new Date()}
              minDate={
                availableDates[availableDates.length - 1]
                  ? new Date(`${availableDates[availableDates.length - 1]}T00:00:00`)
                  : undefined
              }
              disabled={loading || availableDates.length === 0}
              placeholderText="Select date range"
              isClearable
            >
              <div className="date-picker-quick-buttons">
                <button type="button" onClick={setToday} disabled={loading} className="range-btn">
                  Today
                </button>
                <button
                  type="button"
                  onClick={setLastWeek}
                  disabled={loading}
                  className="range-btn"
                >
                  Last 7 Days
                </button>
              </div>
            </DatePicker>
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

        {loading && <div className="log-loading">Loading logs...</div>}

        {error && <div className="log-error">{error}</div>}

        {!loading && !error && entries.length === 0 && (
          <div className="log-empty">
            {searchTerm ? "No logs match your search criteria" : "No logs available for this date"}
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="log-viewer-content" ref={logContainerRef}>
            <table className="log-table">
              <thead>
                <tr>
                  <th className="log-direction">Dir</th>
                  <th className="log-time">
                    <button type="button" className="sortable" onClick={toggleSortOrder}>
                      Time {sortDescending ? "↑" : "↓"}
                    </button>
                  </th>
                  <th className="log-data">Data</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr
                    key={`${entry.timestamp}-${index}`}
                    className={`log-entry log-${entry.direction}`}
                  >
                    <td className="log-direction">
                      <span className={`direction-badge direction-${entry.direction}`}>
                        {entry.direction === "in" ? "<" : ">"}
                      </span>
                    </td>
                    <td className="log-time">{formatTimestamp(entry.timestamp)}</td>
                    <td className="log-data">
                      <pre>{stripAnsiCodes(formatData(entry.data))}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <div className="log-loading-more">
                {loading ? "Loading more..." : "Scroll for more"}
              </div>
            )}
          </div>
        )}

        <div className="log-viewer-footer">
          <div className="log-stats">
            {!loading && !error && (
              <>
                <span>
                  Showing {entries.length} of {total} entries
                </span>
                {isLiveMode && <span className="live-indicator">🔴 LIVE</span>}
                {searchTerm && <span className="search-indicator">Filtered results</span>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
