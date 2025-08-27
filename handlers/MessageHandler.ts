import { WAMessage, downloadMediaMessage, getContentType } from "baileys";
import { TicketService } from "../services/TicketService.js";
import { ConfigService } from "../services/ConfigService.js";
import { DepartmentService } from "../services/DepartmentService.js";
import { SenderService } from "../services/SenderService.js";

interface UserSession {
  phoneNumber: string;
  awaitingDepartment: boolean;
  awaitingTicketDecision: boolean;
  awaitingTicketSelection: boolean; // New state for ticket selection
  awaitingTicketUpdate: boolean; // New state for ticket update message
  awaitingIssueTitle: boolean;
  existingTickets?: any[]; // Store full ticket objects instead of just IDs
  selectedTicketId?: number; // Store the selected ticket ID
  firstMessage?: string;
  selectedDepartment?: string;
  selectedDepartmentId?: number;
  timestamp: number;
}

export class MessageHandler {
  private ticketService = new TicketService();
  private departmentService = new DepartmentService();
  private senderService = new SenderService();
  private config = ConfigService.getInstance();

  constructor(private sock: any) {}

  private userSessions = new Map<string, UserSession>();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000;

  private readonly DEPARTMENTS = {
    "1": "Human Resources",
    "2": "Finance",
    "3": "Marketing",
    "4": "Post Production",
    "5": "Editing",
  } as const;

  async handleMessage(msg: WAMessage): Promise<void> {
    try {
      if (!msg.message) return;

      const messageType = getContentType(msg.message);
      const jid = msg.key.remoteJid || "unknown";
      const phoneNumber = this.extractPhoneNumber(jid);
      const timestamp =
        typeof msg.messageTimestamp === "object" &&
        msg.messageTimestamp?.toNumber
          ? msg.messageTimestamp.toNumber()
          : (msg.messageTimestamp as number) || Date.now();

      console.log("📌 Detected type:", messageType, "from:", jid);

      // Clean up old sessions
      this.cleanupExpiredSessions();

      switch (messageType) {
        case "conversation":
        case "extendedTextMessage":
          await this.handleTextMessage(
            msg,
            messageType,
            jid,
            phoneNumber,
            timestamp
          );
          break;
        case "imageMessage":
          await this.handleImageMessage(msg, jid, phoneNumber, timestamp);
          break;
        default:
          console.log("🔍 Unhandled message type:", messageType);
          await this.handleGenericMessage(
            messageType || "unknown",
            phoneNumber,
            timestamp
          );
      }
    } catch (error) {
      console.error("❌ Error handling message:", error);
    }
  }

  private async handleTextMessage(
    msg: WAMessage,
    messageType: string,
    jid: string,
    phoneNumber: string,
    timestamp: number
  ): Promise<void> {
    try {
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";
      if (!text) return;

      if (this.config.get("enableTextLogging")) {
        console.log("💬 Text from", jid, ":", text);
      }

      const session = this.userSessions.get(phoneNumber);

      // Handle existing session states first
      if (session?.awaitingDepartment) {
        await this.handleDepartmentSelection(phoneNumber, text.trim(), jid);
        return;
      }

      if (session?.awaitingIssueTitle) {
        await this.handleIssueTitle(phoneNumber, text.trim(), jid);
        return;
      }

      if (session?.awaitingTicketDecision) {
        await this.handleTicketDecision(phoneNumber, text.trim(), jid);
        return;
      }

      // New: Handle ticket selection
      if (session?.awaitingTicketSelection) {
        await this.handleTicketSelection(phoneNumber, text.trim(), jid);
        return;
      }

      // New: Handle ticket update message
      if (session?.awaitingTicketUpdate) {
        await this.handleTicketUpdate(phoneNumber, text.trim(), jid);
        return;
      }

      // No active session - determine next step based on user's history
      await this.processNewMessage(phoneNumber, text, jid);

    } catch (error) {
      console.error("❌ Error handling text message:", error);
    }
  }

