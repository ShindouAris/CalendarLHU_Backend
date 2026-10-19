import { test, expect } from 'bun:test';
import { signSession, verifySession, sessionResponse } from './session';
const secret = 'test-only-signing-key-32-bytes-long';
test('signed school binding, tampering and exact expiration', () => {
  const token = signSession('student', 'school-session', secret, 1000);
  expect(verifySession(token, secret, 1001).sub).toBe('student');
  expect(sessionResponse(token, secret, 1001)).toEqual({token, expiresAt:3100, refreshAt:2800});
  expect(verifySession(token, secret, 2800).school).toBe('school-session');
  expect(verifySession(token, secret, 3099).sub).toBe('student');
  expect(() => verifySession(token.slice(0, -2) + 'xx', secret, 1001)).toThrow();
  expect(() => verifySession(token, secret, 3100)).toThrow();
  expect(() => verifySession(token, '', 1001)).toThrow();
  expect(() => verifySession(token, secret, 999)).toThrow();
});
