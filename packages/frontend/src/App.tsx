import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { LogViewer } from "./LogViewer";
import { TerminalComponent } from "./Terminal";
import { client } from "./api";
import "./App.css";

// Cookie helpers
function setCookie(name: string, value: string, days = 365) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

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

const queryClient = new QueryClient();

// Translate technical error codes to user-friendly messages
function translateError(error: string): string {
  if (error.includes("ECONNREFUSED")) {
    return "Connection refused";
  }
  if (error.includes("EHOSTUNREACH")) {
    return "Host unreachable";
  }
  if (error.includes("ENETUNREACH")) {
    return "Network unreachable";
  }
  if (error.includes("ENOTFOUND")) {
    return "Host not found";
  }
  if (error.includes("ETIMEDOUT")) {
    return "Connection timeout";
  }
  if (error.includes("Connection timeout")) {
    return "Connection timeout";
  }
  if (error.includes("ECONNRESET")) {
    return "Connection reset";
  }
  if (error.includes("EPIPE")) {
    return "Connection broken";
  }
  // Fallback for unknown errors
  return "Connection error";
}

type PortType = "remote";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type Port = {
  id: string;
  uuid: string;
  type: "remote";
  name: string;
  host: string;
  port: number;
  group?: string;
  description?: string;
  connectionStatus?: ConnectionStatus;
  lastConnected?: string;
  lastError?: string;
};

