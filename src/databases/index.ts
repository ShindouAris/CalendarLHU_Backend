import mongoose from "mongoose";
import { MessageModel } from "./models/message";
import { ChatModel } from "./models/chat";

const MONGO_URI = process.env.DATABASE_URL || "mongodb://localhost:27017/lhu-dashboard";

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      maxPoolSize: 10,        // Maximum 10 connections in pool
      minPoolSize: 2,         // Keep at least 2 connections alive
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      serverSelectionTimeoutMS: 5000, // Timeout after 5s if server not found
    });
    console.log("🆗 MongoDB connected successfully");

    // Backward-compat cleanup: older versions created a unique index on Message.chatID.
    // That index breaks inserts once chatID is removed/unused (missing values collide under unique index).
    try {
      await MessageModel.collection.dropIndex("chatID_1");
      console.log("🧹 Dropped obsolete index Message.chatID_1");
    } catch {
      // ignore if index doesn't exist
    }

    // Backfill missing Chat.chatID (UUID) for older documents.
    const missing = await ChatModel.find({
      $or: [{ chatID: { $exists: false } }, { chatID: null }, { chatID: "" }],
    })
      .select({ _id: 1 })
      .lean();
    for (const c of missing) {
      await ChatModel.updateOne(
        { _id: c._id },
        { $set: { chatID: crypto.randomUUID() } }
      );
    }

    // Ensure expected indexes exist.
    // (Lightweight; avoids surprises if autoIndex is disabled elsewhere.)
    await Promise.all([ChatModel.syncIndexes(), MessageModel.syncIndexes()]);
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
