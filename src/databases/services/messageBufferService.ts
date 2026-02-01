import { Types } from "mongoose";
import {
  bulkInsertMessages,
  updateChatUpdatedAt,
  pruneChatsForUser,
} from "./chatQueries";
import type { MessageRole } from "../models/message";
import { UIMessagePart } from "ai";

const DEBOUNCE_MS = 750;
const MAX_CHATS_PER_USER = 30;

interface BufferedMessage {
  role: MessageRole;
  parts: UIMessagePart<Record<string, any>, Record<string, any>>[];
}

interface BufferEntry {
  messages: BufferedMessage[];
  userObjectId: Types.ObjectId;
  timer: ReturnType<typeof setTimeout>;
}

class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async lock() {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  unlock() {
    const next = this.queue.shift();
    if (next) next();
    else this.locked = false;
  }
}

const buffers = new Map<string, BufferEntry>();
const mutexes = new Map<string, Mutex>();

function mutexFor(chatId: string): Mutex {
  let m = mutexes.get(chatId);
  if (!m) {
    m = new Mutex();
    mutexes.set(chatId, m);
  }
  return m;
}

async function flush(chatId: string): Promise<void> {
  const m = mutexFor(chatId);
  await m.lock();
  try {
    const entry = buffers.get(chatId);
    if (!entry || entry.messages.length === 0) {
      if (entry) {
        clearTimeout(entry.timer);
        buffers.delete(chatId);
      }
      // Cleanup mutex if no pending operations
      mutexes.delete(chatId);
      return;
    }
    const { messages, userObjectId } = entry;
    clearTimeout(entry.timer);
    buffers.delete(chatId);

    const cid = new Types.ObjectId(chatId);
    await bulkInsertMessages(cid, messages);
    await updateChatUpdatedAt(cid);
    await pruneChatsForUser(userObjectId, MAX_CHATS_PER_USER);
  } catch (err) {
    console.error("[messageBufferService] flush error:", err);
  } finally {
    m.unlock();
    // Cleanup mutex after flush completes
    mutexes.delete(chatId);
  }
}

/**
 * Add messages to the per-chat buffer and reset debounce timer.
 * On timer fire: bulk insert, update Chat.updatedAt, prune user chats, clear buffer.
 * Safe under concurrent requests (mutex per chatId).
 */
export function addToBuffer(
  chatId: Types.ObjectId,
  userObjectId: Types.ObjectId,
  messages: BufferedMessage[]
): void {
  if (messages.length === 0) return;
  const key = String(chatId);
  let entry = buffers.get(key);
  if (entry) {
    clearTimeout(entry.timer);
    entry.messages.push(...messages);
    entry.userObjectId = userObjectId;
  } else {
    entry = {
      messages: [...messages],
      userObjectId,
      timer: null!,
    };
    buffers.set(key, entry);
  }
  entry.timer = setTimeout(() => flush(key), DEBOUNCE_MS);
}

/**
 * Flush immediately (e.g. for sync persist API). Waits for flush to complete.
 */
export async function flushNow(chatId: Types.ObjectId): Promise<void> {
  const entry = buffers.get(String(chatId));
  if (entry) clearTimeout(entry.timer);
  await flush(String(chatId));
}

export const messageBufferConfig = {
  debounceMs: DEBOUNCE_MS,
  maxChatsPerUser: MAX_CHATS_PER_USER,
};
