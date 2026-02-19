import { timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import { auditLog } from '@/lib/audit';
import db from '@/lib/db';
import { hashToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

const DEFAULT_ALLOWED_ORIGINS = 'http://127.0.0.1:3000,http://localhost:3000';
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 60;

const rateLimitBuckets = new Map<string, number[]>();

type AuthUser = {
  id: number;
  username: string;
  role: 'owner' | 'admin' | 'viewer';
};

export type AuthValidationResult = {
  valid: boolean;
  error?: string;
  authType?: 'api_key' | 'session';
  user?: AuthUser | null;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

function getAllowedOrigins(): Set<string> {
  const rawOrigins = process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS;
  const origins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(origins);
}

function getRateLimitConfig() {
  const windowMs = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '', 10);
  const maxRequests = Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '', 10);

  return {
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_RATE_LIMIT_WINDOW_MS,
    maxRequests:
      Number.isFinite(maxRequests) && maxRequests > 0
        ? maxRequests
        : DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  };
}

function extractClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const requestWithIp = request as NextRequest & { ip?: string };
  return requestWithIp.ip || 'unknown';
}

function getSessionAuthResult(token: string): AuthValidationResult {
  const session = db.getAuthSessionByTokenHash(hashToken(token));
  if (!session) {
    return { valid: false, error: 'Invalid session token' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at <= now) {
    db.deleteAuthSession(session.id);
    return { valid: false, error: 'Session expired' };
  }

  const user = db.getUserById(session.user_id);
  if (!user) {
    db.deleteAuthSession(session.id);
    return { valid: false, error: 'Session user not found' };
  }

  return {
    valid: true,
    authType: 'session',
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
  };
}

const AUTH_DISABLED = process.env.DISABLE_AUTH === 'true';

export function validateAuth(request: NextRequest): AuthValidationResult {
  const path = request.nextUrl.pathname;
  const ip = extractClientIp(request);
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.DASHBOARD_API_KEY;

  if (AUTH_DISABLED && !authHeader) {
    return { valid: true, authType: 'session', user: { id: 0, username: 'local', role: 'owner' } };
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const providedToken = authHeader.slice('Bearer '.length);

    if (expectedToken) {
      const providedBuffer = Buffer.from(providedToken);
      const expectedBuffer = Buffer.from(expectedToken);

      const isApiKeyMatch =
        providedBuffer.length === expectedBuffer.length &&
        timingSafeEqual(providedBuffer, expectedBuffer);

      if (isApiKeyMatch) {
        auditLog('auth_success', { path, auth_type: 'api_key' });
        return { valid: true, authType: 'api_key', user: null };
      }
    }

    const sessionResult = getSessionAuthResult(providedToken);
    if (sessionResult.valid) {
      auditLog('auth_success', { path, auth_type: 'session', user_id: sessionResult.user?.id });
      return sessionResult;
    }

    auditLog('auth_failure', { ip, path, reason: 'invalid_bearer_token' });
    return { valid: false, error: 'Invalid API key or session token' };
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionToken) {
    const sessionResult = getSessionAuthResult(sessionToken);
    if (sessionResult.valid) {
      auditLog('auth_success', { path, auth_type: 'session', user_id: sessionResult.user?.id });
      return sessionResult;
    }
  }

  auditLog('auth_failure', { ip, path, reason: 'missing_auth_credentials' });
  return { valid: false, error: 'Missing auth credentials' };
}

export function requireRole(
  authResult: AuthValidationResult,
  minRole: 'viewer' | 'admin' | 'owner'
): { allowed: boolean; error?: string } {
  if (authResult.authType === 'api_key') {
    return { allowed: true };
  }

  if (!authResult.user) {
    return { allowed: false, error: 'No user context' };
  }

  const roleHierarchy = { viewer: 0, admin: 1, owner: 2 };
  const userLevel = roleHierarchy[authResult.user.role] ?? -1;
  const requiredLevel = roleHierarchy[minRole] ?? 0;

  if (userLevel >= requiredLevel) {
    return { allowed: true };
  }

  return { allowed: false, error: `Requires ${minRole} role` };
}

export function corsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get('origin');
  const allowedOrigins = getAllowedOrigins();

  const headers: HeadersInit = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }

  return headers;
}

export function checkRateLimit(request: NextRequest): RateLimitResult {
  const { windowMs, maxRequests } = getRateLimitConfig();
  const ip = extractClientIp(request);
  const path = request.nextUrl.pathname;
  const now = Date.now();
  const windowStart = now - windowMs;

  const bucket = rateLimitBuckets.get(ip) || [];
  const recentRequests = bucket.filter((timestamp) => timestamp > windowStart);

  if (recentRequests.length >= maxRequests) {
    const oldestRequest = recentRequests[0] || now;
    const retryAfterMs = Math.max(oldestRequest + windowMs - now, 0);
    const retryAfterSeconds = Math.max(Math.ceil(retryAfterMs / 1000), 1);

    rateLimitBuckets.set(ip, recentRequests);

    auditLog('rate_limit_hit', { ip, path });

    return {
      allowed: false,
      retryAfterSeconds,
    };
  }

  recentRequests.push(now);
  rateLimitBuckets.set(ip, recentRequests);

  return { allowed: true };
}
