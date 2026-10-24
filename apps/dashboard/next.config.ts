import { join } from 'node:path';

import type { NextConfig } from 'next';

// Standalone output keeps the Docker image to the files the server actually needs; the
// tracing root is the monorepo, so workspace packages are included.
const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  // The pages show confidential cost data: never framed, never sniffed, no referrer leaks.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default config;
