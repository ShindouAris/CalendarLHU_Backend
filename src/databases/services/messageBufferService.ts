import { upsertMessages } from "./chatQueries";
import { MessageRole } from "@prisma/client";
import { UIMessagePart } from "ai";

const DEBOUNCE_MS = 750;
const MAX_CHATS_PER_USER = 30;

interface BufferedMessage {
  id?: string;
  role: MessageRole;
  parts: UIMessagePart<Record<string, any>, Record<string, any>>[];
}

interface BufferEntry {
  messages: BufferedMessage[];
  userId: string;
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

  get idle() { return !this.locked && this.queue.length === 0; }

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
      return;
    }
    const messages = entry.messages.slice();
    const { userId } = entry;
    clearTimeout(entry.timer);
    await upsertMessages(chatId, messages);
    entry.messages.splice(0, messages.length);
    if (entry.messages.length === 0) buffers.delete(chatId);
    // Timestamp and retention are committed by upsertMessages.
  } catch (err) {
    // Retain data for explicit retry; upsertMessages owns bounded transient retries.
    throw err;
  } finally {
    m.unlock();
    // A released lock may already belong to a queued waiter.
    if (m.idle) mutexes.delete(chatId);
  }
}

/**
 * Add messages to the per-chat buffer and reset debounce timer.
 * On timer fire: bulk insert, update Chat.updatedAt, prune user chats, clear buffer.
 * Safe under concurrent requests (mutex per chatId).
 */
export function addToBuffer(
  chatId: string,
  userId: string,
  messages: BufferedMessage[]
): void {
  if (messages.length === 0) return;
  messages = messages.map((message) => ({ ...message, id: message.id || crypto.randomUUID() }));
  const key = chatId;
  let entry = buffers.get(key);
  if (entry) {
    clearTimeout(entry.timer);
    entry.messages.push(...messages);
    entry.userId = userId;
  } else {
    entry = {
      messages: [...messages],
      userId,
      timer: null!,
    };
    buffers.set(key, entry);
  }
  entry.timer = setTimeout(() => {
    void flush(key).catch(() => console.error("[messageBufferService] flush failed; messages retained"));
  }, DEBOUNCE_MS);
}

/**
 * Flush immediately (e.g. for sync persist API). Waits for flush to complete.
 */
export async function flushNow(chatId: string): Promise<void> {
  const entry = buffers.get(chatId);
  if (entry) clearTimeout(entry.timer);
  await flush(chatId);
}

export const messageBufferConfig = {
  debounceMs: DEBOUNCE_MS,
  maxChatsPerUser: MAX_CHATS_PER_USER,
};

