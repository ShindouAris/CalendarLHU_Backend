import mongoose from "mongoose";

const MONGO_URI = process.env.DATABASE_URL || "mongodb://localhost:27017/lhu-dashboard";

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("🆗 MongoDB connected successfully");
  } catch (error) {
    console.error("＞︿＜ MongoDB connection failed:", error);
    process.exit(1);
  }
};

export { ChatModel } from "./models/chat";
export { MessageModel } from "./models/message";
export * from "./services/chatQueries";
export {
  addToBuffer,
  flushNow,
  messageBufferConfig,
} from "./services/messageBufferService";
