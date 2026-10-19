import { test, expect } from 'bun:test';
import { validateChatInput, RequestLimits, schoolProfile } from './guards';

test('bounds UTF-8 text, part count and total payload without narrowing SDK tool parts', () => {
  const req = { id: 'chat', messages: [{ id: 'u', role: 'assistant', parts: [{ type: 'tool-getNextClassTool', toolCallId: 't', state: 'output-available', input: {}, output: { classes: [] } }, { type: 'step-start' }] }] };
  expect(validateChatInput(req)).toBe(true);
  expect(validateChatInput({ ...req, messages: [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'ế'.repeat(30000) }] }] })).toBe(false);
  expect(validateChatInput({ ...req, messages: [{ id: 'u', role: 'user', parts: Array.from({length: 65}, () => ({type:'text',text:'x'})) }] })).toBe(false);
  expect(validateChatInput({ ...req, messages: Array.from({length: 20}, () => ({id:'u',role:'assistant',parts:[{type:'data-test',data:'x'.repeat(60000)}]})) })).toBe(false);
  for (const value of [null, [], {id:'x',messages:[null]}, {id:'x',messages:[{id:'u',role:'system',parts:[]}]}]) expect(validateChatInput(value)).toBe(false);
});

test('limits remain held until release, expire idle windows and fail closed at capacity', () => {
  let now = 0;
  const limits = new RequestLimits(2, 1000, 1, 2, () => now);
  const first = limits.acquire('a')!;
  expect(typeof first).toBe('function');
  expect(limits.acquire('a')).toBeNull();
  now = 2000;
  expect(limits.acquire('a')).toBeNull();
  first(); first();
  const second = limits.acquire('a')!;
  expect(typeof second).toBe('function'); second();
  const third = limits.acquire('a')!; third();
  expect(limits.acquire('a')).toBeNull();
  expect(typeof limits.acquire('b')).toBe('function');
  expect(limits.acquire('c')).toBeNull();
  now = 4000;
  expect(typeof limits.acquire('c')).toBe('function');
});

test('shutdown waits for active request completion and rejects new work', async () => {
  const limits = new RequestLimits(5, 1000, 1);
  const release = limits.acquire('a')!;
  let done = false;
  const drained = limits.stopAndDrain().then(() => { done = true; });
  await Promise.resolve();
  expect(done).toBe(false);
  expect(limits.acquire('b')).toBeNull();
  release();
  await drained;
  expect(done).toBe(true);
});

test('school profile whitelists validated fields and never stores school credentials', () => {
  expect(schoolProfile({UserID:'123',FullName:'Student',Class:'A',DepartmentName:'IT',accessToken:'private'})).toEqual({userID:'123',fullName:'Student',class:'A',departmentName:'IT'});
  expect(() => schoolProfile({UserID:'123'})).toThrow();
  expect(() => schoolProfile({UserID:'123',FullName:'x'.repeat(513)})).toThrow();
});
