import { prisma } from "../index";
import { MessageRole } from "@prisma/client";
import { UIMessagePart } from "ai";

// -----------------------------------------------------------------------------
// Chat and Message queries using Prisma
// -----------------------------------------------------------------------------

/** Create a new chat. Does NOT touch Message collection. */
export async function createChat(userId: string) {
  const doc = await prisma.chat.create({
    data: {
      userId,
    },
  });
  return doc;
}

/** Find or create a chat for a user by UserID (string). Resolves User first. */
export async function getOrCreateChatForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { userID: userId },
  });
  if (!user) return null;

  const existing = await prisma.chat.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;

  const created = await prisma.chat.create({
    data: { userId: user.id },
  });
  return created;
}

/** Create a new chat for user by UserID (string). */
export async function createChatForUser(userId: string, chatID?: string) {
  const user = await prisma.user.findUnique({
    where: { userID: userId },
  });
  if (!user) return null;

  const created = await prisma.chat.create({
    data: {
      userId: user.id,
      ...(chatID && { chatID }),
    },
  });
  return created;
}

/** Add a message to a chat. Does NOT rewrite the Chat document. */
export async function addMessage(
  chatId: string,
  role: MessageRole,
  parts: UIMessagePart<Record<string, any>, Record<string, any>>[]
) {
  const doc = await prisma.message.create({
    data: {
      chatId,
      role,
      parts: parts as any,
    },
  });
  return doc;
}

export interface LoadHistoryOptions {
  chatId: string;
  limit?: number;
  skip?: number;
  /** Cursor-based: return messages before this date (exclusive). Use with createdAt + id for stable pagination. */
  before?: { createdAt: Date; id: string };
}

/** Load chat history with pagination. Fetches from Message collection only. */
export async function loadChatHistory(options: LoadHistoryOptions) {
  const { chatId, limit = 20, before } = options;

  const whereClause: any = {
    chatId,
  };

  if (before) {
    whereClause.OR = [
      { createdAt: { lt: before.createdAt } },
      {
        createdAt: before.createdAt,
        id: { lt: before.id },
      },
    ];
  }

  const messages = await prisma.message.findMany({
    where: whereClause,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });

  // Return newest → oldest (for pagination), caller should reverse for chronological display
  return messages;
}

/** Offset-based pagination: load page `page` (1-based) with `pageSize` messages. */
export async function loadChatHistoryByPage(
  chatId: string,
  page: number,
  pageSize: number
) {
  const skip = (Math.max(1, page) - 1) * pageSize;
  return loadChatHistory({ chatId, skip, limit: pageSize });
}

/** Delete a chat and cascade-delete all its messages. */
export async function deleteChat(chatId: string) {
  // Prisma will cascade delete messages automatically due to onDelete: Cascade
  const result = await prisma.chat.delete({
    where: { id: chatId },
  });
  return result;
}

/** Bulk insert messages. Does NOT update Chat. */
export async function bulkInsertMessages(
  chatId: string,
  messages: Array<{
    role: MessageRole;
    parts: UIMessagePart<Record<string, any>, Record<string, any>>[];
  }>
) {
  if (messages.length === 0) return [];
  
  // Add incremental timestamp offset to maintain order when createdAt is the same
  const baseTime = new Date();
  const result = await prisma.message.createMany({
    data: messages.map((m, index) => ({
      chatId,
      role: m.role,
      parts: m.parts as any,
      createdAt: new Date(baseTime.getTime() + index), // Add 1ms per message
    })),
  });
  
  return result;
}

/** Update only Chat.updatedAt (no rewrite, no messages). */

