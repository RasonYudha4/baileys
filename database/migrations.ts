import { pool } from "../config/database.js";

export async function runMigrations(): Promise<void> {
  console.log("🔄 Running database migrations...");

  // First, create migrations table if it doesn't exist
  await createMigrationsTable();

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
      `,
    },
    {
      name: "002_create_departments",
      sql: `
        CREATE TABLE IF NOT EXISTS departments (
          id SERIAL PRIMARY KEY,
          name VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `,
    },
    {
      name: "003_create_users",
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(150),
          email VARCHAR(255) UNIQUE NOT NULL,
          role VARCHAR(20) CHECK (role IN ('admin', 'manager', 'creator', 'worker')),
          password_hash TEXT,
          status INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `,
    },
    {
      name: "004_create_senders",
      sql: `
        CREATE TABLE IF NOT EXISTS senders (
          id SERIAL PRIMARY KEY,
          phone_number BIGINT NOT NULL,
          department_id INTEGER NOT NULL REFERENCES departments(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `,
    },
    {
      name: "005_create_tickets",
      sql: `
        CREATE TABLE IF NOT EXISTS tickets (
          id SERIAL PRIMARY KEY,
          issue VARCHAR(255),
          description TEXT,
          status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
          priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
          assigned_to INTEGER REFERENCES users(id),
          created_by INTEGER NOT NULL REFERENCES senders(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `,
    },
    {
      name: "006_create_ticket_messages",
      sql: `
        CREATE TABLE IF NOT EXISTS ticket_messages (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          sender_id INTEGER NOT NULL REFERENCES senders(id),
          sender_type VARCHAR(20) DEFAULT 'user' CHECK (sender_type IN ('user', 'employee', 'system')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `,
    },
    {
      name: "007_create_ticket_status_logs",
      sql: `
        CREATE TABLE IF NOT EXISTS ticket_status_logs (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
          old_status VARCHAR(20),
          new_status VARCHAR(20),
          changed_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `,
    },
    {
      name: "008_add_departments_unique_constraint",
      sql: `
        -- Only add constraint if it doesn't exist
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'departments_name_unique'
          ) THEN
            -- Remove duplicates first
            DELETE FROM departments d1 
            WHERE d1.id > (
              SELECT MIN(d2.id) 
              FROM departments d2 
              WHERE d2.name = d1.name
            );
            
            -- Add unique constraint
            ALTER TABLE departments 
            ADD CONSTRAINT departments_name_unique UNIQUE (name);
          END IF;
        END $$;
      `
    },
    {
      name: "009_insert_default_departments",
      sql: `
        INSERT INTO departments (name) VALUES 
          ('Human Resources'),
          ('Finance'),
          ('Marketing'),
          ('Post Production'),
          ('Editing')
        ON CONFLICT (name) DO NOTHING;
      `
    },
    {
      name: "010_create_ticket_indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
        CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets (priority);
        CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets (assigned_to);
        CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets (created_by);
        CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages (ticket_id);
        CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_id ON ticket_messages (sender_id);
        CREATE INDEX IF NOT EXISTS idx_ticket_status_logs_ticket_id ON ticket_status_logs (ticket_id);
        CREATE INDEX IF NOT EXISTS idx_senders_phone_number ON senders (phone_number);
        CREATE INDEX IF NOT EXISTS idx_senders_department_id ON senders (department_id);
      `
    }
  ];

  for (const migration of migrations) {
    try {
      // Check if migration has already been run
      const hasRun = await hasMigrationRun(migration.name);
      if (hasRun) {
        console.log(`⏭️ Migration ${migration.name} already completed, skipping`);
        continue;
      }

      // Run the migration
      await pool.query(migration.sql);
      
      // Record that migration has been run
      await recordMigration(migration.name);
      
      console.log(`✅ Migration ${migration.name} completed`);
    } catch (error) {
      console.error(`❌ Migration ${migration.name} failed:`, error);
      throw error;
    }
  }

  console.log("✅ All migrations completed successfully");
}

async function createMigrationsTable(): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.query(sql);
}

async function hasMigrationRun(migrationName: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM migrations WHERE name = $1',
    [migrationName]
  );
  return result.rows.length > 0;
}

async function recordMigration(migrationName: string): Promise<void> {
  await pool.query(
    'INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
    [migrationName]
  );
}