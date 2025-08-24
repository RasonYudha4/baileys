import { WAMessage, downloadMediaMessage, getContentType } from "baileys";
import { MessageService } from "../services/MessageService.js";
import { CryptService } from "../services/CryptService";
import { ConfigService } from "../services/ConfigService.js";
import fs from "fs";
import path from "path";

export class MessageHandler {
  private messageService = new MessageService();
  private config = ConfigService.getInstance();

  constructor(private sock: any) {
    this.messageService.ensureMediaDirectory();
  }

  async handleMessage(msg: WAMessage): Promise<void> {
    if (!msg.message) return;

    const messageType = getContentType(msg.message);
    const jid = msg.key.remoteJid || "unknown";
    const timestamp = typeof msg.messageTimestamp === 'object' && msg.messageTimestamp?.toNumber
      ? msg.messageTimestamp.toNumber()
      : (msg.messageTimestamp as number) || Date.now();

    console.log("📌 Detected type:", messageType, "from:", jid);

    switch (messageType) {
      case "conversation":
      case "extendedTextMessage":
        await this.handleTextMessage(msg, messageType, jid, timestamp);
        break;
      case "imageMessage":
        await this.handleImageMessage(msg, jid, timestamp);
        break;
      default:
        console.log("🔍 Unhandled message type:", messageType);
    }
  }

  private async handleTextMessage(
    msg: WAMessage, 
    messageType: string, 
    jid: string, 
    timestamp: number
  ): Promise<void> {
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
    if (!text) return;

    if (this.config.get("enableTextLogging")) {
      console.log("💬 Text from", jid, ":", text);
    }

    await this.messageService.saveMessage({
      jid,
      message_type: messageType,
      content: text,
      timestamp,
    });
  }

  private async handleImageMessage(msg: WAMessage, jid: string, timestamp: number): Promise<void> {
    if (!this.config.get("enableImageDownload")) {
      console.log("📷 Image download disabled by configuration");
      return;
    }

    try {
      console.log("📷 Received an image, downloading...");

      const buffer = await downloadMediaMessage(
        msg,
        "buffer",
        {},
        { logger: this.sock.logger, reuploadRequest: this.sock.updateMediaMessage }
      );

      const encrypted = CryptService.encryptAesGcm(buffer);
      const sanitizedJid = jid.replace(/[@:]/g, "_");
      const fileName = `${sanitizedJid}-${timestamp}.enc`;
      const mediaPath = this.config.get("mediaStoragePath");
      const filePath = path.join(mediaPath, fileName);

      fs.writeFileSync(filePath, encrypted);
      console.log("🔒 Encrypted image saved:", filePath);

      const caption = msg.message?.imageMessage?.caption;
      if (caption && this.config.get("enableTextLogging")) {
        console.log("📝 Caption:", caption);
      }

      await this.messageService.saveMessage({
        jid,
        message_type: "imageMessage",
        media_path: filePath,
        caption,
        timestamp,
      });

    } catch (error) {
      console.error("❌ Failed to download/encrypt image:", error);
    }
  }
}