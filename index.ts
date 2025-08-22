import {makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, getContentType  } from "baileys";
import { Boom } from '@hapi/boom'
import { Pool } from "pg"
import fs from "fs";
import pino from "pino";
import path from "path";
import crypto from "crypto";
import qrcode from 'qrcode-terminal';

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "postgres",
  password: "postgres",
  port: 5432,
});

const MEDIA_KEY = crypto.createHash("sha256")
  .update(process.env.MEDIA_KEY || "kjslk234")
  .digest(); 

function encryptAesGcm(plaintext: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", MEDIA_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

function decryptAesGcm(blob: Buffer) {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", MEDIA_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function connectWA() {
    const {state, saveCreds} = await useMultiFileAuthState("auth_info");
    const sock = makeWASocket({
        auth: state,
        logger: pino({level: "silent"}),
        browser: ["MyApp", "Desktop", "1.0.0"],
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        if (qr) {
            console.log('Scan this QR code with your WhatsApp app:');
            qrcode.generate(qr, {small: true});
        }
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect!.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('connection closed due to ', lastDisconnect!.error, ', reconnecting ', shouldReconnect)
            if(shouldReconnect) {
                connectWA();
            }
        } else if(connection === 'open') {
            console.log('Bot Started Successfully!');
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        for (const msg of m.messages) {
            if (!msg.message) continue; 
            const messageType = getContentType(msg.message);
            console.log("📌 Detected type:", messageType);

            if (messageType === "conversation" || messageType === "extendedTextMessage") {
                const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            if (!text) continue;
                console.log("💬 Text from", msg.key.remoteJid, ":", text);
                continue; 
            }

            if (messageType === "imageMessage") {
                try {
                    console.log("📷 Received an image, downloading...");

                    const buffer = await downloadMediaMessage(
                    msg,
                    "buffer",
                    {},
                    { logger: sock.logger, reuploadRequest: sock.updateMediaMessage }
                    );

                    const encrypted = encryptAesGcm(buffer);

                    const jid = (msg.key.remoteJid || "unknown").replace(/[@:]/g, "_");
                    const ts = msg.messageTimestamp?.toString() || Date.now().toString();
                    const outDir = path.join(process.cwd(), "encrypted_media");
                    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

                    const filePath = path.join(outDir, `${jid}-${ts}.enc`);
                    fs.writeFileSync(filePath, encrypted);

                    console.log("🔒 Encrypted image saved:", filePath);

                    const caption = msg.message.imageMessage?.caption;
                    if (caption) console.log("📝 Caption:", caption);
                } catch (e) {
                    console.error("❌ Failed to download/encrypt image:", e);
                }
                continue;
            }
        
        }
    });

    sock.ev.on('creds.update', saveCreds); 
}

connectWA().catch(err => {
    console.error('Failed to connect:', err);
});


    