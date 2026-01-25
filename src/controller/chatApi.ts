import { status } from "elysia";
import { Types } from "mongoose";
import {
  getChatForUser,
  bulkInsertMessages,
  updateChatUpdatedAt,
  pruneChatsForUser,
  listChatSummaries,
  createChatForUser,
  type ChatSummary,
} from "../databases/services/chatQueries";
import { messageBufferConfig } from "../databases/services/messageBufferService";
import type { MessageRole } from "../databases/models/message";

/** Create a new chat for user. Returns { chatId, createdAt, updatedAt }. */
export async function createChat(body: { user_id: string }) {
  const { user_id } = body;
  if (!user_id) return status(400, { error: "user_id required" });
  const chat = await createChatForUser(user_id);
  if (!chat) return status(404, { error: "User not found" });
  return {
    chatId: String(chat._id),
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

/** Persist messages (sync): bulk insert, update Chat.updatedAt, prune. Return chat summaries. */
export async function persistMessages(
  chatId: string,
  body: { user_id: string; messages: Array<{ role: MessageRole; content: string }> }
) {
  const { user_id, messages } = body;
  if (!user_id) return status(400, { error: "user_id required" });
  if (!messages?.length) return status(400, { error: "messages required" });
  if (!Types.ObjectId.isValid(chatId)) return status(400, { error: "Invalid chatId" });

  const cid = new Types.ObjectId(chatId);
  const chat = await getChatForUser(cid, user_id);
  if (!chat) return status(404, { error: "Chat not found or access denied" });

  await bulkInsertMessages(cid, messages);
  await updateChatUpdatedAt(cid);
  await pruneChatsForUser(chat.user, messageBufferConfig.maxChatsPerUser);

  const summaries = await listChatSummaries(user_id);
  return { ok: true, summaries };
}

/** List chat summaries for user. */
export async function getChatSummaries(query: { user_id: string }) {
  const { user_id } = query;
  if (!user_id) return status(400, { error: "user_id required" });
  const summaries: ChatSummary[] = await listChatSummaries(user_id);
  return { summaries };
}
