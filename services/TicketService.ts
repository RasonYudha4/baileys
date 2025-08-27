import { pool } from "../config/database.js";
import { MessageService } from "./MessageService.js";
import { SenderService } from "./SenderService.js";
import { DepartmentService } from "./DepartmentService.js";

export class TicketService {
  private messageService = new MessageService();
  private senderService = new SenderService();
  private departmentService = new DepartmentService();

  /**
   * Create a new ticket
   */
  async createTicket(
    issue: string,
    description: string,
    createdBy: number,
    priority: "low" | "medium" | "high" = "medium",
    assignedTo?: number
  ): Promise<number> {
    try {
      const result = await pool.query(
        `INSERT INTO tickets (issue, description, priority, assigned_to, created_by) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [issue, description, priority, assignedTo || null, createdBy]
      );

      return result.rows[0].id;
    } catch (error) {
      console.error("❌ Failed to create ticket:", error);
      throw error;
    }
  }

  async getTicket(ticketId: number): Promise<any | null> {
    try {
      const result = await pool.query(
        `SELECT 
           t.*,
           u.name as assigned_user_name,
           s.phone_number as creator_phone,
           d.name as creator_department
         FROM tickets t
         LEFT JOIN users u ON t.assigned_to = u.id
         JOIN senders s ON t.created_by = s.id
         JOIN departments d ON s.department_id = d.id
         WHERE t.id = $1`,
        [ticketId]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("❌ Failed to get ticket:", error);
      return null;
    }
  }

  async updateTicketStatus(
    ticketId: number,
    newStatus: "open" | "in_progress" | "resolved" | "closed",
    changedBy?: number
  ): Promise<void> {
    try {
      const currentTicket = await pool.query(
        `SELECT status FROM tickets WHERE id = $1`,
        [ticketId]
      );

      if (currentTicket.rows.length === 0) {
        throw new Error(`Ticket ${ticketId} not found`);
      }

      const oldStatus = currentTicket.rows[0].status;

      await pool.query(
        `UPDATE tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [newStatus, ticketId]
      );

      if (oldStatus !== newStatus) {
        await pool.query(
          `INSERT INTO ticket_status_logs (ticket_id, old_status, new_status, changed_by) 
           VALUES ($1, $2, $3, $4)`,
          [ticketId, oldStatus, newStatus, changedBy || null]
        );
      }

      console.log(
        `✅ Ticket ${ticketId} status updated from ${oldStatus} to ${newStatus}`
      );
    } catch (error) {
      console.error("❌ Failed to update ticket status:", error);
      throw error;
    }
  }

  async assignTicket(
    ticketId: number,
    userId: number,
    changedBy?: number
  ): Promise<void> {
    try {
      await pool.query(
        `UPDATE tickets SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [userId, ticketId]
      );

      console.log(`✅ Ticket ${ticketId} assigned to user ${userId}`);
    } catch (error) {
      console.error("❌ Failed to assign ticket:", error);
      throw error;
    }
  }

  async getTicketsByStatus(status: string): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT 
           t.*,
           u.name as assigned_user_name,
           s.phone_number as creator_phone,
           d.name as creator_department
         FROM tickets t
         LEFT JOIN users u ON t.assigned_to = u.id
         JOIN senders s ON t.created_by = s.id
         JOIN departments d ON s.department_id = d.id
         WHERE t.status = $1
         ORDER BY t.created_at DESC`,
        [status]
      );

      return result.rows;
    } catch (error) {
      console.error("❌ Failed to get tickets by status:", error);
      return [];
    }
  }

