/**
 * What the SDK reports about itself through `onError`.
 *
 * A code rather than a bare exception, because a limitation of this release and a
 * failure of ours must not share one undifferentiated channel: a caller should be able to
 * silence the first and alert on the last. See docs/adr/0008.
 */
export type SdkDiagnosticCode =
  | 'stream_not_supported'
  | 'invalid_customer_id'
  | 'invalid_feature'
  | 'invalid_config'
  | 'insecure_transport'
  | 'delivery_failed';

export interface SdkDiagnostic {
  code: SdkDiagnosticCode;
  message: string;
  cause?: unknown;
}

/** May be async; a rejected promise is caught like a thrown error. */
export type OnError = (diagnostic: SdkDiagnostic) => void | Promise<void>;

/**
 * A throwing or rejecting `onError` is the caller's bug, but it must not reach their AI
 * call or become an unhandled rejection, which Node treats as fatal by default.
 */
export function safeReport(onError: OnError, diagnostic: SdkDiagnostic): void {
  try {
    const result: unknown = onError(diagnostic);
    if (typeof (result as PromiseLike<unknown> | undefined)?.then === 'function') {
      (result as PromiseLike<unknown>).then(undefined, () => {});
    }
  } catch {
    // Swallowed: nothing this SDK does may surface in the host application.
  }
}
