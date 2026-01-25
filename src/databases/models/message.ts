import mongoose, { Schema, Document, Types } from "mongoose";
import { UIMessagePart } from "ai";

export type MessageRole = "user" | "assistant" | "system";

export interface IMessage extends Document {
  _id: Types.ObjectId;
  chat: Types.ObjectId; // Reference to Chat
  role: MessageRole;
  parts: UIMessagePart<Record<string, any>, Record<string, any>>[];
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    chat: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    role: {
      type: String,
      required: true,
      enum: ["user", "assistant", "system"],
    },
    parts: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

MessageSchema.index({ chat: 1, createdAt: 1 });

export const MessageModel = mongoose.model<IMessage>("Message", MessageSchema);
