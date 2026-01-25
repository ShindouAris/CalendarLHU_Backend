import mongoose, { Schema, Document, Types } from "mongoose";

export interface IChat extends Document {
  _id: Types.ObjectId;
  chatID: string;
  user: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ChatSchema = new Schema<IChat>(
  {
    chatID: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomUUID(),
    },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

ChatSchema.index({ user: 1, updatedAt: -1 });

export const ChatModel = mongoose.model<IChat>("Chat", ChatSchema);
