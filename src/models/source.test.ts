import { describe, expect, it } from 'vitest'

import { knownModels } from './catalog.js'
import { cacheKey, describeSource, resolveModels } from './source.js'

const SERVER = [{ id: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b' }]
const CACHED = { models: [{ id: 'llama3.2:latest', label: 'llama3.2:latest' }], loadedAt: 1_000 }

describe('cacheKey', () => {
  it('separates the same backend on different hosts', () => {
    // The same Ollama build serves whatever models were pulled on that machine.
    expect(cacheKey('ollama', '192.168.15.6:11434')).not.toBe(cacheKey('ollama', '127.0.0.1:11434'))
  })

  it('separates different backends on the same host', () => {
    expect(cacheKey('ollama', 'h')).not.toBe(cacheKey('ollama-openai', 'h'))
  })
})

describe('resolveModels', () => {
  it('prefers the server', () => {
    const r = resolveModels({ fromServer: SERVER, cached: CACHED, builtin: ['x'] })
    expect(r.source).toBe('server')
    expect(r.models).toEqual(SERVER)
  })

  it('falls back to the cache when the server did not answer', () => {
    const r = resolveModels({ cached: CACHED, builtin: ['x'] })
    expect(r.source).toBe('cache')
    expect(r.staleSince).toBe(1_000)
  })

  it('a failed read never empties the cache — the whole point of having one', () => {
    const r = resolveModels({ fromServer: [], cached: CACHED })
    expect(r.source).toBe('cache')
    expect(r.models).toEqual(CACHED.models)
  })

  it('falls back to the known models when there is no cache either', () => {
    const r = resolveModels({ builtin: ['gpt-4o-mini'] })
    expect(r.source).toBe('builtin')
    expect(r.models[0].id).toBe('gpt-4o-mini')
    // Labelled, so an approximate list never passes for the server's.
    expect(r.models[0].detail).toMatch(/not read from the server/)
  })

  it('reports nothing available when there is nothing', () => {
    expect(resolveModels({}).source).toBe('none')
  })
})

describe('describeSource', () => {
  it('says nothing when the list is fresh', () => {
    expect(describeSource({ models: SERVER, source: 'server' }, 0)).toBeUndefined()
  })

  it('says how old a cached list is', () => {
    const note = describeSource(
      { models: CACHED.models, source: 'cache', staleSince: 0 },
      10 * 60_000,
    )
    expect(note).toMatch(/10 min ago/)
    expect(note).toMatch(/did not answer/)
  })

  it('admits when the list is only the built-in one', () => {
    expect(describeSource({ models: [], source: 'builtin' }, 0)).toMatch(/was not reached/)
  })
})

describe('known models', () => {
  it('offers a starting point for the backends whose catalogue is public', () => {
    expect(knownModels('ollama').length).toBeGreaterThan(0)
    expect(knownModels('groq').length).toBeGreaterThan(0)
  })

  it('offers nothing for servers whose models depend entirely on the install', () => {
    // Guessing what someone loaded into LM Studio would be worse than admitting we do not know.
    expect(knownModels('lmstudio')).toEqual([])
    expect(knownModels('custom')).toEqual([])
  })

  it('is empty for an unknown backend instead of throwing', () => {
    expect(knownModels('bogus')).toEqual([])
  })
})
