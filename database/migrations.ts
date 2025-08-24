import { pool } from "../config/database.js";

export async function runMigrations(): Promise<void> {
  console.log("🔄 Running database migrations...");

  const migrations = [
    {
      name: "001_create_bot_config",
      sql: `
        CREATE TABLE IF NOT EXISTS bot_config (
          id SERIAL PRIMARY KEY,
          key VARCHAR(255) UNIQUE NOT NULL,
          value TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `
    },
    {
      name: "002_create_messages",
      sql: `
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          jid VARCHAR(255) NOT NULL,
          message_type VARCHAR(50) NOT NULL,
          content TEXT,
          media_path VARCHAR(500),
          caption TEXT,
          timestamp BIGINT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_jid (jid),
          INDEX idx_message_type (message_type),
          INDEX idx_timestamp (timestamp)
        );
      `
    }
  ];

  for (const migration of migrations) {
    try {
      await pool.query(migration.sql);
      console.log(`✅ Migration ${migration.name} completed`);
    } catch (error) {
      console.error(`❌ Migration ${migration.name} failed:`, error);
      throw error;
    }
  }

  console.log("✅ All migrations completed successfully");
}