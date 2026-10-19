# AI session contract

Configure `AI_SESSION_SECRET` with an independent random secret of at least 32 bytes in deployment. No secret is committed. Missing/short configuration fails closed for AI authentication; other authentication routes are unchanged.

- `POST /chisaAI/v3/session` body `{ "accessToken": "<school session>" }`: validates school userinfo and signs the trusted UserID.
- `POST /chisaAI/v3/session/refresh` body `{ "token": "<internal JWT>" }`: verifies the unexpired JWT, revalidates its embedded school session, and requires the same UserID.
- Both return `{ token, expiresAt, refreshAt }`, with timestamps in **Unix seconds**, expiry at 35 minutes and suggested refresh at 30 minutes. Refresh before expiry; after expiry exchange the school token again.
- Existing AI chat `access_token` (also accepts `accessToken`) and list/history/delete/user-check/user-create `accessToken` now carry the internal JWT. No raw-school fallback. Client `user_id` is never authoritative. Tools/models metadata remains public.
- Exchange failure: HTTP 401 `{error:"Invalid school session or signing unavailable"}`. Refresh failure: HTTP 401 `{error:"Invalid or expired session"}`. Chat/check/create authentication failure: HTTP 401 `{error:"Invalid or expired AI session"}`. List/history/delete invalid token: HTTP 401 `{error:"Invalid or expired token"}`. Invalid schema uses Elysia's HTTP 422 validation response. Foreign/missing chat or regeneration target returns 404; malformed chat identity/messages or missing regeneration messageId returns 400.

JWT is signed HS256 with fixed issuer `calendar-lhu-backend` and audience `chisa-ai`. `sub` is trusted UserID; `school` holds the school session. **JWT payload is readable, not encrypted.** Treat the whole JWT as a credential: HTTPS, no logs/analytics/URLs, clear on logout. No school session is persisted in the database or server cache. Ordinary AI requests verify locally; only exchange/refresh call school userinfo. Authenticated tool credentials are injected server-side outside model arguments and removed from system prompts.

History writes scope existing message IDs by chat and role. Regeneration rewind and message replacement share one database transaction with stable `(createdAt,id)` boundaries. Chat ownership and regeneration target are checked before invoking the model. Streaming cancellation forwards the actual HTTP request signal.

Offline checks: `bun test src/utils/ai`; bundle: `bun run build`. Ownership tests exercise real query construction with a fake Prisma seam, not database transaction isolation. Live school, model and PostgreSQL behavior are deliberately not exercised. Existing memory buffer is not durable across process crashes. Stream persistence failures are logged; recovery/retry delivery is not guaranteed. Concurrent regeneration ordering is not serialized across backend processes. AI user/create currently initializes profile fields with defaults rather than re-fetching school profile on each call.
