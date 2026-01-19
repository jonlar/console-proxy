import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  type: PortType;
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
  const [portType, setPortType] = useState<PortType>("remote");
  const [activeGroup, setActiveGroup] = useState<string>("Default");
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
          <h1 className="main-title">
            <span className="title-icon">⚡</span>
            Console Proxy
          </h1>
          <p className="subtitle">Manage and monitor console port connections</p>
        </div>
        <div className="status-indicator">
          <span className={`status-dot ${wsConnected ? "connected" : "disconnected"}`} />
          <span className="status-text">{wsConnected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      {notification && (
        <div className={`notification ${notification.type}`}>{notification.message}</div>
      )}

      {deleteMutation.isSuccess && <p className="success">Port deleted successfully!</p>}

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
                  defaultValue={editingPort?.host}
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
                  defaultValue={editingPort?.port || 4001}
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
          </form>
        </div>
      )}

      {isLoading && <p>Loading...</p>}
      {error && <p className="error">Error: {error.toString()}</p>}

      {data?.status === 200 && (
        <div className="data-section">
          <div className="section-header">
            <h2>Ports</h2>
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
                          {port.type === "remote" && (
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
                          )}
                        </div>
                        {port.description && <p className="port-description">{port.description}</p>}
                      </div>
                      <div className="card-actions">
                        <div className="port-connection-group">
                          <span className={`port-type ${port.type}`}>{port.type}</span>
                          <span className="port-connection">
                            {port.host}:{port.port}
                          </span>
                        </div>
                        <div className="action-buttons">
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
                            className="icon-btn edit-btn"
                            onClick={() => handleEditPort(port as Port)}
                            title="Edit port"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="icon-btn delete-btn"
                            onClick={() =>
                              setDeleteConfirm({ portId: port.id, portName: port.name })
                            }
                            title="Delete port"
                          >
                            🗑️
                          </button>
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
            <h3>👤 Identify Yourself</h3>
            <p>Please enter your name before accessing the terminal:</p>
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
