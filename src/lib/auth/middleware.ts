import { timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import { auditLog } from '@/lib/audit';

const DEFAULT_ALLOWED_ORIGINS = 'http://127.0.0.1:3000,http://localhost:3000';
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 60;

const rateLimitBuckets = new Map<string, number[]>();

type AuthValidationResult = {
  valid: boolean;
  error?: string;
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

export function validateAuth(request: NextRequest): AuthValidationResult {
  const path = request.nextUrl.pathname;
  const ip = extractClientIp(request);
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.DASHBOARD_API_KEY;

  if (!expectedToken) {
    auditLog('auth_failure', { ip, path, reason: 'missing_server_api_key' });
    return { valid: false, error: 'Missing server API key configuration' };
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    auditLog('auth_failure', { ip, path, reason: 'missing_or_invalid_authorization_header' });
    return { valid: false, error: 'Missing or invalid Authorization header' };
  }

  const providedToken = authHeader.slice('Bearer '.length);
  const providedBuffer = Buffer.from(providedToken);
  const expectedBuffer = Buffer.from(expectedToken);

  const isMatch =
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer);

  if (!isMatch) {
    auditLog('auth_failure', { ip, path, reason: 'invalid_api_key' });
    return { valid: false, error: 'Invalid API key' };
  }

  auditLog('auth_success', { path });
  return { valid: true };
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