  private async processNewMessage(
    phoneNumber: string,
    message: string,
    jid: string
  ): Promise<void> {
    try {
      const existingTickets = await this.ticketService.getAllTicketsByPhoneNumber(phoneNumber);
      
      if (existingTickets && existingTickets.length > 0) {
        await this.askTicketDecision(phoneNumber, message, existingTickets, jid);
        return;
      }

      const userDepartmentId = await this.departmentService.getDepartmentByPhoneNumber(phoneNumber);
      
      if (userDepartmentId) {
        console.log(`🏢 User ${phoneNumber} has existing department ID: ${userDepartmentId}`);
        await this.initiateTicketCreationWithDepartment(phoneNumber, message, jid, userDepartmentId);
      } else {
        console.log(`🆕 First-time user ${phoneNumber} - initiating department selection`);
        await this.initiateDepartmentSelection(phoneNumber, message, jid);
      }
    } catch (error) {
      console.error("❌ Error processing new message:", error);
    }
  }

  private async initiateTicketCreationWithDepartment(
    phoneNumber: string,
    message: string,
    jid: string,
    departmentId: number
  ): Promise<void> {
    try {
      // Get department name
      const departmentName = Object.values(this.DEPARTMENTS)[departmentId - 1];
      
      this.userSessions.set(phoneNumber, {
        phoneNumber,
        awaitingDepartment: false,
        awaitingTicketDecision: false,
        awaitingTicketSelection: false,
        awaitingTicketUpdate: false,
        awaitingIssueTitle: true,
        firstMessage: message,
        selectedDepartment: departmentName,
        selectedDepartmentId: departmentId,
        timestamp: Date.now(),
      });

      const confirmMessage = `✅ Welcome back! We'll create a ticket for ${departmentName}.

Please briefly describe your issue or question in one line (this will be your ticket title):

Example: "Password reset request" or "Invoice inquiry" or "Project deadline question"`;

      await this.sock.sendMessage(jid, { text: confirmMessage });
      console.log(`🎯 Existing department ${departmentName} used for ${phoneNumber}, asking for issue title`);
    } catch (error) {
      console.error("❌ Error initiating ticket creation with department:", error);
    }
  }

  private async askTicketDecision(
    phoneNumber: string,
    message: string,
    tickets: any[],
    jid: string
  ): Promise<void> {
    try {
      this.userSessions.set(phoneNumber, {
        phoneNumber,
        awaitingDepartment: false,
        awaitingTicketDecision: true,
        awaitingTicketSelection: false,
        awaitingTicketUpdate: false,
        awaitingIssueTitle: false,
        existingTickets: tickets, // Store full ticket objects
        firstMessage: message,
        timestamp: Date.now(),
      });
      
      await this.askTicketDecisionText(phoneNumber, tickets, jid);
      console.log(`🤔 Ticket decision prompt sent to ${phoneNumber}`);
    } catch (error) {
      console.error("❌ Error asking ticket decision:", error);
      await this.askTicketDecisionText(phoneNumber, tickets, jid);
    }
  }

  private async askTicketDecisionText(
    phoneNumber: string,
    existingTickets: any[],
    jid: string
  ): Promise<void> {
    let ticketList = existingTickets
    .map((t, idx) => `#${t.id} - ${t.issue} (Status: ${t.status})`)
    .join("\n");

  const message = `🎫 You have the following open tickets:\n${ticketList}

What would you like to do?
1️⃣ Continue with existing ticket
2️⃣ Create a new ticket

Please reply with 1 or 2.`;

    await this.sock.sendMessage(jid, { text: message });
    console.log(`🤔 Text-based ticket decision sent to ${phoneNumber}`);
  }

  private async handleTicketDecision(
    phoneNumber: string,
    userInput: string,
    jid: string
  ): Promise<void> {
    try {
      const session = this.userSessions.get(phoneNumber);
      if (!session || !session.existingTickets) return;

      let decision = "";

      if (userInput === "continue_existing" || userInput === "1") {
        decision = "continue";
      } else if (userInput === "create_new" || userInput === "2") {
        decision = "new";
      } else {
        const errorMessage = `❌ Invalid selection. Please choose:
1️⃣ Continue with existing ticket
2️⃣ Create a new ticket`;

        await this.sock.sendMessage(jid, { text: errorMessage });
        return;
      }

      if (decision === "continue") {
        // Check if user has multiple tickets
        if (session.existingTickets.length > 1) {
          await this.askTicketSelection(phoneNumber, jid);
        } else {
          // Only one ticket, proceed directly
          const ticketId = session.existingTickets[0].id;
          await this.continueWithSelectedTicket(phoneNumber, ticketId, session.firstMessage || "Follow-up message", jid);
        }
      } else {
        // Clear session and create new ticket
        this.userSessions.delete(phoneNumber);
        
        const userDepartmentId = await this.departmentService.getDepartmentByPhoneNumber(phoneNumber);
      
        if (userDepartmentId) {
          await this.initiateTicketCreationWithDepartment(
            phoneNumber, 
            session.firstMessage || "", 
            jid, 
            userDepartmentId
          );
        } else {
          await this.initiateDepartmentSelection(
            phoneNumber,
            session.firstMessage || "",
            jid
          );
        }
      }
    } catch (error) {
      console.error("❌ Error handling ticket decision:", error);
    }
  }

