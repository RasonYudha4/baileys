import { pool } from "../config/database.js";
import { AppConfig, defaultConfig, BotConfig } from "../models/botConfig.js";

export class ConfigService {
  private static instance: ConfigService;
  private config: AppConfig = defaultConfig;

  private constructor() {}

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  async loadConfig(): Promise<void> {
    try {
      const result = await pool.query("SELECT key, value FROM bot_config");
      
      for (const row of result.rows) {
        switch (row.key) {
          case "enableTextLogging":
          case "enableImageDownload":
          case "enableDatabaseStorage":
            this.config[row.key] = row.value === "true";
            break;
          default:
            (this.config as any)[row.key] = row.value;
        }
      }
      
      console.log("✅ Configuration loaded from database");
    } catch (error) {
      console.error("❌ Failed to load config, using defaults:", error);
    }
  }

  async updateConfig(key: keyof AppConfig, value: any): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO bot_config (key, value) VALUES ($1, $2) 
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, String(value)]
      );
      
      (this.config as any)[key] = value;
      console.log(`✅ Config updated: ${key} = ${value}`);
    } catch (error) {
      console.error(`❌ Failed to update config ${key}:`, error);
    }
  }

  getConfig(): AppConfig {
    return { ...this.config };
  }

  get(key: keyof AppConfig): any {
    return this.config[key];
  }
}