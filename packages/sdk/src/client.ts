import type {
  IngestEnvelope,
  IngestResponse,
  JsonValue,
  UsageEvent,
} from '@ai-unit-economics/contracts';

import { safeReport, type OnError, type SdkDiagnosticCode } from './diagnostics.js';
import { MAX_BUSINESS_ID_LENGTH } from './limits.js';
import { uuidv7 } from './uuidv7.js';
import { SDK_NAME, SDK_VERSION } from './version.js';

// Nothing exported from this module may name a type from `contracts`: its declarations
// are published, and the packaging test fails if they reference it. See docs/adr/0008.

/**
 * Five options and deliberately no more: every option added is one maintained for years.
 * Logging, retries, batching and sampling come later, with buffering. See docs/adr/0008.
 */
export interface ClientConfig {
  apiKey: string;
  baseUrl: string;
  /** Per delivery attempt. Defaults to 2000. */
  timeoutMs?: number;
  /** The only channel through which the SDK reports its own problems. Defaults to a no-op. */
  onError?: OnError;
  /** When false, `track()` calls the function and does nothing else. Defaults to true. */
  enabled?: boolean;
}

export interface TrackOptions {
  /** Optional on purpose: usage without a customer is still real cost. */
  customerId?: string;
  feature?: string;
}

export interface Client {
  /**
   * Calls `fn` and returns exactly what it returns. A provider exception reaches the
   * caller unchanged; nothing the SDK itself does ever does.
   */
  track<T>(fn: () => T, options?: TrackOptions | null): T;
}

/** The subset of the Anthropic SDK's `APIPromise` we rely on, duck-typed. */
interface ApiPromiseLike {
  _thenUnwrap(transform: (data: unknown, props: ResponseProps) => unknown): unknown;
}

interface ResponseProps {
  response: Response;
  options: { body?: unknown; path?: unknown };
}

interface Transport {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  onError: OnError;
}

const PROVIDER_CLIENT = { name: '@anthropic-ai/sdk' } as const;
const DEFAULT_TIMEOUT_MS = 2000;

// Message creation, plain or beta. Token counting, batches and other providers' SDKs that
// share the same promise shape do not produce billable usage here and are not reported.
const MESSAGES_PATH = /^\/v1\/messages(\?|$)/;

// Bounds sockets held by deliveries to an unreachable API: a connect can outlive the abort
// by seconds, and a burst must not exhaust the host's file descriptors (ADR-0004).
const MAX_DELIVERIES_IN_FLIGHT = 32;