  private async askTicketSelection(phoneNumber: string, jid: string): Promise<void> {
    try {
      const session = this.userSessions.get(phoneNumber);
      if (!session || !session.existingTickets) return;

      // Update session state to await ticket selection
      this.userSessions.set(phoneNumber, {
        ...session,
        awaitingTicketDecision: false,
        awaitingTicketSelection: true,
        awaitingTicketUpdate: false,
      });

      // Create ticket selection message
      let ticketList = session.existingTickets
        .map((t, idx) => `${idx + 1}️⃣ Ticket #${t.id} - ${t.issue}\n   Status: ${t.status}\n   Created: ${new Date(t.created_at).toLocaleDateString()}`)
        .join("\n\n");

      const selectionMessage = `🎫 Please select which ticket you'd like to continue with:

${ticketList}

Reply with the number (${session.existingTickets.map((_, idx) => idx + 1).join(', ')}) of the ticket you want to continue.`;

      await this.sock.sendMessage(jid, { text: selectionMessage });
      console.log(`🎯 Ticket selection prompt sent to ${phoneNumber}`);
    } catch (error) {
      console.error("❌ Error asking ticket selection:", error);
    }
  }

  private async handleTicketSelection(
    phoneNumber: string,
    userInput: string,
    jid: string
  ): Promise<void> {
    try {
      const session = this.userSessions.get(phoneNumber);
      if (!session || !session.existingTickets) return;

      const selection = parseInt(userInput.trim());
      
      // Validate selection
      if (isNaN(selection) || selection < 1 || selection > session.existingTickets.length) {
        const errorMessage = `❌ Invalid selection. Please reply with a number between 1 and ${session.existingTickets.length}.`;
        await this.sock.sendMessage(jid, { text: errorMessage });
        return;
      }

      const selectedTicket = session.existingTickets[selection - 1];
      
      // Update session to await ticket update message
      this.userSessions.set(phoneNumber, {
        ...session,
        awaitingTicketSelection: false,
        awaitingTicketUpdate: true,
        selectedTicketId: selectedTicket.id,
      });

      // Ask for update message
      const updateMessage = `🎫 You've selected Ticket #${selectedTicket.id} - "${selectedTicket.issue}"

Please provide an update about this issue. What new information or developments would you like to add to this ticket?

Example: "The problem is getting worse" or "I tried the suggested solution but it didn't work" or "Here's additional information about the issue"`;

      await this.sock.sendMessage(jid, { text: updateMessage });
      console.log(`📝 Requesting update message for ticket ${selectedTicket.id} from ${phoneNumber}`);
      
    } catch (error) {
      console.error("❌ Error handling ticket selection:", error);
    }
  }

  private async handleTicketUpdate(
    phoneNumber: string,
    updateMessage: string,
    jid: string
  ): Promise<void> {
    try {
      const session = this.userSessions.get(phoneNumber);
      if (!session || !session.selectedTicketId) return;

      if (updateMessage.length < 5) {
        const errorMessage = `❌ Please provide a more detailed update (at least 5 characters).

For example: "The issue is still occurring" or "I have new information about the problem"`;

        await this.sock.sendMessage(jid, { text: errorMessage });
        return;
      }

      if (updateMessage.length > 500) {
        const errorMessage = `❌ Update message is too long (max 500 characters). Please keep it concise.

Current length: ${updateMessage.length} characters`;

        await this.sock.sendMessage(jid, { text: errorMessage });
        return;
      }

      await this.continueWithSelectedTicket(phoneNumber, session.selectedTicketId, updateMessage, jid);
      
    } catch (error) {
      console.error("❌ Error handling ticket update:", error);
    }
  }

