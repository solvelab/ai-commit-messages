import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAbortError, linkAbort, withAbort, type CancellationLike } from './net.js'

function token(initial = false): CancellationLike & { cancel(): void; listeners: number } {
  let cancelled = initial
  const listeners: (() => void)[] = []
  return {
    get isCancellationRequested() {
      return cancelled
    },
    get listeners() {
      return listeners.length
    },
    onCancellationRequested(listener: () => void) {
      listeners.push(listener)
      return {
        dispose: () => {
          const index = listeners.indexOf(listener)
          if (index >= 0) {
            listeners.splice(index, 1)
          }
        },
      }
    },
    cancel() {
      cancelled = true
      listeners.forEach(l => l())
    },
  }
}

describe('linkAbort', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('aborts when the deadline passes, reporting timeout', () => {
    const linked = linkAbort(undefined, 1000)
    expect(linked.signal.aborted).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(linked.signal.aborted).toBe(true)
    expect(linked.reason()).toBe('timeout')
    linked.dispose()
  })

  it('aborts when the token is cancelled, reporting cancellation', () => {
    const t = token()
    const linked = linkAbort(t, 60_000)
    t.cancel()
    expect(linked.signal.aborted).toBe(true)
    expect(linked.reason()).toBe('cancelled')
    linked.dispose()
  })

  it('honours a token that was ALREADY cancelled — the event will never fire again', () => {
    const linked = linkAbort(token(true), 60_000)
    expect(linked.signal.aborted).toBe(true)
    expect(linked.reason()).toBe('cancelled')
    linked.dispose()
  })

  it('keeps the first reason when both fire', () => {
    const t = token()
    const linked = linkAbort(t, 1000)
    t.cancel()
    vi.advanceTimersByTime(5000)
    expect(linked.reason()).toBe('cancelled')
    linked.dispose()
  })

  it('releases the token listener on dispose', () => {
    const t = token()
    const linked = linkAbort(t, 1000)
    expect(t.listeners).toBe(1)
    linked.dispose()
    expect(t.listeners).toBe(0)
  })

  it('does not fire after dispose — the leak that keeps the host awake', () => {
    const linked = linkAbort(undefined, 1000)
    linked.dispose()
    vi.advanceTimersByTime(5000)
    expect(linked.signal.aborted).toBe(false)
  })

  it('treats a non-positive timeout as no deadline', () => {
    const linked = linkAbort(undefined, 0)
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(linked.signal.aborted).toBe(false)
    linked.dispose()
  })
})

describe('withAbort', () => {
  it('returns the value when the work finishes', async () => {
    const result = await withAbort({}, async () => 'done')
    expect(result).toEqual({ ok: true, value: 'done' })
  })

  it('reports cancellation instead of throwing', async () => {
    const t = token()
    const result = await withAbort({ token: t }, async signal => {
      t.cancel()
      const error = new Error('aborted')
      error.name = 'AbortError'
      expect(signal.aborted).toBe(true)
      throw error
    })
    expect(result).toEqual({ ok: false, reason: 'cancelled' })
  })

  it('recognises the provider abort code as well as AbortError', async () => {
    const t = token()
    const result = await withAbort({ token: t }, async () => {
      t.cancel()
      throw Object.assign(new Error('Request cancelled.'), { code: 'aborted' })
    })
    expect(result).toEqual({ ok: false, reason: 'cancelled' })
  })

  it('lets an unrelated failure through instead of swallowing it as cancellation', async () => {
    await expect(
      withAbort({ token: token() }, async () => {
        throw new Error('ECONNREFUSED')
      }),
    ).rejects.toThrow('ECONNREFUSED')
  })

  it('disposes even when the work throws', async () => {
    const t = token()
    await withAbort({ token: t }, async () => 1)
    expect(t.listeners).toBe(0)
    await expect(
      withAbort({ token: t }, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(t.listeners).toBe(0)
  })
})

describe('isAbortError', () => {
  it('recognises the rejection fetch produces', () => {
    const error = new Error('The operation was aborted')
    error.name = 'AbortError'
    expect(isAbortError(error)).toBe(true)
  })

  it('does not treat every error as an abort', () => {
    expect(isAbortError(new Error('nope'))).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
  })
})
