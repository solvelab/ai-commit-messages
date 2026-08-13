/**
 * One generation per repository at a time.
 *
 * The command is exposed on three surfaces — the Source Control button, a keybinding and the
 * palette — and nothing stopped two of them from running at once against the same repository. The
 * result was two progress notifications, a Cancel that only cancelled one of them, and whichever
 * finished last overwriting the commit box.
 *
 * Pure on purpose: the bookkeeping is the part worth testing.
 */

const running = new Map<string, Promise<void>>()

export interface RunOutcome {
  /** False when a run for this key was already in flight. */
  readonly started: boolean
}

/**
 * Runs `work` unless the same key is already running.
 *
 * Keyed by repository, so different repositories still generate in parallel — that is a legitimate
 * use, not the collision this guards against.
 */
export async function runExclusive(key: string, work: () => Promise<void>): Promise<RunOutcome> {
  if (running.has(key)) {
    return { started: false }
  }

  const promise = work().finally(() => {
    running.delete(key)
  })
  running.set(key, promise)
  await promise
  return { started: true }
}

/** True when a run is in flight for this key. */
export function isRunning(key: string): boolean {
  return running.has(key)
}

/** Test seam: forgets every in-flight entry. */
export function resetInflight(): void {
  running.clear()
}
