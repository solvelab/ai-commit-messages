import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isRunning, resetInflight, runExclusive } from './inflight.js'

describe('runExclusive', () => {
  beforeEach(() => resetInflight())

  it('refuses a second run for the same key while the first is in flight', async () => {
    let release: () => void = () => {}
    const work = vi.fn(() => new Promise<void>(resolve => (release = resolve)))

    const first = runExclusive('repo-a', work)
    const second = await runExclusive('repo-a', work)

    // Two surfaces firing the command produced two generations racing for the commit box.
    expect(second.started).toBe(false)
    expect(work).toHaveBeenCalledOnce()

    release()
    expect((await first).started).toBe(true)
  })

  it('lets different repositories run in parallel — that is legitimate', async () => {
    let releaseA: () => void = () => {}
    const a = runExclusive('repo-a', () => new Promise<void>(r => (releaseA = r)))
    const b = await runExclusive('repo-b', async () => {})

    expect(b.started).toBe(true)
    releaseA()
    await a
  })

  it('frees the key when the work finishes', async () => {
    await runExclusive('repo-a', async () => {})
    expect(isRunning('repo-a')).toBe(false)
    expect((await runExclusive('repo-a', async () => {})).started).toBe(true)
  })

  it('frees the key when the work throws', async () => {
    await expect(
      runExclusive('repo-a', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    // A failed generation must not lock the repository forever.
    expect(isRunning('repo-a')).toBe(false)
  })
})
