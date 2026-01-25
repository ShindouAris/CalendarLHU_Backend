import mongoose, { Schema, Document, Types } from "mongoose";

export type MessageRole = "user" | "assistant" | "system";

export interface IMessage extends Document {
  _id: Types.ObjectId;
  chat: Types.ObjectId;
  role: MessageRole;
  content: string;
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
    content: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

MessageSchema.index({ chat: 1, createdAt: 1 });

export const MessageModel = mongoose.model<IMessage>("Message", MessageSchema);
