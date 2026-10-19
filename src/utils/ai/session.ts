import { createHmac, timingSafeEqual } from 'node:crypto';
const ISSUER = 'calendar-lhu-backend';
const AUDIENCE = 'chisa-ai';
export interface Session { sub: string; school: string; iss: string; aud: string; iat: number; exp: number }
function key(secret: string) {
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('AI session signing unavailable');
  return secret;
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
export function signSession(sub: string, school: string, secret = process.env.AI_SESSION_SECRET || '', now = Math.floor(Date.now()/1000)) {
  key(secret);
  if (!text(sub, 256) || !text(school, 16384)) throw new Error('Invalid school identity');
  const head = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const payload = Buffer.from(JSON.stringify({sub,school,iss:ISSUER,aud:AUDIENCE,iat:now,exp:now+2100})).toString('base64url');
  const data = `${head}.${payload}`;
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}
export function verifySession(token: string, secret = process.env.AI_SESSION_SECRET || '', now = Math.floor(Date.now()/1000)): Session {
  key(secret);
  if (!text(token, 30000)) throw new Error('Invalid AI session');
  const pieces = token.split('.');
  if (pieces.length !== 3 || pieces.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error('Invalid AI session');
  const [head, payload, signature] = pieces;
  const expected = createHmac('sha256', secret).update(`${head}.${payload}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid AI session');
  const header = JSON.parse(Buffer.from(head, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (header.alg !== 'HS256' || header.typ !== 'JWT' || claims.iss !== ISSUER || claims.aud !== AUDIENCE ||
      !text(claims.sub,256) || !text(claims.school,16384) || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
      claims.iat > now || claims.iat < 0 || claims.exp !== claims.iat+2100 || claims.exp <= now) throw new Error('Invalid AI session');
  return claims;
}
export function sessionResponse(token: string, secret = process.env.AI_SESSION_SECRET || '', now = Math.floor(Date.now()/1000)) {
  const claims = verifySession(token, secret, now);
  return {token, expiresAt: claims.exp, refreshAt: claims.iat+1800};
}
