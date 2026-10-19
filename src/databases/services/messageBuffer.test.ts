import { test, expect } from 'bun:test';
// Transform only the DB import; execute the actual buffer implementation offline.
let fail = true;
let calls = 0;
let savedId: string | undefined;
(globalThis as any).__bufferWrite = async (_chat: string, messages: any[]) => {
  calls++;
  savedId = messages[0].id;
  if (fail) throw Object.assign(new Error('offline'), { code: 'P2002' });
};
const source = await Bun.file(import.meta.dir + '/messageBufferService.ts').text();
const isolated = source.replace(/import\s*\{[\s\S]*?\}\s*from "\.\/chatQueries";/, 'const upsertMessages = (globalThis as any).__bufferWrite;');
const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(isolated + '\nexport { mutexFor };');
const { addToBuffer, flushNow, mutexFor } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('explicit flush reports failure and retains stable-ID messages for explicit retry', async () => {
  addToBuffer('chat', 'owner', [{ role: 'user', parts: [] }]);
  await expect(flushNow('chat')).rejects.toThrow('offline');
  expect(typeof savedId).toBe('string');
  const firstId = savedId;
  fail = false;
  await flushNow('chat');
  expect(calls).toBe(2);
  expect(savedId).toBe(firstId);
});
test('empty flush cannot discard a mutex already handed to a waiter', async () => {
  const mutex = mutexFor('empty');
  await mutex.lock();
  const first = flushNow('empty');
  const waiter = mutex.lock();
  mutex.unlock();
  await waiter;
  expect(mutexFor('empty')).toBe(mutex);
  mutex.unlock();
  await first;
});
