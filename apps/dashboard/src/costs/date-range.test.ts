import { describe, expect, it } from 'vitest';

import { resolveDateRange } from './date-range';

const NOW = new Date('2026-10-17T15:00:00.000Z');

describe('resolveDateRange', () => {
  it('defaults to the current UTC month', () => {
    expect(resolveDateRange({}, NOW)).toEqual({
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-11-01T00:00:00.000Z',
    });
  });

  it('turns an inclusive end date into the exclusive bound the API expects', () => {
    const range = resolveDateRange({ from: '2026-10-04', to: '2026-10-04' }, NOW);
    expect([range.from, range.to]).toEqual([
      '2026-10-04T00:00:00.000Z',
      '2026-10-05T00:00:00.000Z',
    ]);
  });

  it('crosses a year end', () => {
    expect(resolveDateRange({ from: '2026-12-01', to: '2026-12-31' }, NOW).to).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });

  it('swaps a reversed range rather than sending an empty one', () => {
    const range = resolveDateRange({ from: '2026-10-20', to: '2026-10-10' }, NOW);
    expect([range.fromDate, range.toDate]).toEqual(['2026-10-10', '2026-10-20']);
  });

  it.each([['2026-02-30'], ['17/10/2026'], ['2026-10-1'], ['']])(
    'ignores the invalid date %j',
    (value) => {
      expect(resolveDateRange({ from: value }, NOW).fromDate).toBe('2026-10-01');
    },
  );

  it('ignores a repeated parameter', () => {
    expect(resolveDateRange({ from: ['2026-10-02', '2026-10-03'] }, NOW).fromDate).toBe(
      '2026-10-01',
    );
  });
});
