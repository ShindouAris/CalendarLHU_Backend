import { test, expect } from 'bun:test';
// Offline seam only: importing controllers must never open a database connection.
const calls: any[] = [];
const tx = {
  message: {
    findFirst: async () => null,
    upsert: async (query: any) => { calls.push(query); return query.create; },
  },
  $queryRaw: async () => [],
  chat: { update: async () => ({}), findUniqueOrThrow: async () => ({ userId: 'db-owner' }), findMany: async () => [] },
};
(globalThis as any).prisma = {
  $transaction: async (run: any) => run(tx),
  user: { findUnique: async () => ({ id:'db-owner',userID:'owner' }) },
  chat: { findFirst: async () => null },
};
const { upsertMessages } = await import('../../databases/services/chatQueries');
const { listChats, loadChatHistoryHandler, deleteChatHandler } = await import('../../controller/chatApi');
test('message writes scope global ID to chat and immutable role', async () => {
  await upsertMessages('owned-chat', [{id:'victim-message',role:'user',parts:[]}]);
  expect(calls[0].where).toEqual({id:'victim-message',chatId:'owned-chat',role:'user'});
});
test('regeneration rejects a missing or foreign target before any write', async () => {
  calls.length=0;
  await expect(upsertMessages('owned-chat',[{role:'assistant',parts:[]}],'foreign-target')).rejects.toThrow();
  expect(calls.length).toBe(0);
});
test('raw school tokens rejected by all history handlers', async () => {
  for (const result of [await listChats({accessToken:'raw-school'}),await loadChatHistoryHandler('foreign',{accessToken:'raw-school'}),await deleteChatHandler('foreign',{accessToken:'raw-school'})]) {
    expect((result as any).code).toBe(401);
  }
});
