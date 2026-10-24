/**
 * The page works in whole UTC days with an inclusive end, as people read a date range; the
 * API takes `from` inclusive and `to` exclusive (ADR-0010), so the end date gains a day.
 */
export interface DateRange {
  /** YYYY-MM-DD, inclusive. */
  fromDate: string;
  /** YYYY-MM-DD, inclusive. */
  toDate: string;
  /** ISO, inclusive, for the API. */
  from: string;
  /** ISO, exclusive, for the API. */
  to: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Defaults to the current UTC month; the chosen range is always shown on the page. */
export function resolveDateRange(
  params: { from?: string | string[]; to?: string | string[] },
  now: Date = new Date(),
): DateRange {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  let fromDate = validDate(params.from) ?? isoDate(monthStart);
  let toDate = validDate(params.to) ?? isoDate(monthEnd);
  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];

  const exclusiveEnd = new Date(`${toDate}T00:00:00.000Z`);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  return {
    fromDate,
    toDate,
    from: `${fromDate}T00:00:00.000Z`,
    to: exclusiveEnd.toISOString(),
  };
}

function validDate(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string' || !DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && isoDate(parsed) === value ? value : null;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
