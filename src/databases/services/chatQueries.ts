import { Types } from "mongoose";
import { ChatModel } from "../models/chat";
import { MessageModel } from "../models/message";
import { UserModel } from "../models/user";
import type { MessageRole } from "../models/message";
import { UIMessagePart } from "ai";

// -----------------------------------------------------------------------------
// Example queries for the scalable Chat + Message architecture
// -----------------------------------------------------------------------------

/** Create a new chat. Does NOT touch Message collection. */
export async function createChat(userId: Types.ObjectId) {
  const doc = await ChatModel.create({ user: userId });
  return doc;
}

/** Find or create a chat for a user by UserID (string). Resolves User first. */
export async function getOrCreateChatForUser(userId: string) {
  const user = await UserModel.findOne({ UserID: userId }).lean();
  if (!user) return null;
  const uid = user._id as Types.ObjectId;
  const existing = await ChatModel.findOne({ user: uid })
    .sort({ updatedAt: -1 })
    .lean();
  if (existing) return existing;
  const created = await ChatModel.create({ user: uid });
  return created.toObject ? created.toObject() : created;
}

/** Create a new chat for user by UserID (string). */
export async function createChatForUser(userId: string) {
  const user = await UserModel.findOne({ UserID: userId }).lean();
  if (!user) return null;
  const created = await ChatModel.create({ user: user._id });
  return created.toObject ? created.toObject() : created;
}

/** Add a message to a chat. Does NOT rewrite the Chat document. */
export async function addMessage(
  chatId: Types.ObjectId,
  role: MessageRole,
  parts: UIMessagePart<Record<string, any>, Record<string, any>>[]
) {
  const doc = await MessageModel.create({
    chat: chatId,
    role,
    parts,
  });
  return doc;
}

export interface LoadHistoryOptions {
  chatId: Types.ObjectId;
  limit?: number;
  skip?: number;
  /** Cursor-based: return messages after this date (exclusive). Use with createdAt + _id for stable pagination. */
  after?: { createdAt: Date; _id: Types.ObjectId };
}

/** Load chat history with pagination. Fetches from Message collection only. */
export async function loadChatHistory(options: LoadHistoryOptions) {
  const { chatId, limit = 20, skip = 0, after } = options;

  const filter: Record<string, unknown> = { chat: chatId };

  if (after) {
    filter.$or = [
      { createdAt: { $gt: after.createdAt } },
      {
        createdAt: after.createdAt,
        _id: { $gt: after._id },
      },
    ];
  }

  const skipToUse = after ? 0 : skip;
  const messages = await MessageModel.find(filter)
    .sort({ createdAt: 1 })
    .skip(skipToUse)
    .limit(limit)
    .lean();

  return messages;
}

/** Offset-based pagination: load page `page` (1-based) with `pageSize` messages. */
export async function loadChatHistoryByPage(
  chatId: Types.ObjectId,
  page: number,
  pageSize: number
) {
  const skip = (Math.max(1, page) - 1) * pageSize;
  return loadChatHistory({ chatId, skip, limit: pageSize });
}

/** Delete a chat and cascade-delete all its messages. */
export async function deleteChat(chatId: Types.ObjectId) {
  await MessageModel.deleteMany({ chat: chatId });
  const result = await ChatModel.deleteOne({ _id: chatId });
  return result;
}

/** Bulk insert messages. Does NOT update Chat. */
export async function bulkInsertMessages(
  chatId: Types.ObjectId,
  messages: Array<{
    role: MessageRole;
    parts: UIMessagePart<Record<string, any>, Record<string, any>>[];
  }>
) {
  if (messages.length === 0) return [];
  const docs = messages.map((m) => ({
    chat: chatId,
    role: m.role,
    parts: m.parts,
  }));
  const inserted = await MessageModel.insertMany(docs);
  return inserted;
}

/** Update only Chat.updatedAt (no rewrite, no messages). */
export async function updateChatUpdatedAt(chatId: Types.ObjectId) {
  const result = await ChatModel.updateOne(
    { _id: chatId },
    { $set: { updatedAt: new Date() } }
  );
  return result;
}

