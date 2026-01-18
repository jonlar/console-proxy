import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "./config";
import { ConfigSchema } from "./config";

export class ConfigLoader {
  private config: Config | null = null;
  private configPath: string;

  constructor(configPath = "./config.json") {
    this.configPath = resolve(configPath);
  }

  load(): Config {
    try {
      // Create empty config if file doesn't exist
      if (!existsSync(this.configPath)) {
        console.log(`Configuration file not found at ${this.configPath}, creating empty config`);
        const emptyConfig: Config = { ports: [] };
        this.save(emptyConfig);
        return emptyConfig;
      }

      const fileContent = readFileSync(this.configPath, "utf-8");
      const jsonData = JSON.parse(fileContent);
      this.config = ConfigSchema.parse(jsonData);
      console.log(`Configuration loaded from ${this.configPath}`);
      return this.config;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Failed to load configuration: ${error.message}`);
      }
      throw error;
    }
  }

  save(config: Config): void {
    try {
      const jsonData = JSON.stringify(config, null, 2);
      writeFileSync(this.configPath, jsonData, "utf-8");
      this.config = config;
      console.log(`Configuration saved to ${this.configPath}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Failed to save configuration: ${error.message}`);
      }
      throw error;
    }
  }

  getConfig(): Config {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  reload(): Config {
    this.config = null;
    return this.load();
  }
}
