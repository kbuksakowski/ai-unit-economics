import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';

import { proxy } from './proxy';

function request(authorization?: string): NextRequest {
  return new NextRequest('http://dashboard.test/', {
    headers: authorization ? { authorization } : {},
  });
}

const basic = (user: string, password: string) => `Basic ${btoa(`${user}:${password}`)}`;

afterEach(() => {
  delete process.env.DASHBOARD_USER;
  delete process.env.DASHBOARD_PASSWORD;
});

describe('dashboard login', () => {
  it('refuses to serve at all when no credentials are configured', () => {
    expect(proxy(request(basic('a', 'b'))).status).toBe(503);
  });

  describe('when configured', () => {
    it.each([
      ['no credentials', undefined],
      ['a wrong password', basic('admin', 'wrong')],
      ['a wrong user', basic('root', 'hunter2')],
      ['a different scheme', 'Bearer aiue_read_x'],
    ])('challenges %s', (_, authorization) => {
      process.env.DASHBOARD_USER = 'admin';
      process.env.DASHBOARD_PASSWORD = 'hunter2';
      const response = proxy(request(authorization));
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain('Basic');
    });

    it('accepts credentials outside Latin-1, encoded as UTF-8 like a browser does', () => {
      process.env.DASHBOARD_USER = 'Ωmega';
      process.env.DASHBOARD_PASSWORD = 'パスワード';
      const encoded = Buffer.from('Ωmega:パスワード', 'utf8').toString('base64');
      expect(proxy(request(`Basic ${encoded}`)).status).toBe(200);
    });

    it('lets the right credentials through', () => {
      process.env.DASHBOARD_USER = 'admin';
      process.env.DASHBOARD_PASSWORD = 'hunter2';
      const response = proxy(request(basic('admin', 'hunter2')));
      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });
  });
});