/** Prune user's chats: keep latest N by updatedAt, cascade-delete rest. */
export async function pruneChatsForUser(
  userObjectId: Types.ObjectId,
  keepN: number
) {
  const chats = await ChatModel.find({ user: userObjectId })
    .sort({ updatedAt: -1 })
    .lean();
  if (chats.length <= keepN) return { deleted: 0 };
  const toDelete = chats.slice(keepN);
  for (const c of toDelete) {
    await MessageModel.deleteMany({ chat: c._id });
    await ChatModel.deleteOne({ _id: c._id });
  }
  return { deleted: toDelete.length };
}

export interface ChatSummary {
  chatId: string;
  chatUUID?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface ListChatSummariesOptions {
  limit?: number;
  /** Cursor: return chats *after* this cursor in the sorted list (updatedAt desc, _id desc). */
  after?: { updatedAt: Date; _id: Types.ObjectId };
}

/**
 * List chat summaries for user with cursor-based pagination.
 * Sort: updatedAt desc, _id desc (stable).
 */
export async function listChatSummariesPaginated(
  userId: string,
  options: ListChatSummariesOptions
): Promise<{ chats: ChatSummary[]; next?: { updatedAt: Date; _id: Types.ObjectId } }> {
  const { limit = 20, after } = options;

  const user = await UserModel.findOne({ UserID: userId }).lean();
  if (!user) return { chats: [] };
  const uid = user._id as Types.ObjectId;

  const filter: Record<string, unknown> = { user: uid };
  if (after) {
    filter.$or = [
      { updatedAt: { $lt: after.updatedAt } },
      { updatedAt: after.updatedAt, _id: { $lt: after._id } },
    ];
  }

  const docs = await ChatModel.find(filter)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(Math.max(1, Math.min(100, limit)) + 1)
    .lean();

  const hasMore = docs.length > Math.max(1, Math.min(100, limit));
  const page = hasMore ? docs.slice(0, Math.max(1, Math.min(100, limit))) : docs;

  const counts = await Promise.all(
    page.map((c) => MessageModel.countDocuments({ chat: c._id }))
  );

  const chats: ChatSummary[] = page.map((c, idx) => ({
    chatId: String(c._id),
    chatUUID: (c as any).chatID,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: counts[idx] ?? 0,
  }));

  const next = hasMore
    ? ({ updatedAt: page[page.length - 1].updatedAt, _id: page[page.length - 1]._id } as {
        updatedAt: Date;
        _id: Types.ObjectId;
      })
    : undefined;

  return { chats, next };
}

/** List chat summaries for user (by UserID string). Sorted by updatedAt desc. */
export async function listChatSummaries(userId: string): Promise<ChatSummary[]> {
  const user = await UserModel.findOne({ UserID: userId }).lean();
  if (!user) return [];
  const uid = user._id as Types.ObjectId;
  const chats = await ChatModel.find({ user: uid })
    .sort({ updatedAt: -1 })
    .lean();
  const summaries: ChatSummary[] = [];
  for (const c of chats) {
    const messageCount = await MessageModel.countDocuments({ chat: c._id });
    summaries.push({
      chatId: String(c._id),
      chatUUID: (c as any).chatID,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount,
    });
  }
  return summaries;
}

/** Get chat by id and ensure it belongs to user (UserID string). Returns null if not found or not owned. */
export async function getChatForUser(
  chatId: Types.ObjectId,
  userId: string
): Promise<{ _id: Types.ObjectId; user: Types.ObjectId } | null> {
  const user = await UserModel.findOne({ UserID: userId }).lean();
  if (!user) return null;
  const chat = await ChatModel.findOne({
    _id: chatId,
    user: user._id,
  }).lean();
  return chat as { _id: Types.ObjectId; user: Types.ObjectId } | null;
}

/** Get chat by UUID (chatID) and ensure it belongs to user (UserID string). */
export async function getChatForUserByUUID(
  chatUUID: string,
  userId: string
): Promise<{ _id: Types.ObjectId; user: Types.ObjectId } | null> {
  const user = await UserModel.findOne({ UserID: userId }).lean();
  if (!user) return null;
  const chat = await ChatModel.findOne({
    chatID: chatUUID,
    user: user._id,
  }).lean();
  return chat as { _id: Types.ObjectId; user: Types.ObjectId } | null;
}
