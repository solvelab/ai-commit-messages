import { describe, expect, it, vi } from 'vitest'

import { COMPAT_PRESETS } from './providers/presets.js'
import { createProvider } from './providers/registry.js'
import { readSettings } from './settings.js'
import type { FetchLike } from './providers/types.js'

/**
 * The test that was missing.
 *
 * Every existing test built the provider directly from a raw URL, so `readSettings` was never in
 * the path — and `readSettings` was exactly where the endpoint got destroyed. This file exercises
 * the whole chain: raw configuration → readSettings → createProvider → the URL actually requested.
 */

function spy(): { fetch: FetchLike; urls: string[] } {
  const urls: string[] = []
  const fetch: FetchLike = vi.fn(async (url: string) => {
    urls.push(url)
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ data: [], models: [], message: { content: '{}' } }),
    }
  })
  return { fetch, urls }
}

async function urlFor(raw: Record<string, unknown>): Promise<string> {
  const { settings } = readSettings(raw)
  const { fetch, urls } = spy()
  const provider = createProvider(settings.provider, {
    endpoint: settings.endpoint,
    fetch,
    presetId: settings.compatPreset,
  })
  await provider.listModels()
  return urls[0]
}

describe('settings → provider → URL, for every OpenAI-compatible preset', () => {
  const cases = COMPAT_PRESETS.filter(p => p.baseUrl).map(p => [p.id, p.baseUrl] as const)

  it.each(cases)('%s keeps the base its API requires', async (presetId, baseUrl) => {
    const url = await urlFor({ provider: 'openai-compat', compatPreset: presetId, endpoint: baseUrl })
    expect(url).toBe(`${baseUrl.replace(/\/+$/, '')}/models`)
  })

  it('keeps /v1 on the endpoint stored in settings', () => {
    const { settings } = readSettings({
      provider: 'openai-compat',
      endpoint: 'https://api.groq.com/openai/v1',
    })
    // The bug: this used to come back as `https://api.groq.com/openai`.
    expect(settings.endpoint).toBe('https://api.groq.com/openai/v1')
  })

  it('still trims a pasted operation path', async () => {
    expect(
      await urlFor({
        provider: 'openai-compat',
        compatPreset: 'openai',
        endpoint: 'https://api.openai.com/v1/chat/completions',
      }),
    ).toBe('https://api.openai.com/v1/models')
  })
})

describe('settings → provider → URL, for Ollama', () => {
  it.each([
    ['http://192.168.15.6:11434/api/generate', 'http://192.168.15.6:11434/api/tags'],
    ['http://192.168.15.6:11434/api/chat', 'http://192.168.15.6:11434/api/tags'],
    ['http://192.168.15.6:11434', 'http://192.168.15.6:11434/api/tags'],
    ['http://192.168.15.6:11434/v1', 'http://192.168.15.6:11434/api/tags'],
  ])('%s → %s', async (endpoint, expected) => {
    expect(await urlFor({ provider: 'ollama', endpoint })).toBe(expected)
  })

  it('keeps a path that is not an Ollama route', async () => {
    expect(await urlFor({ provider: 'ollama', endpoint: 'http://host/behind/proxy' })).toBe(
      'http://host/behind/proxy/api/tags',
    )
  })
})

describe('the wrong-base heuristic no longer accuses our own presets', () => {
  it('stays quiet for gemini, whose base legitimately ends in /v1beta/openai/', async () => {
    const { settings } = readSettings({
      provider: 'openai-compat',
      compatPreset: 'gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    })
    const provider = createProvider('openai-compat', {
      endpoint: settings.endpoint,
      fetch: async () => ({ ok: false, status: 404, statusText: 'NF', text: async () => 'nope' }),
      presetId: 'gemini',
    })
    const error = await provider.listModels().catch((e: Error) => e)
    // Accusing our own preset of a wrong base is accusing our own data.
    expect((error as Error).message).not.toMatch(/ends in \/v1/)
    expect((error as Error).message).toMatch(/did not answer \/models/)
  })

  it('still helps the user who typed a bare host as a custom endpoint', async () => {
    const provider = createProvider('openai-compat', {
      endpoint: 'http://192.168.15.6:11434',
      fetch: async () => ({ ok: false, status: 404, statusText: 'NF', text: async () => 'nope' }),
      presetId: 'custom',
    })
    await expect(provider.listModels()).rejects.toThrow(/ends in \/v1/)
  })
})