function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPort, setEditingPort] = useState<Port | null>(null);
  // @ts-ignore - portType is used in form submission handlers
  const [portType, setPortType] = useState<PortType>("remote");
  const [activeGroup, setActiveGroup] = useState<string>("Default");
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [tableFilter, setTableFilter] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{
    portId: string;
    portName: string;
  } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [userName, setUserName] = useState<string | null>(() => getCookie("userName"));
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [identityInput, setIdentityInput] = useState("");
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [activeTerminal, setActiveTerminal] = useState<string | null>(null);
  const [logViewerPort, setLogViewerPort] = useState<{
    uuid: string;
    name: string;
  } | null>(null);
  const [terminalSessions, setTerminalSessions] = useState<
    Map<
      string,
      {
        clientId: string;
        timestamp: number;
        userAgent?: string;
        userName?: string;
      }
    >
  >(new Map());
  const [takeoverConfirm, setTakeoverConfirm] = useState<{
    port: Port;
  } | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved === "true";
  });

  // Apply dark mode class to body
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
    localStorage.setItem("darkMode", String(darkMode));
  }, [darkMode]);

  const { data, isLoading, error } = client.getPorts.useQuery(
    ["ports", refreshKey],
    {},
    {
      queryKey: ["ports", refreshKey],
      refetchInterval: false,
    },
  );

  const addMutation = client.addPort.useMutation();
  const updateMutation = client.updatePort.useMutation();
  const deleteMutation = client.deletePort.useMutation();

  // WebSocket connection
  useEffect(() => {
    const wsUrl = import.meta.env.PROD
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
      : "ws://localhost:3001/ws";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "ports_updated") {
          console.log("Ports updated, refreshing...");
          setRefreshKey((k) => k + 1);
        } else if (message.type === "connection_status_changed") {
          console.log("Connection status changed:", message.data);
          setRefreshKey((k) => k + 1);
        } else if (message.type === "terminal_status_changed") {
          console.log("🔄 Terminal status changed:", message.data);
          // Update terminal session status
          setTerminalSessions((prev) => {
            const newMap = new Map(prev);
            if (message.data.activeSession) {
              console.log(
                "🔒 Setting session for port",
                message.data.portId,
                ":",
                message.data.activeSession,
              );
              newMap.set(message.data.portId, message.data.activeSession);
            } else {
              console.log("🔓 Clearing session for port", message.data.portId);
              newMap.delete(message.data.portId);
            }
            console.log("📊 New session map size:", newMap.size);
            return newMap;
          });
        } else if (message.type === "port_data") {
          console.log("Port data received:", message.data);
          // Handle incoming port data if needed
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setWsConnected(false);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      ws.close();
    };
  }, []);

  function openTerminal(port: Port) {
    if (!userName) {
      setShowIdentityModal(true);
      return;
    }
    setActiveTerminal(port.id);
  }

  function handleTakeoverTerminal(port: Port) {
    if (!userName) {
      setShowIdentityModal(true);
      return;
    }
    setTakeoverConfirm({ port });
  }

  function confirmTakeover() {
    if (takeoverConfirm) {
      setActiveTerminal(`${takeoverConfirm.port.id}|takeover`);
      setTakeoverConfirm(null);
    }
  }

  function formatSessionOwner(session: {
    clientId: string;
    timestamp: number;
    userAgent?: string;
    userName?: string;
  }) {
    const timeAgo = Math.floor((Date.now() - session.timestamp) / 1000);
    let timeStr = "";
    if (timeAgo < 60) {
      timeStr = "just now";
    } else if (timeAgo < 3600) {
      timeStr = `${Math.floor(timeAgo / 60)}m ago`;
    } else {
      timeStr = `${Math.floor(timeAgo / 3600)}h ago`;
    }
    const userInfo = session.userName || "Unknown user";
    return `In use by ${userInfo} (${timeStr})`;
  }

  // Show temporary notifications
  useEffect(() => {
    if (addMutation.isSuccess) {
      setNotification({ type: "success", message: "Port added successfully!" });
    }
    if (updateMutation.isSuccess) {
      setNotification({ type: "success", message: "Port updated successfully!" });
    }
    if (deleteMutation.isSuccess) {
      setNotification({ type: "success", message: "Port deleted successfully!" });
    }
    if (addMutation.isError) {
      setNotification({
        type: "error",
        message: `Failed to add port: ${addMutation.error.toString()}`,
      });
    }
    if (updateMutation.isError) {
      setNotification({
        type: "error",
        message: `Failed to update port: ${updateMutation.error.toString()}`,
      });
    }
    if (deleteMutation.isError) {
      setNotification({
        type: "error",
        message: `Failed to delete port: ${deleteMutation.error.toString()}`,
      });
    }
  }, [
    addMutation.isSuccess,
    addMutation.isError,
    updateMutation.isSuccess,
    updateMutation.isError,
    deleteMutation.isSuccess,
    deleteMutation.isError,
    addMutation.error,
    updateMutation.error,
    deleteMutation.error,
  ]);

  // Clear notifications after 3 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleAddPort = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      const group = formData.get("group") as string;
      const body = {
        type: "remote" as const,
        name: formData.get("name") as string,
        host: formData.get("host") as string,
        port: Number.parseInt(formData.get("port") as string, 10),
        group: group || undefined,
        description: formData.get("description") as string,
      };

      if (editingPort) {
        await updateMutation.mutateAsync({
          params: { id: editingPort.id },
          body,
        });
        setEditingPort(null);
      } else {
        await addMutation.mutateAsync({ body });
      }

      setShowAddForm(false);
      setPortType("remote");
      e.currentTarget.reset();
    } catch (error) {
      console.error("Failed to save port:", error);
    }
  };

  const handleEditPort = (port: Port) => {
    setEditingPort(port);
    setPortType(port.type);
    setShowAddForm(true);
  };

  const handleCancelEdit = () => {
    setEditingPort(null);
    setShowAddForm(false);
    setPortType("remote");
  };

  // Build hierarchical group structure
  const buildGroupHierarchy = (groups: string[]) => {
    const hierarchy: { [key: string]: Set<string> } = {};
    const allPaths = new Set<string>();

    for (const group of groups) {
      if (!group) continue;

      const parts = group.split("/");
      for (let i = 0; i < parts.length; i++) {
        const path = parts.slice(0, i + 1).join("/");
        allPaths.add(path);

        if (i > 0) {
          const parent = parts.slice(0, i).join("/");
          if (!hierarchy[parent]) {
            hierarchy[parent] = new Set();
          }
          hierarchy[parent].add(path);
        }
      }
    }

    return { hierarchy, allPaths: Array.from(allPaths).sort() };
  };

  const isGroupOrDescendant = (portGroup: string | undefined, activeGroup: string): boolean => {
    const effectiveGroup = portGroup || "Default";
    if (effectiveGroup === activeGroup) return true;
    return effectiveGroup.startsWith(`${activeGroup}/`);
  };

  const handleDeletePort = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteMutation.mutateAsync({
        params: { id: deleteConfirm.portId },
        body: { confirmation: confirmText },
      });
      setDeleteConfirm(null);
      setConfirmText("");
    } catch (error) {
      console.error("Failed to delete port:", error);
    }
  };

  return (
    <div className="app">
      {activeTerminal && wsRef.current && userName && (
        <TerminalComponent
          portId={activeTerminal.includes("|") ? activeTerminal.split("|")[0] : activeTerminal}
          portName={
            data?.body?.ports?.find(
              (p: Port) =>
                p.id ===
                (activeTerminal.includes("|") ? activeTerminal.split("|")[0] : activeTerminal),
            )?.name || "Unknown"
          }
          takeover={activeTerminal.includes("|takeover")}
          ws={wsRef.current}
          userName={userName}
          onClose={() => setActiveTerminal(null)}
        />
      )}

      <div className="header">
        <div className="title-section">
          <div className="title-row">
            <h1 className="main-title">
              <span className="title-icon">⚡</span>
              Console Proxy
            </h1>
            <span className="version-badge" title={`Version: ${__APP_VERSION__}`}>
              {__APP_VERSION__}
            </span>
            <a
              href="https://github.com/jonlar/console-proxy"
              target="_blank"
              rel="noopener noreferrer"
              className="github-link"
              title="View on GitHub"
            >
              <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
                <title>GitHub</title>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
          </div>
          <p className="subtitle">Manage and monitor console port connections</p>
        </div>
        <div className="header-right">
          <button
            type="button"
            onClick={() => setDarkMode(!darkMode)}
            className="theme-toggle"
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
          {userName && (
            <div className="user-indicator">
              <span className="user-icon">👤</span>
              <span className="user-name">{userName}</span>
              <button
                type="button"
                className="user-edit-btn"
                onClick={() => {
                  setIdentityInput(userName);
                  setShowIdentityModal(true);
                }}
                title="Edit username"
              >
                ✏️
              </button>
            </div>
          )}
          <div className="status-indicator">
            <span className={`status-dot ${wsConnected ? "connected" : "disconnected"}`} />
            <span className="status-text">{wsConnected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
      </div>

      {notification && (
        <div className={`notification ${notification.type}`}>{notification.message}</div>
      )}

      {showAddForm && (
        <div className="add-form-section">
          <h2>{editingPort ? "Edit Port" : "Add New Port"}</h2>
          <form onSubmit={handleAddPort} className="add-form">
            <div className="form-row">
              <label htmlFor="name">
                Name:
                <input
                  type="text"
                  id="name"
                  name="name"
                  defaultValue={editingPort?.name}
                  required
                />
              </label>
            </div>

            <div className="form-row">
              <label htmlFor="host">
                Host:
                <input
                  type="text"
                  id="host"
                  name="host"
                  placeholder="192.168.1.100"
                  defaultValue={editingPort?.type === "remote" ? editingPort.host : ""}
                  required
                />
              </label>
            </div>
            <div className="form-row">
              <label htmlFor="port">
                Port:
                <input
                  type="number"
                  id="port"
                  name="port"
                  defaultValue={editingPort?.type === "remote" ? editingPort.port : 4001}
                  required
                />
              </label>
            </div>

            <div className="form-row">
              <label htmlFor="group">
                Group (optional):
                <input type="text" id="group" name="group" defaultValue={editingPort?.group} />
              </label>
            </div>

            <div className="form-row">
              <label htmlFor="description">
                Description (optional):
                <input
                  type="text"
                  id="description"
                  name="description"
                  defaultValue={editingPort?.description}
                />
              </label>
            </div>

            <div className="form-actions">
              <div className="form-main-actions">
                <button
                  type="submit"
                  disabled={addMutation.isPending || updateMutation.isPending}
                  className="add-port-btn"
                >
                  {addMutation.isPending || updateMutation.isPending ? (
                    <>
                      <span className="btn-icon">⏳</span>
                      {editingPort ? "Updating..." : "Adding..."}
                    </>
                  ) : (
                    <>
                      <span className="btn-icon">✓</span>
                      Ok
                    </>
                  )}
                </button>
                <button type="button" onClick={handleCancelEdit} className="cancel-btn">
                  <span className="btn-icon">✕</span>
                  Cancel
                </button>
              </div>
              {editingPort && (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirm({ portId: editingPort.id, portName: editingPort.name });
                    setShowAddForm(false);
                    setEditingPort(null);
                  }}
                  className="btn-danger"
                >
                  🗑️ Delete
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {isLoading && <p>Loading...</p>}
      {error && <p className="error">Error: {error.toString()}</p>}

      {data?.status === 200 && (
        <div className="data-section">
          <div className="section-header">
            <div className="header-left">
              <div className="view-toggle">
                <button
                  type="button"
                  className={`view-btn ${viewMode === "table" ? "active" : ""}`}
                  onClick={() => setViewMode("table")}
                  title="Table view"
                >
                  ☰
                </button>
                <button
                  type="button"
                  className={`view-btn ${viewMode === "cards" ? "active" : ""}`}
                  onClick={() => setViewMode("cards")}
                  title="Card view"
                >
                  ▦
                </button>
              </div>
            </div>
            {!showAddForm && (
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="add-port-btn"
              >
                <span className="btn-icon">+</span>
                Add Port
              </button>
            )}
          </div>

          {data.body.ports.length === 0 ? (
            <p className="no-ports">No ports configured. Add a port to get started.</p>
          ) : viewMode === "table" ? (
            <>
              <div className="table-controls">
                <input
                  type="text"
                  className="table-filter"
                  placeholder="Filter by name, group, or description..."
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                />
              </div>
              <div className="ports-table-container">
                <table className="ports-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Group</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th>Session</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.body.ports as Port[])
                      .filter((port) => {
                        if (!tableFilter) return true;
                        const searchStr = tableFilter.toLowerCase();
                        return (
                          port.name.toLowerCase().includes(searchStr) ||
                          (port.group || "").toLowerCase().includes(searchStr) ||
                          (port.description || "").toLowerCase().includes(searchStr)
                        );
                      })
                      .map((port) => (
                        <tr key={port.id}>
                          <td className="port-name-cell">{port.name}</td>
                          <td className="port-group-cell">{port.group || "Default"}</td>
                          <td className="port-description-cell" title={port.description}>
                            {port.description && port.description.length > 50
                              ? `${port.description.substring(0, 50)}...`
                              : port.description || "-"}
                          </td>
                          <td className="port-status-cell">
                            <div
                              className={`connection-status ${port.connectionStatus || "disconnected"}`}
                              title={
                                port.connectionStatus === "error" && port.lastError
                                  ? port.lastError
                                  : undefined
                              }
                            >
                              <span className="status-dot" />
                              <span className="status-text">
                                {port.connectionStatus === "connected" && "Connected"}
                                {port.connectionStatus === "connecting" && "Connecting..."}
                                {port.connectionStatus === "error" &&
                                  (port.lastError ? translateError(port.lastError) : "Error")}
                                {(port.connectionStatus === "disconnected" ||
                                  !port.connectionStatus) &&
                                  "Disconnected"}
                              </span>
                            </div>
                          </td>
                          <td className="port-session-cell">
                            {terminalSessions.has(port.id) ? (
                              <div className="session-info">
                                🔒 {terminalSessions.get(port.id)?.userName || "In Use"}
                              </div>
                            ) : (
                              <span className="session-free">Free</span>
                            )}
                          </td>
                          <td className="port-actions-cell">
                            <div className="table-actions">
                              {port.connectionStatus === "connected" &&
                                (terminalSessions.has(port.id) ? (
                                  <button
                                    type="button"
                                    className="icon-btn takeover-btn"
                                    onClick={() => handleTakeoverTerminal(port)}
                                    title="Take over terminal session"
                                  >
                                    ⚡
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="icon-btn terminal-btn"
                                    onClick={() => openTerminal(port)}
                                    title="Open terminal"
                                  >
                                    💻
                                  </button>
                                ))}
                              <button
                                type="button"
                                className="icon-btn log-btn"
                                onClick={() =>
                                  setLogViewerPort({ uuid: port.uuid, name: port.name })
                                }
                                title="View logs"
                              >
                                📋
                              </button>
                              <button
                                type="button"
                                className="icon-btn edit-btn"
                                onClick={() => handleEditPort(port as Port)}
                                title="Edit port"
                              >
                                ✏️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              {(() => {
                const groups = data.body.ports.map((p) => p.group || "Default");
                const uniqueGroups = Array.from(new Set(groups));
                const { hierarchy, allPaths } = buildGroupHierarchy(uniqueGroups);

                // Get the parts of the currently selected group
                const activeGroupParts = activeGroup.split("/");

                // Build filtered hierarchy based on active selection
                const getFilteredLevels = () => {
                  const levels: string[][] = [];

                  // Level 0: all top-level groups
                  const topLevel = allPaths.filter((path) => !path.includes("/"));
                  if (topLevel.length > 0) levels.push(topLevel);

                  // Subsequent levels: only show children of selected parent
                  for (let i = 0; i < activeGroupParts.length; i++) {
                    const parentPath = activeGroupParts.slice(0, i + 1).join("/");
                    if (hierarchy[parentPath] && hierarchy[parentPath].size > 0) {
                      const childGroups = Array.from(hierarchy[parentPath]);
                      levels.push(childGroups);
                    }
                  }

                  return levels;
                };

                const levels = getFilteredLevels();

                return levels.map((levelGroups, levelIndex) => (
                  <div key={levelGroups[0] || "empty"} className="tabs">
                    {levelGroups.sort().map((group) => {
                      const parts = group.split("/");
                      const label = parts[parts.length - 1];
                      const directCount = data.body.ports.filter(
                        (p) => (p.group || "Default") === group,
                      ).length;
                      const descendantCount = data.body.ports.filter((p) =>
                        (p.group || "Default").startsWith(`${group}/`),
                      ).length;
                      const totalCount = directCount + descendantCount;

                      return (
                        <button
                          key={group}
                          type="button"
                          className={`tab level-${levelIndex} ${activeGroup === group ? "active" : ""}`}
                          onClick={() => setActiveGroup(group)}
                        >
                          {label} ({totalCount})
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}
              <div className="items">
                {(data.body.ports as Port[])
                  .filter((port) => isGroupOrDescendant(port.group, activeGroup))
                  .map((port) => (
                    <div key={port.id} className="item-card">
                      <div className="port-main">
                        <div className="port-title-row">
                          <div className="port-name-section">
                            <h3 className="port-name">{port.name}</h3>
                          </div>
                          <div className="port-indicators">
                            <div
                              className={`connection-status ${port.connectionStatus || "disconnected"}`}
                              title={
                                port.connectionStatus === "error" && port.lastError
                                  ? port.lastError
                                  : undefined
                              }
                            >
                              <span className="status-dot" />
                              <span className="status-text">
                                {port.connectionStatus === "connected" && "Connected"}
                                {port.connectionStatus === "connecting" && "Connecting..."}
                                {port.connectionStatus === "error" &&
                                  (port.lastError ? (
                                    <span className="error-with-details">
                                      {translateError(port.lastError)}
                                    </span>
                                  ) : (
                                    "Connection error"
                                  ))}
                                {(port.connectionStatus === "disconnected" ||
                                  !port.connectionStatus) &&
                                  "Disconnected"}
                              </span>
                            </div>
                            {terminalSessions.has(port.id) ? (
                              <div
                                className="terminal-indicator in-use"
                                title={formatSessionOwner(
                                  terminalSessions.get(port.id) || {
                                    clientId: "",
                                    timestamp: Date.now(),
                                  },
                                )}
                              >
                                🔒 {terminalSessions.get(port.id)?.userName || "In Use"}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {port.description && <p className="port-description">{port.description}</p>}
                      <div className="card-actions">
                        <div className="port-connection-group">
                          <span className={`port-type ${port.type}`}>{port.type}</span>
                          <span className="port-connection">
                            {port.host}:{port.port}
                          </span>
                        </div>
                        <div className="action-buttons">
                          <div className="left-actions">
                            {port.connectionStatus === "connected" && (
                              <div className="terminal-buttons">
                                {terminalSessions.has(port.id) ? (
                                  <button
                                    type="button"
                                    className="icon-btn takeover-btn"
                                    onClick={() => handleTakeoverTerminal(port)}
                                    title="Take over terminal session"
                                  >
                                    ⚡
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="icon-btn terminal-btn"
                                    onClick={() => openTerminal(port)}
                                    title="Open terminal"
                                  >
                                    💻
                                  </button>
                                )}
                              </div>
                            )}
                            <button
                              type="button"
                              className="icon-btn log-btn"
                              onClick={() => setLogViewerPort({ uuid: port.uuid, name: port.name })}
                              title="View logs"
                            >
                              📋
                            </button>
                            <button
                              type="button"
                              className="icon-btn edit-btn"
                              onClick={() => handleEditPort(port as Port)}
                              title="Edit port"
                            >
                              ✏️
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
          <p className="timestamp">Last updated: {data.body.timestamp}</p>
        </div>
      )}

      {deleteConfirm && (
        <div
          className="modal-overlay"
          onClick={() => setDeleteConfirm(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDeleteConfirm(null);
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h2>Confirm Delete</h2>
            <p>
              Are you sure you want to delete <strong>{deleteConfirm.portName}</strong>?
            </p>
            <p>Type the port name to confirm:</p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={deleteConfirm.portName}
            />
            <div className="modal-actions">
              <button
                type="button"
                onClick={handleDeletePort}
                disabled={confirmText !== deleteConfirm.portName || deleteMutation.isPending}
                className="danger"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
              <button type="button" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Takeover Confirmation Modal */}
      {takeoverConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>⚡ Take Over Terminal Session</h3>
            <p>
              {terminalSessions.get(takeoverConfirm.port.id)?.userName || "Someone else"} is
              currently using the terminal for <strong>{takeoverConfirm.port.name}</strong>.
            </p>
            <p>
              Taking over will disconnect their session and grant access to{" "}
              <strong>{userName}</strong>.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setTakeoverConfirm(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="button" onClick={confirmTakeover} className="btn-danger">
                Take Over
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Identity Modal */}
      {showIdentityModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>👤 {userName ? "Edit Your Name" : "What's Your Name?"}</h3>
            <p>{userName ? "Update your name:" : "Please enter your name to continue:"}</p>
            <input
              type="text"
              value={identityInput}
              onChange={(e) => setIdentityInput(e.target.value)}
              placeholder="Your name"
              onKeyDown={(e) => {
                if (e.key === "Enter" && identityInput.trim()) {
                  const name = identityInput.trim();
                  setUserName(name);
                  setCookie("userName", name);
                  setShowIdentityModal(false);
                  setIdentityInput("");
                }
              }}
            />
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setShowIdentityModal(false);
                  setIdentityInput("");
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              {userName && (
                <button
                  type="button"
                  onClick={() => {
                    setUserName(null);
                    setCookie("userName", "");
                    setShowIdentityModal(false);
                    setIdentityInput("");
                  }}
                  className="btn-danger"
                  style={{ marginLeft: 0, marginRight: "auto" }}
                >
                  Clear Name
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (identityInput.trim()) {
                    const name = identityInput.trim();
                    setUserName(name);
                    setCookie("userName", name);
                    setShowIdentityModal(false);
                    setIdentityInput("");
                  }
                }}
                disabled={!identityInput.trim()}
                className="btn"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {logViewerPort && (
        <LogViewer
          uuid={logViewerPort.uuid}
          portName={logViewerPort.name}
          onClose={() => setLogViewerPort(null)}
        />
      )}

      <footer className="footer">
        <p className="copyright">© {new Date().getFullYear()} Jonas Larsson. Licensed under MIT.</p>
      </footer>
    </div>
  );
}

function AppWithProvider() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

export default AppWithProvider;
