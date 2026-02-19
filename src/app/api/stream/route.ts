import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hashToken } from '@/lib/auth/session';
import db from '@/lib/db';
import { corsHeaders } from '@/lib/auth/middleware';
import { eventBus, type DashboardEvent } from '@/lib/events/eventBus';

function validateQueryToken(token: string): boolean {
  const expectedToken = process.env.DASHBOARD_API_KEY;

  if (expectedToken) {
    const providedBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expectedToken);
    const isApiKeyMatch =
      providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);

    if (isApiKeyMatch) {
      return true;
    }
  }

  const session = db.getAuthSessionByTokenHash(hashToken(token));
  if (!session) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at <= now) {
    db.deleteAuthSession(session.id);
    return false;
  }

  return Boolean(db.getUserById(session.user_id));
}

function sseMessage(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const AUTH_DISABLED = process.env.DISABLE_AUTH === 'true';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!AUTH_DISABLED && (!token || !validateQueryToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (eventName: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseMessage(eventName, data)));
      };

      const onDashboardEvent = (event?: DashboardEvent) => {
        if (!event) {
          return;
        }
        send(event.type, event.payload);
      };

      eventBus.on('dashboard-event', onDashboardEvent);
      send('connected', { connected: true });

      const pingInterval = setInterval(() => {
        send('ping', {});
      }, 30_000);

      cleanup = () => {
        clearInterval(pingInterval);
        eventBus.off('dashboard-event', onDashboardEvent);
      };

      request.signal.addEventListener('abort', () => {
        cleanup();
        controller.close();
      });
    },
    cancel() {
      cleanup();
    },
  });

  const headers = new Headers(corsHeaders(request));
  headers.set('Content-Type', 'text/event-stream');
  headers.set('Cache-Control', 'no-cache');
  headers.set('Connection', 'keep-alive');

  return new NextResponse(stream, { status: 200, headers });
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

  return new NextResponse(null, { status: 200, headers });
}
