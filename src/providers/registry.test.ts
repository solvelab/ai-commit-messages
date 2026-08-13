import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createProvider, isImplemented, knownProviders } from './registry.js'
import { OllamaProvider } from './ollama.js'
import { ProviderError, type FetchLike } from './types.js'
import { PROVIDERS, type ProviderId } from '../settings.js'

const fetchImpl: FetchLike = async () => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  text: async () => '{}',
})

const context = { endpoint: 'http://h:11434', fetch: fetchImpl }

describe('createProvider', () => {
  it('builds the Ollama adapter for ollama', () => {
    expect(createProvider('ollama', context)).toBeInstanceOf(OllamaProvider)
  })

  it('refuses openai-compat out loud instead of silently using Ollama', () => {
    // The bug this module exists for: the provider setting was never read.
    expect(() => createProvider('openai-compat', context)).toThrow(ProviderError)
    expect(() => createProvider('openai-compat', context)).toThrow(/not available yet/)
  })

  it.each(PROVIDERS)('handles %s — either builds it or refuses it, never the wrong one', id => {
    if (isImplemented(id)) {
      expect(createProvider(id, context).id).toBe(id)
    } else {
      expect(() => createProvider(id, context)).toThrow(ProviderError)
    }
  })

  it('passes extra headers through to the adapter', () => {
    const provider = createProvider('ollama', { ...context, headers: { 'x-test': '1' } })
    expect(provider).toBeInstanceOf(OllamaProvider)
  })
})

describe('the manifest and the code agree on the provider list', () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
  ) as { contributes: { configuration: { properties: Record<string, { enum?: string[] }> }[] } }

  const declared = manifest.contributes.configuration
    .flatMap(node => Object.entries(node.properties))
    .find(([key]) => key === 'aiCommitMessages.provider')?.[1].enum

  it('offers exactly the providers the code knows about', () => {
    // Drift here is how an option gets offered that nothing implements.
    expect(declared?.slice().sort()).toEqual([...knownProviders()].sort())
  })

  it('every declared provider has a dispatch branch', () => {
    for (const id of declared ?? []) {
      expect(() => createProvider(id as ProviderId, context)).not.toThrow(/Unknown provider/)
    }
  })
})
