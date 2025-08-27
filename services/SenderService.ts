import { pool } from "../config/database.js";

export class SenderService {
  /**
   * Create or get sender by phone number and department
   */
  async createOrGetSender(phoneNumber: string, departmentId: number): Promise<number> {
    try {
      const existingResult = await pool.query(
        `SELECT id FROM senders WHERE phone_number = $1 AND department_id = $2`,
        [phoneNumber, departmentId]
      );

      if (existingResult.rows.length > 0) {
        return existingResult.rows[0].id;
      }

      const insertResult = await pool.query(
        `INSERT INTO senders (phone_number, department_id) 
         VALUES ($1, $2) RETURNING id`,
        [phoneNumber, departmentId]
      );

      return insertResult.rows[0].id;
    } catch (error) {
      console.error("❌ Failed to create or get sender:", error);
      throw error;
    }
  }

  /**
   * Get sender by phone number only (returns first match)
   */
  async getSenderByPhone(phoneNumber: string): Promise<number | null> {
    try {
      const result = await pool.query(
        `SELECT id FROM senders WHERE phone_number = $1 LIMIT 1`,
        [phoneNumber]
      );

      return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
      console.error("❌ Failed to get sender by phone:", error);
      return null;
    }
  }

  /**
   * Get sender details
   */
  async getSenderDetails(senderId: number): Promise<{
    id: number;
    phone_number: string;
    department_id: number;
    department_name: string;
  } | null> {
    try {
      const result = await pool.query(
        `SELECT s.id, s.phone_number, s.department_id, d.name as department_name
         FROM senders s
         JOIN departments d ON s.department_id = d.id
         WHERE s.id = $1`,
        [senderId]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("❌ Failed to get sender details:", error);
      return null;
    }
  }
}