import { test, expect } from 'bun:test';

// Offline seam: no Prisma client construction, environment reads or database I/O.
const events: string[] = [];
let failures = 0;
let failureCode = 'P2034';
let attempts = 0;
const ids: string[] = [];
const tx = {
  $queryRaw: async () => { events.push('owner-lock'); return [{ id: 'owner' }]; },
  chat: {
    findUniqueOrThrow: async () => { events.push('owner'); return { userId: 'owner' }; },
    update: async () => { events.push('chat-lock'); return {}; },
    findMany: async (query: any) => {
      events.push('retention');
      expect(query.where).toEqual({ userId: 'owner', id: { not: 'chat' } });
      expect(query.skip).toBe(29);
      return [{ id: 'old-chat' }];
    },
    deleteMany: async (query: any) => { events.push('prune'); expect(query.where.id.in).toEqual(['old-chat']); },
  },
  message: {
    findFirst: async () => { events.push('target'); return { id: 'target', createdAt: new Date(0) }; },
    deleteMany: async () => { events.push('rewind'); },
    upsert: async (query: any) => {
      events.push('write'); ids.push(query.create.id);
      expect(query.where).toEqual({ id: query.create.id, chatId: 'chat', role: 'assistant' });
      if (failures-- > 0) throw Object.assign(new Error('rollback'), { code: failureCode });
      return query.create;
    },
  },
};
(globalThis as any).__persistencePrisma = { $transaction: async (run: any) => { attempts++; return run(tx); } };
const source = (await Bun.file(import.meta.dir + '/chatQueries.ts').text())
  .replace('import { prisma } from "../index";', 'const prisma = (globalThis as any).__persistencePrisma;');
const compiled = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
const { upsertMessages } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
test('locks owner and chat before rewind; prunes in the same transaction', async () => {
  await upsertMessages('chat', [{ id: 'answer', role: 'assistant', parts: [] }], 'target');
  expect(events).toEqual(['owner', 'owner-lock', 'chat-lock', 'target', 'rewind', 'write', 'retention', 'prune']);
});
test('retries only rolled-back transaction conflicts, retaining generated IDs', async () => {
  attempts = 0; failures = 2; ids.length = 0;
  await upsertMessages('chat', [{ role: 'assistant', parts: [] }]);
  expect(attempts).toBe(3);
  expect(new Set(ids).size).toBe(1);
  attempts = 0; failures = 5;
  await expect(upsertMessages('chat', [{ role: 'assistant', parts: [] }])).rejects.toThrow('rollback');
  expect(attempts).toBe(3);
  attempts = 0; failureCode = 'P2002'; failures = 1;
  await expect(upsertMessages('chat', [{ role: 'assistant', parts: [] }])).rejects.toThrow('rollback');
  expect(attempts).toBe(1);
});
