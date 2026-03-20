import { EventEmitter } from "node:events";
import { Socket } from "node:net";
import type { RemoteTelnetPort } from "./config";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ConnectionInfo {
  portId: string;
  status: ConnectionStatus;
  lastConnected?: Date;
  lastError?: string;
  retryCount: number;
}

export class TelnetConnectionManager extends EventEmitter {
  private connections = new Map<string, Socket>();
  private connectionInfos = new Map<string, ConnectionInfo>();
  private retryTimeouts = new Map<string, NodeJS.Timeout>();
  private ports = new Map<string, RemoteTelnetPort & { id: string }>();

  private readonly maxRetryDelay = 5000; // Maximum delay of 5 seconds

  /**
   * Connect to a telnet port
   */
  async connect(port: RemoteTelnetPort & { id: string }): Promise<void> {
    const { id, host, port: portNumber } = port;

    // Clean up existing connection (but don't remove port config)
    const socket = this.connections.get(id);
    if (socket) {
      socket.destroy();
      this.connections.delete(id);
    }

    // Clear retry timeout
    const timeout = this.retryTimeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.retryTimeouts.delete(id);
    }

    // Store port configuration for reconnection attempts
    this.ports.set(id, port);

    // Initialize connection info
    const previousStatus = this.connectionInfos.get(id)?.status;
    const info: ConnectionInfo = {
      portId: id,
      status: "connecting",
      retryCount: this.connectionInfos.get(id)?.retryCount || 0, // Preserve retry count
    };
    this.connectionInfos.set(id, info);
    // Don't broadcast "connecting" during retries — it causes unnecessary UI re-renders
    if (previousStatus !== "error") {
      this.emit("statusChanged", id, info);
    }