  // FIXED: Single unified method for continuing with selected ticket
  private async continueWithSelectedTicket(
    phoneNumber: string,
    ticketId: number,
    message: string,
    jid: string
  ): Promise<void> {
    try {
      const session = this.userSessions.get(phoneNumber);
      if (!session) return;

      // Add the message to the selected ticket
      await this.ticketService.addMessageToTicket(
        ticketId,
        phoneNumber,
        message
      );

      // Send confirmation with the message
      await this.sock.sendMessage(jid, {
        text: `✅ Your message has been added to ticket #${ticketId}:

"${message}"

We'll review your update and respond soon!`,
      });

      console.log(
        `💬 Message added to ticket ${ticketId} for ${phoneNumber}: "${message.substring(0, 50)}..."`
      );

      // Clear session after successful update
      this.userSessions.delete(phoneNumber);
      
    } catch (error) {
      console.error("❌ Error continuing with selected ticket:", error);
      await this.sock.sendMessage(jid, {
        text: "❌ Sorry, there was an error adding your message to the ticket. Please try again.",
      });
      // Clear session on error
      this.userSessions.delete(phoneNumber);
    }
  }

  private async initiateDepartmentSelection(
    phoneNumber: string,
    firstMessage: string,
    jid: string
  ): Promise<void> {
    try {
      this.userSessions.set(phoneNumber, {
        phoneNumber,
        awaitingDepartment: true,
        awaitingTicketDecision: false,
        awaitingTicketSelection: false,
        awaitingTicketUpdate: false,
        awaitingIssueTitle: false,
        firstMessage,
        timestamp: Date.now(),
      });

      const departmentMessage = `👋 Welcome! Please specify which department you're contacting:

1️⃣ HR
2️⃣ Finance
3️⃣ Marketing
4️⃣ PostProd
5️⃣ Editing

Please reply with the number (1-5) of your desired department.`;

      await this.sock.sendMessage(jid, { text: departmentMessage });
      console.log(`🏢 Department selection sent to ${phoneNumber}`);
    } catch (error) {
      console.error("❌ Error initiating department selection:", error);
    }
  }

  private async handleDepartmentSelection(
    phoneNumber: string,
    userInput: string,
    jid: string
  ): Promise<void> {
    try {
      const session = this.userSessions.get(phoneNumber);
      if (!session) return;

      const departmentKey = userInput.trim();
      const department = this.DEPARTMENTS[departmentKey as keyof typeof this.DEPARTMENTS];

      if (!department) {
        const errorMessage = `❌ Invalid selection. Please reply with a number from 1-5:

1️⃣ HR
2️⃣ Finance  
3️⃣ Marketing
4️⃣ PostProd
5️⃣ Editing`;

        await this.sock.sendMessage(jid, { text: errorMessage });
        console.log(`🔄 Invalid department selection from ${phoneNumber}: ${userInput}`);
        return;
      }

      const departmentId = parseInt(departmentKey);

      try {
        await this.departmentService.assignUserToDepartment(phoneNumber, departmentId);
        console.log(`💾 Assigned user ${phoneNumber} to department ${department} (ID: ${departmentId})`);
      } catch (error) {
        console.error("❌ Error assigning user to department:", error);
      }

      this.userSessions.set(phoneNumber, {
        ...session,
        awaitingDepartment: false,
        awaitingTicketSelection: false,
        awaitingTicketUpdate: false,
        awaitingIssueTitle: true,
        selectedDepartment: department,
        selectedDepartmentId: departmentId,
        timestamp: Date.now(),
      });

      const confirmMessage = `✅ Great! You've selected ${department}.

Now, please briefly describe your issue or question in one line (this will be your ticket title):

Example: "Password reset request" or "Invoice inquiry" or "Project deadline question"`;

      await this.sock.sendMessage(jid, { text: confirmMessage });
      console.log(`🎯 Department ${department} selected by ${phoneNumber}, asking for issue title`);
    } catch (error) {
      console.error("❌ Error handling department selection:", error);
    }
  }

