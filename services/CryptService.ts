import crypto from "crypto";
import { ConfigService } from "./ConfigService.js";

export class CryptService {
  private static mediaKey: Buffer;

  static getMediaKey(): Buffer {
    if (!this.mediaKey) {
      const config = ConfigService.getInstance();
      this.mediaKey = crypto.createHash("sha256")
        .update(config.get("mediaEncryptionKey"))
        .digest();
    }
    return this.mediaKey;
  }

  static encryptAesGcm(plaintext: Buffer): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.getMediaKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]);
  }

  static decryptAesGcm(blob: Buffer): Buffer {
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const ciphertext = blob.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.getMediaKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}