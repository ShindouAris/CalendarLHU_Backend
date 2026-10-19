import { test, expect } from 'bun:test';
import { createUIMessageStream } from 'ai';
import { persistenceResponse } from './persistenceStream';

test('actual SDK emits transient persistence notification before closing', async () => {
  const response = persistenceResponse(writer => createUIMessageStream({
    execute: ({writer}) => { writer.write({type:'start',messageId:'a'}); writer.write({type:'finish'}); },
    onFinish: async () => { writer.write({type:'data-persistence-error',data:{message:'Không thể lưu lịch sử trò chuyện'},transient:true}); },
  }));
  const body = await response.text();
  expect(body).toContain('data-persistence-error');
  expect(body).toContain('"transient":true');
  expect(body.indexOf('data-persistence-error')).toBeLessThan(body.indexOf('[DONE]'));
});
