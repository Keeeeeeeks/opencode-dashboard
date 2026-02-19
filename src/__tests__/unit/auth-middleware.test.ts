import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { NextRequest } from 'next/server';

type DbModule = typeof import('@/lib/db');
type MiddlewareModule = typeof import('@/lib/auth/middleware');
type SessionModule = typeof import('@/lib/auth/session');

let dataDir = '';
let db: DbModule['default'] | null = null;
let middleware: MiddlewareModule;
let session: SessionModule;
const dbBackedTest = typeof Bun === 'undefined' ? test : test.skip;

function createNextRequest(
  path: string,
  headers: Record<string, string> = {},
  sessionToken?: string
): NextRequest {
  const request = new Request(`http://localhost:3000${path}`, {
    headers,
  }) as unknown as NextRequest;

  Object.defineProperty(request, 'nextUrl', {
    value: new URL(`http://localhost:3000${path}`),
  });

  Object.defineProperty(request, 'cookies', {
    value: {
      get(name: string) {
        if (name === session.SESSION_COOKIE_NAME && sessionToken) {
          return { name, value: sessionToken };
        }
        return undefined;
      },
    },
  });

  return request;
}

describe('auth middleware', () => {
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ocd-auth-test-'));
    process.env.DATA_DIR = dataDir;
    process.env.DASHBOARD_API_KEY = 'phase10-valid-key';
    process.env.ALLOWED_ORIGINS = 'http://localhost:3000,http://example.com';
    process.env.RATE_LIMIT_WINDOW_MS = '1000';
    process.env.RATE_LIMIT_MAX_REQUESTS = '3';

    session = await import('@/lib/auth/session');
    middleware = await import('@/lib/auth/middleware');
    if (typeof Bun === 'undefined') {
      db = (await import('@/lib/db')).default;
    }
  });

  afterAll(() => {
    db?.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    process.env.DASHBOARD_API_KEY = 'phase10-valid-key';
    process.env.ALLOWED_ORIGINS = 'http://localhost:3000,http://example.com';
    process.env.RATE_LIMIT_WINDOW_MS = '1000';
    process.env.RATE_LIMIT_MAX_REQUESTS = '3';
  });

  describe('validateAuth', () => {
    test('valid API key returns valid true', () => {
      const req = createNextRequest('/api/test', {
        Authorization: 'Bearer phase10-valid-key',
      });
      const result = middleware.validateAuth(req);
      expect(result.valid).toBe(true);
      expect(result.authType).toBe('api_key');
    });

    dbBackedTest('invalid API key returns valid false', () => {
      const req = createNextRequest('/api/test', {
        Authorization: 'Bearer wrong-key',
      });
      const result = middleware.validateAuth(req);
      expect(result.valid).toBe(false);
    });

    test('missing auth returns valid false', () => {
      const req = createNextRequest('/api/test');
      const result = middleware.validateAuth(req);
      expect(result.valid).toBe(false);
    });

    dbBackedTest('valid session cookie returns valid true with user', () => {
      if (!db) {
        throw new Error('Database unavailable');
      }
      const user = db.createUser({
        github_id: Date.now(),
        username: 'phase10-user',
        display_name: 'Phase 10 User',
        avatar_url: null,
        role: 'admin',
      });

      const token = `session-${Date.now()}`;
      db.createAuthSession({
        id: `sess-${Date.now()}`,
        user_id: user.id,
        token_hash: session.hashToken(token),
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });

      const req = createNextRequest('/api/test', {}, token);
      const result = middleware.validateAuth(req);
      expect(result.valid).toBe(true);
      expect(result.authType).toBe('session');
      expect(result.user?.id).toBe(user.id);
      expect(result.user?.username).toBe('phase10-user');
    });

    dbBackedTest('expired session returns valid false', () => {
      if (!db) {
        throw new Error('Database unavailable');
      }
      const user = db.createUser({
        github_id: Date.now() + 10,
        username: 'phase10-expired',
        display_name: null,
        avatar_url: null,
        role: 'viewer',
      });

      const token = `expired-${Date.now()}`;
      db.createAuthSession({
        id: `sess-expired-${Date.now()}`,
        user_id: user.id,
        token_hash: session.hashToken(token),
        expires_at: Math.floor(Date.now() / 1000) - 10,
      });

      const req = createNextRequest('/api/test', {}, token);
      const result = middleware.validateAuth(req);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing auth credentials');
    });

    dbBackedTest('timing-safe compare path does not authenticate partial token matches', () => {
      const sameLengthWrong = createNextRequest('/api/test', {
        Authorization: 'Bearer phase10-valid-kex',
      });
      const shorterWrong = createNextRequest('/api/test', {
        Authorization: 'Bearer phase10-valid',
      });

      expect(middleware.validateAuth(sameLengthWrong).valid).toBe(false);
      expect(middleware.validateAuth(shorterWrong).valid).toBe(false);
    });
  });

  describe('corsHeaders', () => {
    test('returns matching origin when origin is allowlisted', () => {
      const req = createNextRequest('/api/test', { Origin: 'http://localhost:3000' });
      const headers = middleware.corsHeaders(req) as Record<string, string>;
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    });

    test('returns empty allow-origin when not allowlisted', () => {
      const req = createNextRequest('/api/test', { Origin: 'http://evil.test' });
      const headers = middleware.corsHeaders(req) as Record<string, string>;
      expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    test('includes Vary Origin when origin is allowlisted', () => {
      const req = createNextRequest('/api/test', { Origin: 'http://example.com' });
      const headers = middleware.corsHeaders(req) as Record<string, string>;
      expect(headers.Vary).toBe('Origin');
    });

    test('handles missing Origin header', () => {
      const req = createNextRequest('/api/test');
      const headers = middleware.corsHeaders(req) as Record<string, string>;
      expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(headers['Access-Control-Allow-Methods']).toContain('GET');
    });
  });

  describe('checkRateLimit', () => {
    test('first request is allowed', () => {
      const req = createNextRequest('/api/test', { 'x-forwarded-for': '10.0.0.11' });
      const result = middleware.checkRateLimit(req);
      expect(result.allowed).toBe(true);
    });

    test('requests within limit are allowed', () => {
      const req = createNextRequest('/api/test', { 'x-forwarded-for': '10.0.0.12' });
      expect(middleware.checkRateLimit(req).allowed).toBe(true);
      expect(middleware.checkRateLimit(req).allowed).toBe(true);
      expect(middleware.checkRateLimit(req).allowed).toBe(true);
    });

    test('requests exceeding limit are denied with retryAfterSeconds', () => {
      const req = createNextRequest('/api/test', { 'x-forwarded-for': '10.0.0.13' });
      middleware.checkRateLimit(req);
      middleware.checkRateLimit(req);
      middleware.checkRateLimit(req);

      const denied = middleware.checkRateLimit(req);
      expect(denied.allowed).toBe(false);
      expect(typeof denied.retryAfterSeconds).toBe('number');
      expect((denied.retryAfterSeconds ?? 0) >= 1).toBe(true);
    });
  });
});
