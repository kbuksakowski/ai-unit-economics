import { NextResponse, type NextRequest } from 'next/server';

import { loadBasicAuthCredentials } from './src/config/dashboard.config';

/**
 * HTTP Basic on every request, static files included (ADR-0011). Without credentials configured
 * the dashboard refuses to serve rather than run open: it shows which customers are expensive.
 */
export function proxy(request: NextRequest): NextResponse {
  const credentials = loadBasicAuthCredentials();
  if (!credentials) {
    return new NextResponse(
      'Dashboard login is not configured (DASHBOARD_USER, DASHBOARD_PASSWORD).',
      {
        status: 503,
      },
    );
  }
  const expected = `Basic ${toBase64Utf8(`${credentials.user}:${credentials.password}`)}`;
  if (constantTimeEqual(request.headers.get('authorization') ?? '', expected)) {
    return NextResponse.next();
  }
  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="AI Unit Economics", charset="UTF-8"' },
  });
}

// btoa accepts Latin-1 only; credentials are encoded as UTF-8 first, as browsers send them.
function toBase64Utf8(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Compares every character, so response time does not reveal how much of a guess was right.
function constantTimeEqual(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return difference === 0;
}
