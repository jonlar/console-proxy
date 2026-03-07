import { createServer } from "node:http";
import path from "node:path";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import express from "express";
import { WebSocketServer } from "ws";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ConfigLoader } from "./configLoader";
import { contract } from "./contract";

// ── CLI arguments ────────────────────────────────────────────────────────────
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
    description: "Directory for config and data",
    default: process.env.DATA_DIR || "../../",
  })
  .help()
  .parseSync();

const app = express();
const port = argv.port;
const dataDir = argv["data-dir"];

// ── HTTP + WebSocket servers ─────────────────────────────────────────────────
const server = createServer(app);

const wss = new WebSocketServer({ server, path: "/ws", clientTracking: true });

// Broadcast helper
function broadcast(type: string, data?: unknown) {
  const message = JSON.stringify({ type, data });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(message);
  }
}

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");

  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Handle WebSocket messages here
      console.log("Received:", msg);
    } catch {
      console.error("Invalid WebSocket message");
    }
  });

  ws.on("close", () => console.log("WebSocket client disconnected"));
  ws.on("error", (err) => console.error("WebSocket error:", err));
});

// ── Config ───────────────────────────────────────────────────────────────────
const configLoader = new ConfigLoader(`${dataDir}/config.json`);

try {
  configLoader.load();
} catch {
  console.warn("No config file found, using defaults");
}

// ── In-memory data store (replace with a real DB as needed) ──────────────────
interface Item {
  id: string;
  name: string;
  createdAt: string;
}

const items: Item[] = [];

// ── API routes ───────────────────────────────────────────────────────────────
app.use(express.json());

const s = initServer();

const router = s.router(contract, {
  health: async () => ({
    status: 200,
    body: { ok: true, timestamp: new Date().toISOString() },
  }),

  getItems: async () => ({
    status: 200,
    body: { items },
  }),

  createItem: async ({ body }) => {
    try {
      const item: Item = {
        id: crypto.randomUUID(),
        name: body.name,
        createdAt: new Date().toISOString(),
      };
      items.push(item);
      broadcast("items_updated");
      return { status: 200, body: { success: true, item } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { status: 500, body: { success: false, message } };
    }
  },

  deleteItem: async ({ params }) => {
    const index = items.findIndex((i) => i.id === params.id);
    if (index === -1) {
      return { status: 404, body: { success: false, message: "Item not found" } };
    }
    items.splice(index, 1);
    broadcast("items_updated");
    return { status: 200, body: { success: true, message: "Item deleted" } };
  },
});

createExpressEndpoints(contract, router, app);

// ── Serve frontend in production ─────────────────────────────────────────────
if (process.env.NODE_ENV === "production" || process.env.PORT) {
  const frontendPath = path.join(__dirname, "../../frontend/dist");
  app.use(express.static(frontendPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

// ── Start ────────────────────────────────────────────────────────────────────
server.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
  console.log(`WebSocket running at ws://localhost:${port}/ws`);
});

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log("Shutting down...");
    server.close(() => process.exit(0));
  });
}
