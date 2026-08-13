import type { ModelInfo } from '../providers/types.js'

/**
 * Where the model list comes from, and in what order.
 *
 * A dropdown inside the settings page is not possible: a setting's `enum` is static in the
 * manifest, and there is no public API for an extension to populate one at runtime. So the list
 * lives in a picker — and a picker is only pleasant if it opens instantly, which means a cache.
 *
 * Order is deliberate: the server is the truth, but a stale list beats an empty one, and a
 * built-in list beats nothing at all.
 */

export type ModelSource = 'server' | 'cache' | 'builtin' | 'none'

export interface CachedModels {
  readonly models: readonly ModelInfo[]
  /** Epoch millis of the load that produced this list. */
  readonly loadedAt: number
}

/** Cache key: the same backend on a different host serves different models. */
export function cacheKey(backendId: string, host: string): string {
  return `models:${backendId}:${host}`
}

export interface ResolveInput {
  /** Models read from the server, when the read succeeded. */
  readonly fromServer?: readonly ModelInfo[]
  readonly cached?: CachedModels | undefined
  readonly builtin?: readonly string[]
}

export interface ResolvedModels {
  readonly models: readonly ModelInfo[]
  readonly source: ModelSource
  /** Set when the list is not fresh, so the picker can say so. */
  readonly staleSince?: number
}

/**
 * Picks the best list available.
 *
 * A failed read never empties the cache — that is the whole point of having one.
 */
export function resolveModels(input: ResolveInput): ResolvedModels {
  if (input.fromServer && input.fromServer.length > 0) {
    return { models: input.fromServer, source: 'server' }
  }

  if (input.cached && input.cached.models.length > 0) {
    return {
      models: input.cached.models,
      source: 'cache',
      staleSince: input.cached.loadedAt,
    }
  }

  if (input.builtin && input.builtin.length > 0) {
    return {
      models: input.builtin.map(id => ({ id, label: id, detail: 'known model, not read from the server' })),
      source: 'builtin',
    }
  }

  return { models: [], source: 'none' }
}

/** Human-readable note for the picker, so a stale list never passes for a fresh one. */
export function describeSource(resolved: ResolvedModels, now: number): string | undefined {
  switch (resolved.source) {
    case 'server':
      return undefined
    case 'cache': {
      const minutes = Math.max(1, Math.round((now - (resolved.staleSince ?? now)) / 60_000))
      return `from the last successful load, ${minutes} min ago — the server did not answer now`
    }
    case 'builtin':
      return 'known models for this backend — the server was not reached'
    case 'none':
      return 'no list available'
  }
}
