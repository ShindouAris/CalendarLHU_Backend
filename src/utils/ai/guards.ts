import { createHash } from 'node:crypto';

export const MAX_CHAT_BYTES = 1024 * 1024;
export function validateChatInput(req: any): boolean {
  try {
    if (!req || Array.isArray(req) || typeof req.id !== 'string' || !req.id || req.id.length > 128 || !Array.isArray(req.messages) || !req.messages.length || req.messages.length > 200) return false;
    if (req.trigger !== undefined && !['submit-message', 'regenerate-message'].includes(req.trigger)) return false;
    if (req.messageId !== undefined && (typeof req.messageId !== 'string' || !req.messageId || req.messageId.length > 128)) return false;
    if (req.model !== undefined && (typeof req.model !== 'string' || req.model.length > 128)) return false;
    if (Buffer.byteLength(JSON.stringify(req)) > MAX_CHAT_BYTES) return false;
    return req.messages.every((m: any) => m && typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 128 && ['user', 'assistant'].includes(m.role) && Array.isArray(m.parts) && m.parts.length <= 64 && m.parts.every((p: any) => p && typeof p.type === 'string' && p.type.length <= 128 && Buffer.byteLength(JSON.stringify(p)) <= 65536 && (!['text', 'reasoning'].includes(p.type) || (typeof p.text === 'string' && Buffer.byteLength(p.text) <= 32768))));
  } catch { return false; }
}

// Single-instance only: use a shared atomic limiter before running multiple instances.
// Active entries never expire: a slow stream must not lose its concurrency guard.
export class RequestLimits {
  private stopped = false;
  private waiters: Array<() => void> = [];
  stopAndDrain(): Promise<void> {
    this.stopped = true;
    if (![...this.entries.values()].some(entry => entry.active)) return Promise.resolve();
    return new Promise(resolve => this.waiters.push(resolve));
  }
  private entries = new Map<string, { start: number; count: number; active: number }>();
  constructor(private max: number, private windowMs: number, private concurrent: number, private capacity = 10000, private now = Date.now) {}
  acquire(key: string): (() => void) | null {
    if (this.stopped) return null;
    const now = this.now();
    for (const [key, entry] of this.entries) if (!entry.active && now - entry.start >= this.windowMs) this.entries.delete(key);
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= this.capacity) return null;
      entry = { start: now, count: 0, active: 0 };
      this.entries.set(key, entry);
    }
    if (entry.active >= this.concurrent || entry.count >= this.max) return null;
    entry.count++; entry.active++;
    let released = false;
    return () => { if (!released) { released = true; entry.active--;
      if (![...this.entries.values()].some(entry => entry.active)) this.waiters.splice(0).forEach(resolve => resolve());
    } };
  }
}
export const chatLimits = new RequestLimits(12, 60000, 1);
export const sessionLimits = new RequestLimits(5, 60000, 1);
export const schoolTokenKey = (token: string) => createHash('sha256').update(token).digest('hex');

export function schoolProfile(user: any) {
  const field = (name: string, required = false) => {
    const value = user?.[name];
    if (!required && (value === undefined || value === null)) return '';
    if (typeof value !== 'string' || value.length > 512 || (required && !value.trim())) throw new Error('Invalid school profile');
    return value;
  };
  return { userID: field('UserID', true), fullName: field('FullName', true), class: field('Class'), departmentName: field('DepartmentName') };
}
