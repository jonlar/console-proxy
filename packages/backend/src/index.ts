import { createServer } from "node:http";
import path from "node:path";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import express from "express";
import { type WebSocket, WebSocketServer } from "ws";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ConfigLoader } from "./configLoader";
import { TelnetConnectionManager } from "./connectionManager";
import { contract } from "./contract";
import {
  flushBuffer,
  getLogDates,
  logTraffic,
  readLogs,
  setLogDirectory,
  setMaxLogSize,
} from "./logger";

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option("port", {
    alias: "p",
    type: "number",
    description: "Port to listen on",
    default: process.env.PORT ? Number.parseInt(process.env.PORT) : 3001,
  })
  .option("data-dir", {
    alias: "d",
    type: "string",
    description: "Directory for config and logs",
    default: process.env.DATA_DIR || "../..//",
  })
  .option("max-log-size", {
    alias: "m",
    type: "number",
    description: "Maximum log size in MB per port",
    default: 1,
  })
  .help()
  .parseSync();

const app = express();
const port = argv.port;
const dataDir = argv["data-dir"];
const maxLogSizeMB = argv["max-log-size"];

// Set log directory and max size
setLogDirectory(path.join(dataDir, "logs"));
setMaxLogSize(maxLogSizeMB * 1024 * 1024); // Convert MB to bytes

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: "/ws" });

// Broadcast function to send updates to all connected clients
function broadcastUpdate(type: string, data?: unknown) {
  const message = JSON.stringify({ type, data });
  let sentCount = 0;
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      // 1 = OPEN
      client.send(message);
      sentCount++;
    }
  }
  console.log(`📡 Broadcast ${type} to ${sentCount} clients`);
}

// Track active terminal sessions with ownership
interface ActiveTerminalSession {
  clientId: string;
  timestamp: number;
  userAgent?: string;
  userName?: string;
  ws: WebSocket;
}

const activeTerminals = new Map<string, ActiveTerminalSession>(); // portId -> session owner info

// Extend WebSocket with custom properties
interface ExtendedWebSocket extends WebSocket {
  clientId?: string;
}