export function createClient(config: ClientConfig): Client {
  const onError: OnError = typeof config?.onError === 'function' ? config.onError : () => {};

  // A missing environment variable must not crash the host at startup: report it once and
  // behave as disabled.
  const problem = configProblem(config);
  if (problem) {
    safeReport(onError, { code: 'invalid_config', message: `${problem}; tracking is disabled.` });
    return { track: (fn) => fn() };
  }

  const transport: Transport = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    onError,
  };
  if (isInsecureRemote(transport.baseUrl)) {
    safeReport(onError, {
      code: 'insecure_transport',
      message:
        'baseUrl uses plain http to a remote host; the ingestion key crosses the network unencrypted. Use https.',
    });
  }

  // Once per client per code, not per call: an application that streams everything, or
  // sends an empty customer id for anonymous users, would otherwise drown the channel and
  // mute it, `delivery_failed` included. Every event still carries what happened.
  const reported = new Set<SdkDiagnosticCode>();
  const reportOnce = (code: SdkDiagnosticCode, message: string): void => {
    if (reported.has(code)) return;
    reported.add(code);
    safeReport(onError, { code, message });
  };
  const reportStream = (): void =>
    reportOnce(
      'stream_not_supported',
      'Streaming responses are passed through but not measured in this release.',
    );

  let inFlight = 0;
  let droppedSinceReport = false;
  function send(event: UsageEvent): void {
    if (inFlight >= MAX_DELIVERIES_IN_FLIGHT) {
      if (!droppedSinceReport) {
        droppedSinceReport = true;
        safeReport(onError, {
          code: 'delivery_failed',
          message: `More than ${MAX_DELIVERIES_IN_FLIGHT} deliveries in flight; events are being dropped.`,
        });
      }
      return;
    }
    inFlight++;
    deliver(event, transport)
      .then(() => {
        droppedSinceReport = false;
      })
      .catch((cause: unknown) => {
        safeReport(onError, {
          code: 'delivery_failed',
          message: cause instanceof Error ? cause.message : 'delivery failed',
          cause,
        });
      })
      .finally(() => {
        inFlight--;
      });
  }

  function track<T>(fn: () => T, options?: TrackOptions | null): T {
    if (config.enabled === false) return fn();

    const startedAt = Date.now();
    // A provider exception thrown synchronously propagates from here unchanged.
    const result = fn();

    try {
      if (isApiPromise(result)) {
        // A page of a list endpoint is iterable as well; wrapping would return a plain
        // APIPromise and break `for await`. Lists carry no usage, so it passes untouched.
        if (isAsyncIterable(result)) return result;
        return result._thenUnwrap((data, props) => {
          try {
            observe(data, props, startedAt, options ?? {});
          } catch {
            // Swallowed: instrumentation must never alter what the caller receives.
          }
          return data;
        }) as T;
      }
      if (isAsyncIterable(result) && hasMethod(result, 'finalMessage')) {
        // `messages.stream()` returns a MessageStream synchronously. Its parameters are
        // private, so there is no requested model to report.
        reportStream();
      }
    } catch {
      // Swallowed for the same reason.
    }
    return result;
  }

  function observe(
    data: unknown,
    props: ResponseProps,
    startedAt: number,
    options: TrackOptions,
  ): void {
    const path = props.options.path;
    if (typeof path !== 'string' || !MESSAGES_PATH.test(path)) return;
    const requestedModel = readString(props.options.body, 'model');
    if (requestedModel === undefined) return;

    const id = uuidv7(startedAt);
    const event: UsageEvent = {
      idempotencyKey: id,
      usageEventId: id,
      occurredAt: new Date(startedAt).toISOString(),
      provider: 'anthropic',
      providerClient: PROVIDER_CLIENT,
      requestedModel,
      operation: 'chat',
      status: 'success',
      durationMs: Math.max(0, Date.now() - startedAt),
      usageStatus: 'not_reported',
      ...attribution(options),
    };
    const requestId = props.response.headers.get('request-id');
    if (requestId) event.providerRequestId = requestId;

    if (isAsyncIterable(data)) {
      reportStream();
    } else {
      const respondedModel = readString(data, 'model');
      if (respondedModel !== undefined) event.respondedModel = respondedModel;
      const rawUsage = copyUsage(data);
      if (rawUsage !== undefined) {
        event.rawUsage = rawUsage;
        event.usageStatus = 'reported';
      }
    }
    send(event);
  }

  /** Invalid identifiers are dropped, not the event: the cost is real either way. */
  function attribution(options: TrackOptions): Pick<UsageEvent, 'customerId' | 'feature'> {
    const out: Pick<UsageEvent, 'customerId' | 'feature'> = {};
    if (options.customerId !== undefined) {
      if (isBusinessId(options.customerId)) out.customerId = options.customerId;
      else
        reportOnce(
          'invalid_customer_id',
          `customerId must be a string of 1 to ${MAX_BUSINESS_ID_LENGTH} characters; events are sent without it.`,
        );
    }
    if (options.feature !== undefined) {
      if (isBusinessId(options.feature)) out.feature = options.feature;
      else
        reportOnce(
          'invalid_feature',
          `feature must be a string of 1 to ${MAX_BUSINESS_ID_LENGTH} characters; events are sent without it.`,
        );
    }
    return out;
  }

  return { track };
}

function configProblem(config: ClientConfig | undefined): string | null {
  if (typeof config !== 'object' || config === null) return 'no configuration was given';
  if (typeof config.apiKey !== 'string' || config.apiKey === '') return 'apiKey is missing';
  if (typeof config.baseUrl !== 'string' || !/^https?:\/\//.test(config.baseUrl)) {
    return 'baseUrl must be an http(s) URL';
  }
  const timeout = config.timeoutMs;
  if (timeout !== undefined && !(Number.isFinite(timeout) && timeout > 0)) {
    return 'timeoutMs must be a positive number';
  }
  return null;
}

function isInsecureRemote(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return (
      url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function isApiPromise(value: unknown): value is ApiPromiseLike {
  return hasMethod(value, '_thenUnwrap');
}

function isAsyncIterable(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
  );
}

function hasMethod(value: unknown, name: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)[name] === 'function'
  );
}

function isBusinessId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_BUSINESS_ID_LENGTH;
}

function readString(source: unknown, key: string): string | undefined {
  if (typeof source !== 'object' || source === null) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * The provider's usage object, untouched apart from a JSON round trip that detaches it
 * from the caller's response. If that fails the field is dropped, never thrown.
 */
function copyUsage(data: unknown): JsonValue | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const usage = (data as { usage?: unknown }).usage;
  if (usage === undefined || usage === null) return undefined;
  try {
    return JSON.parse(JSON.stringify(usage)) as JsonValue;
  } catch {
    return undefined;
  }
}

/**
 * Sends one event. Never awaited by the caller; there are no retries yet, so an event is
 * lost if delivery fails or the process exits mid-send.
 */
async function deliver(event: UsageEvent, options: Transport): Promise<void> {
  const envelope: IngestEnvelope = {
    sdk: { name: SDK_NAME, version: SDK_VERSION },
    events: [event],
  };
  const response = await fetch(`${options.baseUrl}/v1/usage`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  if (!response.ok) {
    // An unread body keeps its socket and buffers alive until garbage collection.
    await response.body?.cancel().catch(() => {});
    throw new Error(`ingestion answered ${response.status}`);
  }
  // A well-formed envelope always answers 200; per-event rejections are in the body.
  const body = (await response.json()) as Partial<IngestResponse> | null;
  const rejected = body?.errors?.[0];
  if (rejected) {
    throw new Error(`ingestion rejected the event: ${rejected.code}: ${rejected.message}`);
  }
}
