import { createHash, randomBytes } from 'crypto';

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const SESSION_COOKIE_NAME = 'ocd_session';
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export function buildSessionCookie(token: string, maxAge: number = SESSION_MAX_AGE): string {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
