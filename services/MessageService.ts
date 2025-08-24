import { pool } from "../config/database.js";
import { ConfigService } from "./ConfigService.js";
import { Message } from "../models/Message.js";
import { CryptService } from "../services/CryptService.js";
import fs from "fs";
import path from "path";

export class MessageService {
  private config = ConfigService.getInstance();

  async saveMessage(data: Omit<Message, 'id' | 'created_at'>): Promise<void> {
    if (!this.config.get("enableDatabaseStorage")) return;

    try {
      await pool.query(
        `INSERT INTO messages (jid, message_type, content, media_path, media_data, caption, timestamp) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [data.jid, data.message_type, data.content, data.media_path, data.media_data, data.caption, data.timestamp]
      );
    } catch (error) {
      console.error("❌ Failed to save message to database:", error);
    }
  }

  async getMediaData(messageId: number): Promise<Buffer | null> {
    try {
      const result = await pool.query(
        "SELECT media_data FROM messages WHERE id = $1 AND media_data IS NOT NULL",
        [messageId]
      );
      return result.rows[0]?.media_data || null;
    } catch (error) {
      console.error("❌ Failed to fetch media data:", error);
      return null;
    }
  }

  async getDecryptedMedia(messageId: number): Promise<Buffer | null> {
    const encryptedData = await this.getMediaData(messageId);
    if (!encryptedData) return null;

    try {
      return CryptService.decryptAesGcm(encryptedData);
    } catch (error) {
      console.error("❌ Failed to decrypt media:", error);
      return null;
    }
  }

  async exportMediaToFile(messageId: number, outputPath: string): Promise<boolean> {
    const decryptedData = await this.getDecryptedMedia(messageId);
    if (!decryptedData) return false;

    try {
      const fs = await import("fs");
      const path = await import("path");
      
      // Ensure directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, decryptedData);
      console.log(`✅ Media exported to: ${outputPath}`);
      return true;
    } catch (error) {
      console.error("❌ Failed to export media:", error);
      return false;
    }
  }

  async getMessages(jid?: string, messageType?: string, limit = 50): Promise<Message[]> {
    let query = "SELECT * FROM messages";
    const params: any[] = [];
    const conditions: string[] = [];

    if (jid) {
      conditions.push(`jid = $${params.length + 1}`);
      params.push(jid);
    }

    if (messageType) {
      conditions.push(`message_type = $${params.length + 1}`);
      params.push(messageType);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    try {
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error("❌ Failed to fetch messages:", error);
      return [];
    }
  }

  ensureMediaDirectory(): void {
    const mediaPath = this.config.get("mediaStoragePath");
    if (!fs.existsSync(mediaPath)) {
      fs.mkdirSync(mediaPath, { recursive: true });
    }
  }
}