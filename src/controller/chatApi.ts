import { status } from "elysia";
import { Types } from "mongoose";
import { userApi } from "./user";
import {
  getChatForUser,
  getChatForUserByUUID,
  loadChatHistory,
  listChatSummaries,
  type ChatSummary,
} from "../databases/services/chatQueries";

function encodeNextToken(createdAt: Date, _id: Types.ObjectId): string {
  const payload = { t: createdAt.getTime(), id: String(_id) };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

function decodeNextToken(
  token: string
): { createdAt: Date; _id: Types.ObjectId } | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const { t, id } = JSON.parse(raw) as { t: number; id: string };
    if (typeof t !== "number" || !id) return null;
    return { createdAt: new Date(t), _id: new Types.ObjectId(id) };
  } catch {
    return null;
  }
}

async function resolveUserFromToken(accessToken: string): Promise<string | null> {
  const user = await userApi.userinfo(accessToken);
  if (!user || typeof user !== "object" || !("UserID" in user)) return null;
  return (user as { UserID: string }).UserID;
}

/** List chats: dùng accessToken, lấy UserID từ userinfo rồi list. */
export async function listChats(body: { accessToken: string }) {
  const { accessToken } = body;
  if (!accessToken) return status(401, { error: "accessToken required" });
  const userId = await resolveUserFromToken(accessToken);
  if (!userId) return status(401, { error: "Invalid or expired token" });
  const chats: ChatSummary[] = await listChatSummaries(userId);
  return { chats };
}

/** Load chat history với phân trang next_token. Cần accessToken để xác thực chat thuộc user. */
export async function loadChatHistoryHandler(
  chatId: string,
  body: { accessToken: string; next_token?: string; limit?: number }
) {
  const { accessToken, next_token, limit = 20 } = body;
  if (!accessToken) return status(401, { error: "accessToken required" });

  const userId = await resolveUserFromToken(accessToken);
  if (!userId) return status(401, { error: "Invalid or expired token" });

  // Support both Mongo ObjectId and UUID chatID from frontend.
  const isMongoId = Types.ObjectId.isValid(chatId);
  const chat = isMongoId
    ? await getChatForUser(new Types.ObjectId(chatId), userId)
    : await getChatForUserByUUID(chatId, userId);
  if (!chat) return status(404, { error: "Chat not found or access denied" });

  let after: { createdAt: Date; _id: Types.ObjectId } | undefined;
  if (next_token) {
    const decoded = decodeNextToken(next_token);
    if (!decoded) return status(400, { error: "Invalid next_token" });
    after = decoded;
  }
  const messages = await loadChatHistory({
    chatId: chat._id,
    limit,
    after,
  });

  const last = messages[messages.length - 1] as
    | { createdAt: Date; _id: Types.ObjectId }
    | undefined;
  const next_token_out =
    messages.length >= limit && last
      ? encodeNextToken(last.createdAt, last._id)
      : null;

  const partsToText = (parts: unknown): string => {
    if (!Array.isArray(parts)) return "";
    return parts
      .filter((p: any) => p && p.type === "text" && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("");
  };

  return {
    chatId: String(chat._id),
    chatUUID: (chat as any).chatID ?? (isMongoId ? null : chatId),
    messages: messages.map((m) => ({
      id: String(m._id),
      role: m.role,
      parts: (m as any).parts ?? [],
      content: partsToText((m as any).parts),
      createdAt: m.createdAt,
    })),
    next_token: next_token_out,
  };
}