/** Upsert messages by ID to guarantee idempotency. */
export async function upsertMessages(
  chatId: string,
  messages: Array<{
    id?: string;
    role: MessageRole;
    parts: UIMessagePart<Record<string, any>, Record<string, any>>[];
  }>,
  rewindId?: string
) {
  if (messages.length === 0) return [];
  // Generate IDs once: a rolled-back transaction must replay the same writes.
  const pending = messages.map((message) => ({ ...message, id: message.id || crypto.randomUUID() }));
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
    const { userId } = await tx.chat.findUniqueOrThrow({ where: { id: chatId }, select: { userId: true } });
    // Owner row lock also serializes retention across different chats for this user.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    await tx.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
    const baseTime = new Date();
    if (rewindId) {
      const target = await tx.message.findFirst({ where: { id: rewindId, chatId, role: 'assistant' } });
      if (!target) throw new Error('Invalid regeneration target');
      await tx.message.deleteMany({ where: { chatId, OR: [
        {createdAt: {gt: target.createdAt}}, {createdAt: target.createdAt, id: {gte: target.id}}
      ] } });
    }
    const saved = [];
    for (const [index, m] of pending.entries()) {
      const msgId = m.id;
      saved.push(await tx.message.upsert({
        where: { id: msgId, chatId, role: m.role },
        update: {
          parts: m.parts as any,
        },
        create: {
          id: msgId,
          chatId,
          role: m.role,
          parts: m.parts as any,
          createdAt: new Date(baseTime.getTime() + index),
        },
      }));
    }
    // Keep the chat being saved even when timestamps tie or clocks differ.
    const stale = await tx.chat.findMany({
      where: { userId, id: { not: chatId } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: 29,
      select: { id: true },
    });
    if (stale.length) await tx.chat.deleteMany({ where: { userId, id: { in: stale.map((chat) => chat.id) } } });
    return saved;
      });
    } catch (error) {
      // P2034 guarantees transaction rollback; do not retry ambiguous connection failures.
      if (attempt >= 2 || (error as { code?: string })?.code !== 'P2034') throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

export async function updateChatUpdatedAt(chatId: string) {
  const result = await prisma.chat.update({
    where: { id: chatId },
    data: { updatedAt: new Date() },
  });
  return result;
}

/** Prune user's chats: keep latest N by updatedAt, cascade-delete rest. */
export async function pruneChatsForUser(userId: string, keepN: number) {
  const chats = await prisma.chat.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  if (chats.length <= keepN) return { deleted: 0 };
  
  const toDelete = chats.slice(keepN);
  
  // Delete chats (messages will cascade delete automatically)
  await prisma.chat.deleteMany({
    where: {
      id: {
        in: toDelete.map((c) => c.id),
      },
    },
  });

  return { deleted: toDelete.length };
}

export interface ChatSummary {
  chatId: string;
  chatUUID: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface ListChatSummariesOptions {
  limit?: number;
  /** Cursor: return chats *after* this cursor in the sorted list (updatedAt desc, id desc). */
  after?: { updatedAt: Date; id: string };
}

/**
 * List chat summaries for user with cursor-based pagination.
 * Sort: updatedAt desc, id desc (stable).
 */
export async function listChatSummariesPaginated(
  userId: string,
  options: ListChatSummariesOptions
): Promise<{ chats: ChatSummary[]; next?: { updatedAt: Date; id: string } }> {
  const { limit = 20, after } = options;

  const user = await prisma.user.findUnique({
    where: { userID: userId },
  });
  if (!user) return { chats: [] };

  const whereClause: any = { userId: user.id };
  
  if (after) {
    whereClause.OR = [
      { updatedAt: { lt: after.updatedAt } },
      { 
        updatedAt: after.updatedAt, 
        id: { lt: after.id } 
      },
    ];
  }

  const actualLimit = Math.max(1, Math.min(100, limit));
  const docs = await prisma.chat.findMany({
    where: whereClause,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: actualLimit + 1,
  });

  const hasMore = docs.length > actualLimit;
  const page = hasMore ? docs.slice(0, actualLimit) : docs;

  const [counts, firstMessages] = await Promise.all([
    Promise.all(
      page.map((c) =>
        prisma.message.count({
          where: { chatId: c.id },
        })
      )
    ),
    Promise.all(
      page.map((c) =>
        prisma.message.findFirst({
          where: { chatId: c.id, role: 'user' },
          orderBy: { createdAt: 'asc' },
          select: { parts: true },
        })
      )
    ),
  ]);

  const chats: ChatSummary[] = page.map((c, idx) => {
    let title: string | undefined = undefined;
    const fMsg = firstMessages[idx];
    if (fMsg && Array.isArray(fMsg.parts)) {
      const textPart = (fMsg.parts as any[]).find((p: any) => p?.type === 'text');
      if (textPart?.text) {
        title = textPart.text.replace(/\s+/g, ' ').trim().slice(0, 40);
      }
    }
    return {
      chatId: c.id,
      chatUUID: c.chatID,
      title: title || c.chatID.slice(0, 12),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: counts[idx] ?? 0,
    };
  });

  const next = hasMore
    ? ({ updatedAt: page[page.length - 1].updatedAt, id: page[page.length - 1].id })
    : undefined;

  return { chats, next };
}

/** List chat summaries for user (by UserID string). Sorted by updatedAt desc. */
export async function listChatSummaries(userId: string): Promise<ChatSummary[]> {
  const user = await prisma.user.findUnique({
    where: { userID: userId },
  });
  if (!user) return [];

  const chats = await prisma.chat.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });

  const summaries: ChatSummary[] = [];
  for (const c of chats) {
    const messageCount = await prisma.message.count({
      where: { chatId: c.id },
    });
    summaries.push({
      chatId: c.id,
      chatUUID: c.chatID,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount,
    });
  }
  return summaries;
}

/** Get chat by id and ensure it belongs to user (UserID string). Returns null if not found or not owned. */
export async function getChatForUser(
  chatId: string,
  userId: string
): Promise<{ id: string; userId: string } | null> {
  const user = await prisma.user.findUnique({
    where: { userID: userId },
  });
  if (!user) return null;

  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      userId: user.id,
    },
  });
  
  return chat ? { id: chat.id, userId: chat.userId } : null;
}

/** Get chat by UUID (chatID) and ensure it belongs to user (UserID string). */
export async function getChatForUserByUUID(
  chatUUID: string,
  userId: string
): Promise<{ id: string; userId: string } | null> {
  const user = await prisma.user.findUnique({
    where: { userID: userId },
  });
  if (!user) return null;

  const chat = await prisma.chat.findFirst({
    where: {
      chatID: chatUUID,
      userId: user.id,
    },
  });
  
  return chat ? { id: chat.id, userId: chat.userId } : null;
}

export type { MessageRole };
