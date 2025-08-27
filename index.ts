import 'dotenv/config';
import { WhatsAppBot } from "./WhatsAppBot.js";

const bot = new WhatsAppBot();

process.on('SIGINT', async () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...");
  await bot.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
  await bot.shutdown();
  process.exit(0);
});

// Start the bot
bot.initialize().catch((error) => {
  console.error("❌ Failed to start bot:", error);
  process.exit(1);
});

// Export for external usage
export default bot;