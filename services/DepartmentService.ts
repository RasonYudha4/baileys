import { pool } from "../config/database.js";

export class DepartmentService {

  async getDepartments(): Promise<Array<{ id: number; name: string }>> {
    try {
      const result = await pool.query(`SELECT id, name FROM departments ORDER BY name`);
      return result.rows;
    } catch (error) {
      console.error("❌ Failed to get departments:", error);
      return [];
    }
  }

  async getDepartmentByName(name: string): Promise<number | null> {
    try {
      const result = await pool.query(
        `SELECT id FROM departments WHERE LOWER(name) = LOWER($1)`,
        [name]
      );

      return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
      console.error("❌ Failed to get department by name:", error);
      return null;
    }
  }

  async getDepartmentByPhoneNumber(phoneNumber: string): Promise<number | null> {
    try {
      const result = await pool.query(
        `SELECT d.id 
         FROM departments d
         JOIN senders s ON d.id = s.department_id
         WHERE s.phone_number = $1`,
        [phoneNumber]
      );

      return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
      console.error("❌ Failed to get department by phone number:", error);
      return null;
    }
  }

  async assignUserToDepartment(phoneNumber: string, departmentId: number): Promise<void> {
    try {
      await pool.query(
        `UPDATE users SET department_id = $1, updated_at = CURRENT_TIMESTAMP WHERE phone_number = $2`,
        [departmentId, phoneNumber]
      );

      console.log(`✅ User  with phone ${phoneNumber} assigned to department ${departmentId}`);
    } catch (error) {
      console.error("❌ Failed to assign user to department:", error);
      throw error;
    }
  }

  async createDepartment(name: string): Promise<number> {
    try {
      const result = await pool.query(
        `INSERT INTO departments (name) VALUES ($1) RETURNING id`,
        [name]
      );

      return result.rows[0].id;
    } catch (error) {
      console.error("❌ Failed to create department:", error);
      throw error;
    }
  }
}