// Generate unique client ID
function generateClientId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");
  const clientId = generateClientId();
  (ws as ExtendedWebSocket).clientId = clientId;

  // Send initial state of all active terminal sessions to the new client
  for (const [portId, session] of activeTerminals.entries()) {
    ws.send(
      JSON.stringify({
        type: "terminal_status_changed",
        data: {
          portId,
          activeSession: {
            clientId: session.clientId,
            timestamp: session.timestamp,
            userAgent: session.userAgent,
            userName: session.userName,
          },
        },
      }),
    );
  }

  // Handle terminal messages
  ws.on("message", (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "send_data" && message.portId && message.data) {
        // Send data to telnet connection
        const success = connectionManager.sendData(message.portId, message.data);
        if (!success) {
          console.warn(`⚠ Failed to send data to port ${message.portId}`);
        } else {
          // Log traffic using UUID
          const config = configLoader.getConfig();
          const portIndex = Number.parseInt(message.portId.replace("port-", ""), 10);
          if (!Number.isNaN(portIndex) && config.ports[portIndex]?.uuid) {
            logTraffic(config.ports[portIndex].uuid, "out", message.data);
          }
        }
      } else if (message.type === "get_status" && message.portId) {
        // Send current connection status for the port
        const connectionInfo = connectionManager.getConnectionInfo(message.portId);
        if (connectionInfo) {
          ws.send(
            JSON.stringify({
              type: "connection_status_changed",
              data: { portId: message.portId, connectionInfo },
            }),
          );
        }
      } else if (message.type === "terminal_open" && message.portId) {
        const userInfo = message.userName ? `${message.userName} (${clientId})` : clientId;
        console.log(`📺 Terminal open request for ${message.portId} from ${userInfo}`);

        // Check if port already has an active session
        const existingSession = activeTerminals.get(message.portId);

        if (existingSession) {
          const existingUserInfo = existingSession.userName
            ? `${existingSession.userName} (${existingSession.clientId})`
            : existingSession.clientId;
          console.log(
            `   Existing session found: ${existingUserInfo}, ws state: ${existingSession.ws.readyState}`,
          );
        }

        // Clean up stale session if WebSocket is no longer open
        if (existingSession && existingSession.ws.readyState !== 1) {
          console.log("   🧹 Cleaning up stale session");
          // WebSocket is closed, remove stale session
          activeTerminals.delete(message.portId);
          broadcastUpdate("terminal_status_changed", {
            portId: message.portId,
            activeSession: null,
          });
        }

        // Re-check after cleanup
        const currentSession = activeTerminals.get(message.portId);

        // Allow the same client to reconnect, or block if it's a different client without takeover
        if (currentSession && currentSession.clientId !== clientId && !message.takeover) {
          const ownerInfo = currentSession.userName
            ? `${currentSession.userName} (${currentSession.clientId})`
            : currentSession.clientId;
          console.log(`   ❌ Access denied - port in use by ${ownerInfo}`);
          // Port is in use by another user, deny access
          ws.send(
            JSON.stringify({
              type: "terminal_access_denied",
              data: {
                portId: message.portId,
                owner: currentSession,
                reason: "Port is currently in use by another user",
              },
            }),
          );
          return;
        }

        // If takeover requested, close existing session
        if (existingSession && existingSession.clientId !== clientId && message.takeover) {
          // Notify ONLY the old session owner that they were taken over
          if (existingSession.ws && existingSession.ws.readyState === 1) {
            existingSession.ws.send(
              JSON.stringify({
                type: "terminal_taken_over",
                data: {
                  portId: message.portId,
                  newOwner: {
                    clientId,
                    timestamp: Date.now(),
                    userAgent: message.userAgent,
                    userName: message.userName,
                  },
                },
              }),
            );
          }
        }

        // Grant access to terminal
        console.log("   ✅ Granting terminal access");
        activeTerminals.set(message.portId, {
          clientId,
          timestamp: Date.now(),
          userAgent: message.userAgent,
          userName: message.userName,
          ws: ws,
        });

        // Send success response
        ws.send(
          JSON.stringify({
            type: "terminal_access_granted",
            data: { portId: message.portId },
          }),
        );

        // Broadcast terminal session status
        const session = activeTerminals.get(message.portId);
        broadcastUpdate("terminal_status_changed", {
          portId: message.portId,
          activeSession: session
            ? {
                clientId: session.clientId,
                timestamp: session.timestamp,
                userAgent: session.userAgent,
                userName: session.userName,
              }
            : null,
        });
      } else if (message.type === "terminal_close" && message.portId) {
        console.log(`📺 Terminal close request for ${message.portId} from client ${clientId}`);
        // Remove terminal session only if it belongs to this client
        const session = activeTerminals.get(message.portId);
        if (session) {
          console.log(`   Session owner: ${session.clientId}`);
        }
        if (session && session.clientId === clientId) {
          console.log("   ✅ Removing session");
          activeTerminals.delete(message.portId);

          // Broadcast terminal session status
          broadcastUpdate("terminal_status_changed", {
            portId: message.portId,
            activeSession: null,
          });
        } else {
          console.log("   ⚠️ Session not owned by this client, not removing");
        }
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
    }
  });

  ws.on("close", () => {
    console.log("WebSocket client disconnected");

    // Clean up terminal sessions for this client
    for (const [portId, session] of activeTerminals.entries()) {
      if (session.clientId === clientId) {
        activeTerminals.delete(portId);

        // Broadcast updated terminal status
        broadcastUpdate("terminal_status_changed", {
          portId,
          activeSession: null,
        });
      }
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

// Use config.json in dataDir
const configLoader = new ConfigLoader(`${dataDir}/config.json`);

// Create telnet connection manager
const connectionManager = new TelnetConnectionManager();

// Handle connection status changes
connectionManager.on("statusChanged", (portId, connectionInfo) => {
  broadcastUpdate("connection_status_changed", { portId, connectionInfo });
});

// Handle incoming data from telnet connections
connectionManager.on("data", (portId, data) => {
  // Log traffic using UUID
  const config = configLoader.getConfig();
  const portIndex = Number.parseInt(portId.replace("port-", ""), 10);
  if (!Number.isNaN(portIndex) && config.ports[portIndex]?.uuid) {
    logTraffic(config.ports[portIndex].uuid, "in", data.toString());
  }
  broadcastUpdate("port_data", { portId, data: data.toString() });
});

// Handle connection disconnected - flush any remaining buffered data
connectionManager.on("disconnected", (portId) => {
  const config = configLoader.getConfig();
  const portIndex = Number.parseInt(portId.replace("port-", ""), 10);
  if (!Number.isNaN(portIndex) && config.ports[portIndex]?.uuid) {
    const uuid = config.ports[portIndex].uuid;
    flushBuffer(uuid, "in");
    flushBuffer(uuid, "out");
  }
});

// Load initial configuration
try {
  configLoader.load();

  // Initialize connections for existing remote ports
  const config = configLoader.getConfig();
  let needsSave = false;

  // Add UUIDs to ports that don't have them
  for (const port of config.ports) {
    if (!port.uuid) {
      port.uuid = crypto.randomUUID();
      needsSave = true;
    }
  }

  if (needsSave) {
    configLoader.save(config);
    console.log("Added UUIDs to existing ports");
  }

  for (const [index, port] of config.ports.entries()) {
    if (port.type === "remote") {
      const portId = `port-${index}`;
      connectionManager.connect({
        ...port,
        id: portId,
      });
    }
  }
} catch (error) {
  console.warn("Failed to load initial configuration, will use empty config");
}

const s = initServer();

const router = s.router(contract, {
  getPorts: async () => {
    try {
      const config = configLoader.getConfig();

      const ports = config.ports.map((port, index) => {
        const portId = `port-${index}`;
        const connectionInfo = connectionManager.getConnectionInfo(portId);

        return {
          ...port,
          id: portId,
          connectionStatus: connectionInfo?.status || "disconnected",
          lastConnected: connectionInfo?.lastConnected,
          lastError: connectionInfo?.lastError,
        };
      });

      return {
        status: 200,
        body: {
          ports,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        status: 200,
        body: {
          ports: [],
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
  addPort: async ({ body }) => {
    try {
      const config = configLoader.getConfig();

      // Check if port with same name already exists
      const existingPort = config.ports.find((p) => p.name === body.name);
      if (existingPort) {
        return {
          status: 400,
          body: {
            success: false,
            message: `A port with name "${body.name}" already exists`,
          },
        };
      }

      // Add new port with UUID
      const newPortEntry = {
        ...body,
        uuid: crypto.randomUUID(),
      };
      config.ports.push(newPortEntry);
      configLoader.save(config);

      const newPortId = `port-${config.ports.length - 1}`;
      const newPort = {
        ...newPortEntry,
        id: newPortId,
      };

      // If it's a remote port, start connection
      if (body.type === "remote") {
        connectionManager.connect({
          ...newPortEntry,
          id: newPortId,
        });
      }

      // Broadcast update to all clients
      broadcastUpdate("ports_updated");

      return {
        status: 200,
        body: {
          success: true,
          message: "Port added successfully",
          port: newPort,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        status: 500,
        body: {
          success: false,
          message: `Failed to add port: ${message}`,
        },
      };
    }
  },
  updatePort: async ({ params, body }) => {
    try {
      const config = configLoader.getConfig();

      // Parse port index from ID
      const portIndex = Number.parseInt(params.id.replace("port-", ""), 10);

      if (Number.isNaN(portIndex) || portIndex < 0 || portIndex >= config.ports.length) {
        return {
          status: 404,
          body: {
            success: false,
            message: "Port not found",
          },
        };
      }

      // Check if another port with the same name already exists (excluding current port)
      const existingPort = config.ports.find((p, idx) => p.name === body.name && idx !== portIndex);
      if (existingPort) {
        return {
          status: 400,
          body: {
            success: false,
            message: `A port with name "${body.name}" already exists`,
          },
        };
      }

      // Update port, preserving the UUID
      const existingUuid = config.ports[portIndex].uuid;
      config.ports[portIndex] = {
        ...body,
        uuid: existingUuid,
      };
      configLoader.save(config);

      const updatedPort = {
        ...body,
        uuid: existingUuid,
        id: params.id,
      };

      // Handle connection management for remote ports
      if (body.type === "remote") {
        // Restart connection with new settings
        connectionManager.disconnect(params.id);
        connectionManager.connect({
          ...config.ports[portIndex],
          id: params.id,
        });
      } else {
        // If changed from remote to local, disconnect
        connectionManager.disconnect(params.id);
      }

      // Broadcast update to all clients
      broadcastUpdate("ports_updated");

      return {
        status: 200,
        body: {
          success: true,
          message: "Port updated successfully",
          port: updatedPort,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        status: 500,
        body: {
          success: false,
          message: `Failed to update port: ${message}`,
        },
      };
    }
  },
  deletePort: async ({ params, body }) => {
    try {
      const config = configLoader.getConfig();

      // Parse port index from ID
      const portIndex = Number.parseInt(params.id.replace("port-", ""), 10);

      if (Number.isNaN(portIndex) || portIndex < 0 || portIndex >= config.ports.length) {
        return {
          status: 404,
          body: {
            success: false,
            message: "Port not found",
          },
        };
      }

      const portToDelete = config.ports[portIndex];

      // Verify confirmation text matches port name
      if (body.confirmation !== portToDelete.name) {
        return {
          status: 400,
          body: {
            success: false,
            message: "Confirmation text does not match port name",
          },
        };
      }

      // Remove port
      config.ports.splice(portIndex, 1);
      configLoader.save(config);

      // Disconnect from port if it was a remote connection
      connectionManager.disconnect(params.id);

      // Broadcast update to all clients
      broadcastUpdate("ports_updated");

      return {
        status: 200,
        body: {
          success: true,
          message: `Port "${portToDelete.name}" deleted successfully`,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        status: 500,
        body: {
          success: false,
          message: `Failed to delete port: ${message}`,
        },
      };
    }
  },
  reloadConfig: async () => {
    try {
      const config = configLoader.reload();

      // Broadcast update to all clients
      broadcastUpdate("ports_updated");

      return {
        status: 200,
        body: {
          success: true,
          message: "Configuration reloaded successfully",
          portsCount: config.ports.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        status: 500,
        body: {
          success: false,
          message: `Failed to reload configuration: ${message}`,
        },
      };
    }
  },
  getLogs: async ({ params, query }) => {
    try {
      const { uuid } = params;
      const { date, search, limit, offset } = query;

      // Get available log dates
      const availableDates = getLogDates(uuid);

      if (availableDates.length === 0) {
        return {
          status: 404,
          body: {
            success: false,
            message: `No logs found for UUID ${uuid}`,
          },
        };
      }

      // Use provided date or default to today
      const today = new Date().toISOString().slice(0, 10);
      const currentDate = date || (availableDates.includes(today) ? today : availableDates[0]);

      // Parse pagination parameters
      const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
      const parsedOffset = offset ? Number.parseInt(offset, 10) : undefined;

      // Read log entries with pagination
      const result = readLogs(uuid, currentDate, search, parsedLimit, parsedOffset);

      return {
        status: 200,
        body: {
          success: true,
          entries: result.entries,
          availableDates,
          currentDate,
          total: result.total,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        status: 500,
        body: {
          success: false,
          message: `Failed to fetch logs: ${message}`,
        },
      };
    }
  },
});

app.use(express.json());

createExpressEndpoints(contract, router, app);

// Serve frontend static files in production
if (process.env.NODE_ENV === "production" || process.env.PORT) {
  const frontendPath = path.join(__dirname, "../../frontend/dist");
  app.use(express.static(frontendPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

server.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
  console.log(`WebSocket server running at ws://localhost:${port}/ws`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down server...");
  connectionManager.shutdown();
  server.close(() => {
    console.log("Server shut down");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("Shutting down server...");
  connectionManager.shutdown();
  server.close(() => {
    console.log("Server shut down");
    process.exit(0);
  });
});
