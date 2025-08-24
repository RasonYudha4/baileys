import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "baileys";
import { Boom } from '@hapi/boom';
import pino from "pino";
import qrcode from 'qrcode-terminal';
import { testConnection } from "./config/database.js";
import { runMigrations } from "./database/migrations.js";
import { ConfigService } from "./services/ConfigService.js";
import { MessageHandler } from "./handlers/MessageHandler.js";

export class WhatsAppBot {
  private sock: any;
  private messageHandler: MessageHandler | null = null;
  private config = ConfigService.getInstance();

  async initialize(): Promise<void> {
    console.log("🚀 Initializing WhatsApp Bot...");
    
    // Test database connection first
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error("Database connection failed");
    }
    
    // Run migrations
    await runMigrations();
    
    // Load configuration
    await this.config.loadConfig();
    
    // Connect to WhatsApp
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const { state, saveCreds } = await useMultiFileAuthState("auth_info");
      
      this.sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["MyApp", "Desktop", "1.0.0"],
      });

      this.messageHandler = new MessageHandler(this.sock);
      this.setupEventHandlers(saveCreds);
      
    } catch (error) {
      console.error("❌ Failed to connect:", error);
      throw error;
    }
  }

  private setupEventHandlers(saveCreds: () => void): void {
    this.sock.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log('📱 Scan this QR code with your WhatsApp app:');
        qrcode.generate(qr, { small: true });
      }
      
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('🔌 Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
        
        if (shouldReconnect) {
          setTimeout(() => this.connect(), 5000); // 5 second delay before reconnecting
        }
      } else if (connection === 'open') {
        console.log('✅ Bot Started Successfully!');
      }
    });

    this.sock.ev.on("messages.upsert", async (m: any) => {
      for (const msg of m.messages) {
        try {
          await this.messageHandler?.handleMessage(msg);
        } catch (error) {
          console.error("❌ Error handling message:", error);
        }
      }
    });

    this.sock.ev.on('creds.update', saveCreds);
  }

  // Configuration management methods
  async updateConfig(key: string, value: any): Promise<void> {
    await this.config.updateConfig(key as any, value);
  }

  getConfig(): any {
    return this.config.getConfig();
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    console.log("🔄 Shutting down bot...");
    this.sock?.end();
  }
}