  private async handleIssueTitle(
    phoneNumber: string,
    issueTitle: string,
    jid: string
  ): Promise<void> {
    try {
      const session = this.userSessions.get(phoneNumber);
      if (!session || !session.selectedDepartment) return;

      if (issueTitle.length < 5) {
        const errorMessage = `❌ Please provide a more descriptive issue title (at least 5 characters).

For example: "Password reset request" or "Invoice inquiry"`;

        await this.sock.sendMessage(jid, { text: errorMessage });
        return;
      }

      if (issueTitle.length > 100) {
        const errorMessage = `❌ Issue title is too long (max 100 characters). Please keep it brief and descriptive.

Current length: ${issueTitle.length} characters`;

        await this.sock.sendMessage(jid, { text: errorMessage });
        return;
      }

      // Clear session before creating ticket
      this.userSessions.delete(phoneNumber);

      const confirmMessage = `✅ Perfect! Creating your ticket now...

📋 **Issue:** ${issueTitle}
🏢 **Department:** ${session.selectedDepartment}`;

      await this.sock.sendMessage(jid, { text: confirmMessage });
      console.log(`📝 Issue title "${issueTitle}" provided by ${phoneNumber}`);

      // Create the ticket
      await this.createNewTicket(
        phoneNumber,
        session.firstMessage || "No additional details provided",
        session.selectedDepartment,
        issueTitle,
        jid,
        session.selectedDepartmentId
      );
    } catch (error) {
      console.error("❌ Error handling issue title:", error);
    }
  }

  private async handleImageMessage(
    msg: WAMessage,
    jid: string,
    phoneNumber: string,
    timestamp: number
  ): Promise<void> {
    // Implementation for image messages
    console.log(`📸 Image message received from ${phoneNumber}`);
  }

  private async handleGenericMessage(
    messageType: string,
    phoneNumber: string,
    timestamp: number
  ): Promise<void> {
    console.log(`🔍 Generic message type ${messageType} from ${phoneNumber}`);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [phoneNumber, session] of this.userSessions.entries()) {
      if (now - session.timestamp > this.SESSION_TIMEOUT) {
        this.userSessions.delete(phoneNumber);
        console.log(`🧹 Cleaned up expired session for ${phoneNumber}`);
      }
    }
  }

  private extractPhoneNumber(jid: string): string {
    return jid.split("@")[0].replace(/\D/g, "");
  }

  private async sendTicketAcknowledgment(
    phoneNumber: string,
    ticketId: number,
    issueTitle: string,
    department: string,
    jid: string
  ): Promise<void> {
    try {
      const message = `🎫 **Ticket Created Successfully!**

**Ticket #${ticketId}**
📋 **Issue:** ${issueTitle}
🏢 **Department:** ${department}
📅 **Created:** ${new Date().toLocaleString()}

We've received your inquiry and will respond as soon as possible. You can reference ticket #${ticketId} for any follow-up questions.

Thank you for contacting us! 🙏`;

      await this.sock.sendMessage(jid, { text: message });
      console.log(
        `✅ Ticket acknowledgment sent to ${phoneNumber} for ticket ${ticketId}: "${issueTitle}"`
      );
    } catch (error) {
      console.error("❌ Error sending ticket acknowledgment:", error);
    }
  }

  private async sendExistingTicketAcknowledgment(
    phoneNumber: string,
    ticketId: number
  ): Promise<void> {
    try {
      const jid = `${phoneNumber}@s.whatsapp.net`;
      const message = `📝 Your message has been added to ticket #${ticketId}. We'll respond soon!`;
      console.log(message);
      await this.sock.sendMessage(jid, { text: message });
    } catch (error) {
      console.error("❌ Error sending existing ticket acknowledgment:", error);
    }
  }

  private async createNewTicket(
    phoneNumber: string,
    message: string,
    department: string,
    issueTitle: string,
    jid: string,
    departmentId?: number
  ): Promise<void> {
    try {
      // Create or get sender using the SenderService
      let senderId: number;
      if (departmentId) {
        senderId = await this.senderService.createOrGetSender(phoneNumber, departmentId);
      } else {
        // Fallback: try to get existing sender or create with default department
        senderId = await this.senderService.getSenderByPhone(phoneNumber) || 
                   await this.senderService.createOrGetSender(phoneNumber, 1); // Default to HR
      }

      const ticketId = await this.ticketService.createTicketFromWhatsApp(
        phoneNumber,
        issueTitle,
        message,
        department,
        "medium"
      );

      console.log(
        `🎫 New ticket ${ticketId} created for ${phoneNumber} (sender: ${senderId}) - Department: ${department}, Issue: ${issueTitle}`
      );

      const shouldSendAcknowledgment = this.config.get("enableDatabaseStorage");
      if (shouldSendAcknowledgment) {
        await this.sendTicketAcknowledgment(
          phoneNumber,
          ticketId,
          issueTitle,
          department,
          jid
        );
      }
    } catch (error) {
      console.error("❌ Error creating new ticket:", error);
      await this.sock.sendMessage(jid, {
        text: "❌ Sorry, there was an error creating your ticket. Please try again later.",
      });
    }
  }
}