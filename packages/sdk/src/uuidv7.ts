import { randomFillSync } from 'node:crypto';

/**
 * RFC 9562 UUIDv7: 48-bit Unix milliseconds, then random bits. Node has no built-in and
 * `crypto.randomUUID()` is v4 only; see docs/adr/0004.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomFillSync(new Uint8Array(16));
  const ms = BigInt(now);
  for (let i = 0; i < 6; i++) {
    bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
