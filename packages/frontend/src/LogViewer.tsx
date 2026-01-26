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
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

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
  }, [fetchLogs]);

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

  // Auto-refresh logs every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (startDate && endDate) {
        fetchLogs(startDate, endDate, searchTerm || undefined, true);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [startDate, endDate, searchTerm, fetchLogs]);

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
                      <pre>{formatData(entry.data)}</pre>
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
                {searchTerm && <span className="search-indicator">Filtered results</span>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
