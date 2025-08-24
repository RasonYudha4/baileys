export interface Message {
  id?: number;
  jid: string;
  message_type: string;
  content?: string | null;
  media_path?: string | null;
  media_data?: Buffer | null;
  caption?: string | null;
  timestamp: number;
  created_at?: Date;
}