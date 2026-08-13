/**
 * The single place a network call gets a deadline and a way to be stopped.
 *
 * Three facts drive this module:
 *
 * - **`fetch` has no timeout.** Without an `AbortSignal`, a wrong LAN address behind a firewall
 *   that DROPs packets hangs until the OS SYN timeout.
 * - **`CancellationToken` is not an `AbortSignal`.** It is `{ isCancellationRequested,
 *   onCancellationRequested }`, so the bridge is manual — and the token may *already* be cancelled
 *   when it arrives, in which case subscribing alone misses it forever.
 * - **Every listener and timer must be released.** One leak per request adds up over a session
 *   spent committing.
 *
 * Free of `vscode`: the token arrives through the minimal shape below.
 */

/** The part of `vscode.CancellationToken` this module needs. */
export interface CancellationLike {
  readonly isCancellationRequested: boolean
  onCancellationRequested(listener: () => void): { dispose(): void }
}

export type AbortReason = 'cancelled' | 'timeout'

export interface LinkedAbort {
  readonly signal: AbortSignal
  /** Why the signal fired, once it has. */
  reason(): AbortReason | undefined
  /** Releases the timer and the token listener. MUST run in a `finally`. */
  dispose(): void
}

export const DEFAULT_TIMEOUT_MS = 60_000

/**
 * Ties a cancellation token and a deadline to one `AbortSignal`.
 *
 * @param timeoutMs generous by default: loading a model into memory on a cold Ollama can take more
 * than 30 s, and aborting that looks like a broken extension.
 */
export function linkAbort(
  token?: CancellationLike,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): LinkedAbort {
  const controller = new AbortController()
  let reason: AbortReason | undefined

  const abort = (why: AbortReason) => {
    if (!reason) {
      reason = why
      controller.abort()
    }
  }

  const timer = timeoutMs > 0 ? setTimeout(() => abort('timeout'), timeoutMs) : undefined
  let subscription: { dispose(): void } | undefined

  if (token) {
    // Check first: a token that is already cancelled will never fire the event again.
    if (token.isCancellationRequested) {
      abort('cancelled')
    } else {
      subscription = token.onCancellationRequested(() => abort('cancelled'))
    }
  }

  return {
    signal: controller.signal,
    reason: () => reason,
    dispose: () => {
      if (timer) {
        clearTimeout(timer)
      }
      subscription?.dispose()
    },
  }
}

/** True for the rejection `fetch` produces when its signal fires. */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * Runs `work` under a deadline, releasing the timer and listener whatever happens, and telling
 * cancellation apart from timeout.
 */
export async function withAbort<T>(
  options: { token?: CancellationLike; timeoutMs?: number },
  work: (signal: AbortSignal) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; reason: AbortReason }> {
  const linked = linkAbort(options.token, options.timeoutMs)
  try {
    const value = await work(linked.signal)
    return { ok: true, value }
  } catch (error) {
    const reason = linked.reason()
    if (reason && (isAbortError(error) || isProviderAbort(error))) {
      return { ok: false, reason }
    }
    throw error
  } finally {
    // Not optional: an unreleased timer keeps the extension host awake.
    linked.dispose()
  }
}

function isProviderAbort(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'aborted'
  )
}
