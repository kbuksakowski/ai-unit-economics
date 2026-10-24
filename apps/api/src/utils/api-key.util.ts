import { createHash, randomBytes } from 'node:crypto';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// The readable prefix lets secret scanners and log readers recognise a leaked key, and tell
// an ingestion key from a read key (ADR-0005).
export const API_KEY_PREFIX = { ingestion: 'aiue_live_', read: 'aiue_read_' } as const;

export function generateApiKey(prefix: string = API_KEY_PREFIX.ingestion): string {
  let n = BigInt(`0x${randomBytes(32).toString('hex')}`);
  let encoded = '';
  while (n > 0n) {
    encoded = BASE58_ALPHABET[Number(n % 58n)]! + encoded;
    n /= 58n;
  }
  return prefix + encoded;
}

export function readBearerToken(header: string | string[] | undefined): string | undefined {
  return typeof header === 'string' ? /^Bearer (\S+)$/.exec(header)?.[1] : undefined;
}

// SHA-256, not a password hash: 256 bits of entropy make a slow derivation pure latency (ADR-0005).
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