    try {
      await this.establishConnection(port);
    } catch (error) {
      this.handleConnectionError(id, error);
    }
  }

  /**
   * Disconnect from a telnet port
   */
  disconnect(portId: string): void {
    const socket = this.connections.get(portId);
    if (socket) {
      socket.destroy();
      this.connections.delete(portId);
    }

    // Clear retry timeout
    const timeout = this.retryTimeouts.get(portId);
    if (timeout) {
      clearTimeout(timeout);
      this.retryTimeouts.delete(portId);
    }

    // Emit disconnected event before removing port config
    this.emit("disconnected", portId);

    // Remove port configuration
    this.ports.delete(portId);

    // Update status
    const info = this.connectionInfos.get(portId);
    if (info) {
      info.status = "disconnected";
      this.emit("statusChanged", portId, info);
    }
  }

  /**
   * Get connection status for a port
   */
  getConnectionInfo(portId: string): ConnectionInfo | undefined {
    return this.connectionInfos.get(portId);
  }

  /**
   * Get all connection statuses
   */
  getAllConnectionInfos(): Map<string, ConnectionInfo> {
    return new Map(this.connectionInfos);
  }

  /**
   * Establish the actual socket connection
   */
  private async establishConnection(port: RemoteTelnetPort & { id: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const { id, host, port: portNumber } = port;

      // Set connection timeout
      socket.setTimeout(10000); // 10 seconds

      // Enable TCP keepalive for persistent connections
      socket.setKeepAlive(true, 30000); // Send keepalive every 30 seconds
      socket.setNoDelay(true); // Disable Nagle's algorithm for lower latency

      socket.connect(portNumber, host, () => {
        // Clear connection timeout once connected
        socket.setTimeout(0);

        // Update connection info
        const info = this.connectionInfos.get(id);
        const previousStatus = info?.status;

        if (info) {
          info.status = "connected";
          info.lastConnected = new Date();
          info.retryCount = 0;
          info.lastError = undefined;

          // Log all connection events for debugging
          const portName = port.name || `Port ${id}`;
          if (previousStatus === "error" || previousStatus === "disconnected") {
            console.log(`✓ [${portName}] → ${host}:${portNumber}`);
          } else {
            console.log(
              `🔗 [${portName}] connected to ${host}:${portNumber} (was ${previousStatus || "new"})`,
            );
          }
        }

        this.connections.set(id, socket);

        this.emit("statusChanged", id, info);
        resolve();
      });

      socket.on("data", (data) => {
        // Handle incoming telnet data
        this.emit("data", id, data);
      });

      socket.on("error", (error) => {
        this.handleConnectionError(id, error);
        reject(error);
      });

      socket.on("timeout", () => {
        const timeoutError = new Error("Connection timeout after 10 seconds");
        socket.destroy();
        this.handleConnectionError(id, timeoutError);
        reject(timeoutError);
      });

      socket.on("close", (hadError) => {
        this.connections.delete(id);
        // Connection deleted above

        const info = this.connectionInfos.get(id);
        if (info && info.status === "connected") {
          const portName = port.name || `Port ${id}`;
          console.log(
            `🔌 [${portName}] disconnected from ${host}:${portNumber}${hadError ? " (error)" : " (normal)"}`,
          );

          // Update status to disconnected
          info.status = "disconnected";
          this.emit("statusChanged", id, info);

          // Always schedule reconnect with progressive backoff starting from 1 second
          const delay = Math.min((info.retryCount + 1) * 1000, this.maxRetryDelay);
          this.scheduleReconnect(port, delay);
        }
      });
    });
  }

  /**
   * Handle connection errors and implement retry logic
   */
  private handleConnectionError(portId: string, error: unknown): void {
    const info = this.connectionInfos.get(portId);
    const port = this.findPortById(portId);

    if (!info) return;

    let errorMessage = "Unknown error";
    let detailedError = "";

    if (error instanceof Error) {
      errorMessage = error.message;

      // Provide more detailed error information based on error type
      if (error.message.includes("ECONNREFUSED")) {
        detailedError = `Connection refused by ${port?.host}:${port?.port}. The target service may not be running or may be blocking connections.`;
      } else if (error.message.includes("EHOSTUNREACH")) {
        detailedError = `Host ${port?.host} is unreachable. Check network connectivity and host address.`;
      } else if (error.message.includes("ENETUNREACH")) {
        detailedError = `Network unreachable to ${port?.host}. Check network configuration and routing.`;
      } else if (error.message.includes("ETIMEDOUT")) {
        detailedError = `Connection to ${port?.host}:${port?.port} timed out. The service may be slow to respond or blocked by a firewall.`;
      } else if (error.message.includes("ENOTFOUND")) {
        detailedError = `Host ${port?.host} not found. Check if the hostname is correct and DNS is working.`;
      } else {
        detailedError = `Unexpected connection error: ${error.message}`;
      }
    }

    info.status = "error";
    info.lastError = errorMessage;
    info.retryCount++;

    const connectionDetails = port ? `${port.host}:${port.port}` : `port ${portId}`;
    const previousStatus = info.status;

    info.status = "error";
    info.lastError = errorMessage;
    info.retryCount++;

    // Log all disconnection events
    const portName = port?.name || `Port ${portId}`;
    if (previousStatus === "connected") {
      console.error(`✗ [${portName}] ✗ ${connectionDetails}`);
    } else {
      console.log(
        `⚡ [${portName}] connection error: ${error instanceof Error ? error.message : "Unknown error"} (was ${previousStatus || "unknown"})`,
      );
    }

    this.emit("statusChanged", portId, info);

    // Always schedule reconnect with progressive backoff
    if (port) {
      // Progressive backoff: 1, 2, 3, 4, 5 seconds, then stay at 5
      const delay = Math.min(info.retryCount * 1000, this.maxRetryDelay);

      this.scheduleReconnect(port, delay);
    } else {
      console.error(`⚠ Port configuration not found for ${portId}, cannot retry connection`);
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(port: RemoteTelnetPort & { id: string }, delay?: number): void {
    const reconnectDelay = delay || 1000; // Default to 1 second if no delay specified

    // Prevent rapid reconnections by checking if already scheduled
    if (this.retryTimeouts.has(port.id)) {
      return;
    }

    const timeout = setTimeout(() => {
      this.retryTimeouts.delete(port.id);
      this.connect(port);
    }, reconnectDelay);

    this.retryTimeouts.set(port.id, timeout);
  }

  /**
   * Check if a connection is actually alive
   */
  isConnected(portId: string): boolean {
    const socket = this.connections.get(portId);
    return socket ? !socket.destroyed && socket.readyState === "open" : false;
  }

  /**
   * Send data to a connected port
   */
  sendData(portId: string, data: Buffer | string): boolean {
    const socket = this.connections.get(portId);
    if (!socket || socket.destroyed) {
      return false;
    }

    try {
      socket.write(data);
      return true;
    } catch (error) {
      console.error(`Error sending data to port ${portId}:`, error);
      return false;
    }
  }

  /**
   * Clean up all connections
   */
  shutdown(): void {
    for (const [portId] of this.connections) {
      this.disconnect(portId);
    }
    this.connectionInfos.clear();
    this.ports.clear();
  }

  /**
   * Helper to find port configuration by ID
   */
  private findPortById(portId: string): (RemoteTelnetPort & { id: string }) | undefined {
    return this.ports.get(portId);
  }
}
