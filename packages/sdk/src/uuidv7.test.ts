import { describe, expect, it } from 'vitest';

import { uuidv7 } from './uuidv7.js';

describe('uuidv7', () => {
  it('has the RFC 9562 shape, version 7 and variant 10', () => {
    expect(uuidv7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('encodes the timestamp in the first 48 bits, so ids sort by time', () => {
    const at = Date.UTC(2026, 9, 3, 12, 0, 0, 123);
    const id = uuidv7(at);
    expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(at);
    expect(uuidv7(at) < uuidv7(at + 1)).toBe(true);
  });
});
