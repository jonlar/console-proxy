import fs from "node:fs";
import path from "node:path";

let logRoot = path.resolve(__dirname, "../../..", "logs");
let maxSize = 1024 * 1024; // 1 MiB

// Line buffers for each UUID and direction
const lineBuffers = new Map<string, string>();

export function setLogDirectory(logDir: string) {
  logRoot = path.resolve(logDir);
}

export function setMaxLogSize(sizeInBytes: number) {
  if (sizeInBytes <= 0) {
    throw new Error("Max log size must be greater than 0");
  }
  maxSize = sizeInBytes;
}

function getBufferKey(uuid: string, direction: "in" | "out"): string {
  return `${uuid}:${direction}`;
}

function ensureDir(dir: string) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (error) {
    console.error(`Failed to create log directory ${dir}:`, error);
    throw error;
  }
}

function getLogDir(uuid: string) {
  const dir = path.join(logRoot, uuid);
  ensureDir(dir);
  return dir;
}

function getLogFile(uuid: string, date: Date) {
  const day = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(getLogDir(uuid), `${day}.json`);
}

function escapeData(data: string) {
  // Escape non-printable characters
  return JSON.stringify(data).slice(1, -1);
}

function getTimestamp() {
  // ISO8601 with microseconds
  const now = new Date();
  const ms = now.getMilliseconds();
  const hr = process.hrtime.bigint();
  const us = Number(hr % 1000n);
  return `${now.toISOString().replace("Z", "")}.${ms.toString().padStart(3, "0")}${us.toString().padStart(3, "0")}`;
}

function writeLogEntry(uuid: string, direction: "in" | "out", data: string) {
  const now = new Date();
  const logFile = getLogFile(uuid, now);
  const entry = {
    timestamp: getTimestamp(),
    direction,
    data: escapeData(data),
  };
  fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
}

export function logTraffic(uuid: string, direction: "in" | "out", data: string) {
  try {
    const bufferKey = getBufferKey(uuid, direction);
    const currentBuffer = lineBuffers.get(bufferKey) || "";
    const newBuffer = currentBuffer + data;

    // Split by newlines - handle \r\n, \n, and \r
    const lines = newBuffer.split(/\r\n|\r|\n/);

    // Keep the last incomplete line in the buffer
    const incompleteChunk = lines.pop() || "";
    lineBuffers.set(bufferKey, incompleteChunk);

    // Log all complete lines
    for (const line of lines) {
      if (line.length > 0) {
        writeLogEntry(uuid, direction, line);
      }
    }
  } catch (error) {
    console.error(`Failed to log traffic for ${uuid}:`, error);
    // Don't throw - logging failures shouldn't break the application
  }
}

export function flushBuffer(uuid: string, direction: "in" | "out") {
  try {
    const bufferKey = getBufferKey(uuid, direction);
    const buffer = lineBuffers.get(bufferKey);

    if (buffer && buffer.length > 0) {
      writeLogEntry(uuid, direction, buffer);
      lineBuffers.delete(bufferKey);
    }
  } catch (error) {
    console.error(`Failed to flush buffer for ${uuid}:`, error);
  }
}

export function rotateLogs(uuid: string) {
  try {
    const dir = getLogDir(uuid);
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(dir, f));
    let total = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
    files.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
    while (total > maxSize && files.length > 0) {
      const oldest = files.shift();
      if (oldest) {
        total -= fs.statSync(oldest).size;
        fs.unlinkSync(oldest);
      }
    }
  } catch (error) {
    console.error(`Failed to rotate logs for ${uuid}:`, error);
  }
}

export function midnightRotate(uuid: string) {
  // Called at UTC midnight to start new file
  rotateLogs(uuid);
}

export interface LogEntry {
  timestamp: string;
  direction: "in" | "out";
  data: string;
}

export function getLogDates(uuid: string): string[] {
  try {
    const dir = path.join(logRoot, uuid);
    if (!fs.existsSync(dir)) {
      return [];
    }
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""))
      .sort()
      .reverse(); // Most recent first
  } catch (error) {
    console.error(`Failed to get log dates for ${uuid}:`, error);
    return [];
  }
}

export function readLogs(uuid: string, date: string, searchTerm?: string): LogEntry[] {
  try {
    // Handle date range (format: "2026-01-20,2026-01-24")
    if (date.includes(",")) {
      const [startDate, endDate] = date.split(",");
      const availableDates = getLogDates(uuid);
      const allEntries: LogEntry[] = [];

      // Filter dates within range
      const datesToRead = availableDates.filter((d) => d >= startDate && d <= endDate);

      for (const dateStr of datesToRead) {
        const logFile = path.join(logRoot, uuid, `${dateStr}.json`);
        if (!fs.existsSync(logFile)) continue;

        const content = fs.readFileSync(logFile, "utf-8");
        const lines = content.trim().split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line) as LogEntry;
            if (searchTerm && !entry.data.toLowerCase().includes(searchTerm.toLowerCase())) {
              continue;
            }
            allEntries.push(entry);
          } catch (parseError) {
            console.error("Failed to parse log line:", parseError);
          }
        }
      }

      // Don't sort - let frontend handle sorting
      return allEntries;
    }

    // Handle "week" mode - read last 7 days
    if (date === "week") {
      const availableDates = getLogDates(uuid);
      const allEntries: LogEntry[] = [];

      // Get up to 7 most recent dates
      const datesToRead = availableDates.slice(0, 7);

      for (const dateStr of datesToRead) {
        const logFile = path.join(logRoot, uuid, `${dateStr}.json`);
        if (!fs.existsSync(logFile)) continue;

        const content = fs.readFileSync(logFile, "utf-8");
        const lines = content.trim().split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line) as LogEntry;
            if (searchTerm && !entry.data.toLowerCase().includes(searchTerm.toLowerCase())) {
              continue;
            }
            allEntries.push(entry);
          } catch (parseError) {
            console.error("Failed to parse log line:", parseError);
          }
        }
      }

      return allEntries;
    }

    // Single day mode
    const logFile = path.join(logRoot, uuid, `${date}.json`);
    if (!fs.existsSync(logFile)) {
      return [];
    }

    const content = fs.readFileSync(logFile, "utf-8");
    const lines = content.trim().split("\n");
    const entries: LogEntry[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as LogEntry;
        // Filter by search term if provided
        if (searchTerm && !entry.data.toLowerCase().includes(searchTerm.toLowerCase())) {
          continue;
        }
        entries.push(entry);
      } catch (parseError) {
        console.error("Failed to parse log line:", parseError);
      }
    }

    return entries;
  } catch (error) {
    console.error(`Failed to read logs for ${uuid} on ${date}:`, error);
    return [];
  }
}
