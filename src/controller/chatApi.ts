import { status } from "elysia";
import { userApi } from "./user";
import {
  getChatForUser,
  getChatForUserByUUID,
  loadChatHistory,
  listChatSummariesPaginated,
  type ChatSummary,
} from "../databases/services/chatQueries";

function encodeNextToken(createdAt: Date, id: string): string {
  const payload = { t: createdAt.getTime(), id };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

function decodeNextToken(
  token: string
): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const { t, id } = JSON.parse(raw) as { t: number; id: string };
    if (typeof t !== "number" || !id) return null;
    return { createdAt: new Date(t), id };
  } catch {
    return null;
  }
}

function encodeChatListToken(updatedAt: Date, id: string): string {
  const payload = { t: updatedAt.getTime(), id };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

function decodeChatListToken(
  token: string
): { updatedAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const { t, id } = JSON.parse(raw) as { t: number; id: string };
    if (typeof t !== "number" || !id) return null;
    return { updatedAt: new Date(t), id };
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
export async function listChats(body: {
  accessToken: string;
  next_token?: string;
  limit?: number;
}) {
  const { accessToken, next_token, limit = 20 } = body;
  if (!accessToken) return status(401, { error: "accessToken required" });
  const userId = await resolveUserFromToken(accessToken);
  if (!userId) return status(401, { error: "Invalid or expired token" });

  let after: { updatedAt: Date; id: string } | undefined;
  if (next_token) {
    const decoded = decodeChatListToken(next_token);
    if (!decoded) return status(400, { error: "Invalid next_token" });
    after = decoded;
  }

  const page = await listChatSummariesPaginated(userId, {
    limit,
    after,
  });

  const next_token_out = page.next
    ? encodeChatListToken(page.next.updatedAt, page.next.id)
    : null;

  return { chats: page.chats as ChatSummary[], next_token: next_token_out };
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

  // Try UUID chatID first, then fall back to primary key id
  let chat = await getChatForUserByUUID(chatId, userId);
  if (!chat) {
    chat = await getChatForUser(chatId, userId);
  }
  if (!chat) return status(404, { error: "Chat not found or access denied" });

  let before: { createdAt: Date; id: string } | undefined;
  if (next_token) {
    const decoded = decodeNextToken(next_token);
    if (!decoded) return status(400, { error: "Invalid next_token" });
    before = decoded;
  }
  const messages = await loadChatHistory({
    chatId: chat.id,
    limit,
    before,
  });

  // messages are newest -> oldest, so the last item is the oldest in this page
  const last = messages[messages.length - 1] as
    | { createdAt: Date; id: string }
    | undefined;
  const next_token_out =
    messages.length >= limit && last
      ? encodeNextToken(last.createdAt, last.id)
      : null;

  return {
    chatId: chat.id,
    chatUUID: (chat as any).chatID ?? chatId,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: (m as any).parts ?? [],
      createdAt: m.createdAt,
    })).reverse(),
    next_token: next_token_out,
  };
}