  async createTicketFromWhatsApp(
    phoneNumber: string,
    issue: string,
    description: string,
    departmentName?: string,
    priority: "low" | "medium" | "high" = "medium"
  ): Promise<number> {
    try {
      let senderId: number;

      if (departmentName) {
        const departmentId = await this.departmentService.getDepartmentByName(
          departmentName
        );
        if (!departmentId) {
          throw new Error(`Department '${departmentName}' not found`);
        }
        senderId = await this.senderService.createOrGetSender(
          phoneNumber,
          departmentId
        );
      } else {
        const existingSenderId = await this.senderService.getSenderByPhone(
          phoneNumber
        );
        if (existingSenderId) {
          senderId = existingSenderId;
        } else {
          const customerServiceId =
            await this.departmentService.getDepartmentByName(
              "Customer Service"
            );
          if (!customerServiceId) {
            throw new Error("Default Customer Service department not found");
          }
          senderId = await this.senderService.createOrGetSender(
            phoneNumber,
            customerServiceId
          );
        }
      }

      const ticketId = await this.createTicket(
        issue,
        description,
        senderId,
        priority
      );

      await this.messageService.saveTicketMessage(
        ticketId,
        `${issue}\n\n${description}`,
        senderId,
        "user"
      );

      console.log(
        `✅ Ticket ${ticketId} created from WhatsApp message from ${phoneNumber}`
      );
      return ticketId;
    } catch (error) {
      console.error("❌ Failed to create ticket from WhatsApp:", error);
      throw error;
    }
  }

  async addMessageToTicket(
    ticketId: number,
    phoneNumber: string,
    message: string,
    departmentName?: string
  ): Promise<void> {
    try {
      let senderId: number;

      if (departmentName) {
        const departmentId = await this.departmentService.getDepartmentByName(
          departmentName
        );
        if (!departmentId) {
          throw new Error(`Department '${departmentName}' not found`);
        }
        senderId = await this.senderService.createOrGetSender(
          phoneNumber,
          departmentId
        );
      } else {
        const existingSenderId = await this.senderService.getSenderByPhone(
          phoneNumber
        );
        if (existingSenderId) {
          senderId = existingSenderId;
        } else {
          const customerServiceId =
            await this.departmentService.getDepartmentByName(
              "Customer Service"
            );
          if (!customerServiceId) {
            throw new Error("Default Customer Service department not found");
          }
          senderId = await this.senderService.createOrGetSender(
            phoneNumber,
            customerServiceId
          );
        }
      }

      await this.messageService.saveTicketMessage(
        ticketId,
        message,
        senderId,
        "user"
      );
      console.log(`✅ Message added to ticket ${ticketId} from ${phoneNumber}`);
    } catch (error) {
      console.error("❌ Failed to add message to ticket:", error);
      throw error;
    }
  }

  async getAllTicketsByPhoneNumber(phoneNumber: string): Promise<any[] | null> {
    try {
      const result = await pool.query(
        `SELECT 
         t.*,
         u.name as assigned_user_name,
         s.phone_number as creator_phone,
         d.name as creator_department
       FROM tickets t
       LEFT JOIN users u ON t.assigned_to = u.id
       JOIN senders s ON t.created_by = s.id
       JOIN departments d ON s.department_id = d.id
       WHERE s.phone_number = $1 
         AND t.status IN ('open', 'in_progress')
       ORDER BY t.created_at DESC`,
        [phoneNumber]
      );

      return result.rows;
    } catch (error) {
      console.error("❌ Failed to get open ticket by phone number:", error);
      return null;
    }
  }

  async getTicketStatsByPhoneNumber(phoneNumber: string): Promise<{
    total: number;
    open: number;
    in_progress: number;
    closed: number;
    resolved: number;
  }> {
    try {
      const result = await pool.query(
        `SELECT 
       COUNT(*) as total,
       COUNT(CASE WHEN status = 'open' THEN 1 END) as open,
       COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
       COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed,
       COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved
     FROM tickets t
     JOIN senders s ON t.created_by = s.id
     WHERE s.phone_number = $1`,
        [phoneNumber]
      );

      return {
        total: parseInt(result.rows[0].total) || 0,
        open: parseInt(result.rows[0].open) || 0,
        in_progress: parseInt(result.rows[0].in_progress) || 0,
        closed: parseInt(result.rows[0].closed) || 0,
        resolved: parseInt(result.rows[0].resolved) || 0,
      };
    } catch (error) {
      console.error("❌ Failed to get ticket stats:", error);
      return { total: 0, open: 0, in_progress: 0, closed: 0, resolved: 0 };
    }
  }
}
