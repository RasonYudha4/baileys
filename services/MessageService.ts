import { pool } from "../config/database.js";
import { ConfigService } from "./ConfigService.js";

export class MessageService {
  private config = ConfigService.getInstance();

  /**
   * Save ticket message
   */
  async saveTicketMessage(
    ticketId: number,
    message: string,
    senderId: number,
    senderType: 'user' | 'employee' | 'system' = 'user'
  ): Promise<number> {
    try {
      const result = await pool.query(
        `INSERT INTO ticket_messages (ticket_id, message, sender_id, sender_type) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [ticketId, message, senderId, senderType]
      );

      return result.rows[0].id;
    } catch (error) {
      console.error("❌ Failed to save ticket message:", error);
      throw error;
    }
  }

  /**
   * Get ticket messages with sender details
   */
  async getTicketMessages(ticketId: number): Promise<Array<{
    id: number;
    message: string;
    sender_type: string;
    phone_number: string;
    department_name: string;
    created_at: Date;
  }>> {
    try {
      const result = await pool.query(
        `SELECT 
           tm.id,
           tm.message,
           tm.sender_type,
           s.phone_number,
           d.name as department_name,
           tm.created_at
         FROM ticket_messages tm
         JOIN senders s ON tm.sender_id = s.id
         JOIN departments d ON s.department_id = d.id
         WHERE tm.ticket_id = $1
         ORDER BY tm.created_at ASC`,
        [ticketId]
      );

      return result.rows;
    } catch (error) {
      console.error("❌ Failed to get ticket messages:", error);
      return [];
    }
  }
}