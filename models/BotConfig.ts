export interface BotConfig {
  id?: number;
  key: string;
  value: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface AppConfig {
  mediaEncryptionKey: string;
  mediaStoragePath: string;
  enableTextLogging: boolean;
  enableImageDownload: boolean;
  enableDatabaseStorage: boolean;
}

export const defaultConfig: AppConfig = {
  mediaEncryptionKey: process.env.MEDIA_KEY || "kjslk234",
  mediaStoragePath: process.env.MEDIA_PATH || "encrypted_media",
  enableTextLogging: true,
  enableImageDownload: true,
  enableDatabaseStorage: true,
};