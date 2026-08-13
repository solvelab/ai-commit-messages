import { describe, expect, it, vi } from 'vitest'

import { normalizeCompatBaseUrl, OpenAICompatProvider } from './openaiCompat.js'
import { COMPAT_PRESETS, findPreset } from './presets.js'
import { ProviderError, type FetchLike } from './types.js'

function jsonFetch(body: unknown, status = 200): FetchLike {
  return vi.fn(async () => ({
    ok: status < 400,
    status,
    statusText: 'x',
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }))
}

function sentBody(fetchImpl: FetchLike): Record<string, unknown> {
  const init = (
    fetchImpl as unknown as { mock: { calls: [string, { body?: string; method: string }][] } }
  ).mock.calls[0][1]
  return JSON.parse(init.body!) as Record<string, unknown>
}

function sentHeaders(fetchImpl: FetchLike): Record<string, string> {
  return (
    fetchImpl as unknown as { mock: { calls: [string, { headers: Record<string, string> }][] } }
  ).mock.calls[0][1].headers
}

const REPLY = { choices: [{ message: { content: '{"type":"feat"}' } }] }

const REQUEST = {
  model: 'm',
  system: 's',
  user: 'u',
  maxTokens: 256,
  temperature: 0,
}

describe('normalizeCompatBaseUrl', () => {
  it.each([
    ['https://api.groq.com/openai/v1', 'https://api.groq.com/openai/v1'],
    ['https://api.openai.com/v1/', 'https://api.openai.com/v1'],
    ['http://localhost:1234/v1/chat/completions', 'http://localhost:1234/v1'],
    ['http://localhost:8000/v1/models', 'http://localhost:8000/v1'],
    ['localhost:11434/v1', 'http://localhost:11434/v1'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeCompatBaseUrl(input)).toBe(expected)
  })

  it('refuses an empty endpoint', () => {
    expect(() => normalizeCompatBaseUrl('  ')).toThrow(ProviderError)
  })
})

describe('presets', () => {
  it('every preset is reachable by id', () => {
    for (const preset of COMPAT_PRESETS) {
      expect(findPreset(preset.id)).toBe(preset)
    }
  })

  it('falls back to custom for an unknown id', () => {
    const provider = new OpenAICompatProvider({
      endpoint: 'http://h/v1',
      fetch: jsonFetch(REPLY),
      presetId: 'nonexistent',
    })
    expect(provider.preset.id).toBe('custom')
  })

  it('uses the preset base URL when no endpoint is given', () => {
    const provider = new OpenAICompatProvider({ endpoint: '', fetch: jsonFetch(REPLY), presetId: 'groq' })
    expect(provider.preset.baseUrl).toBe('https://api.groq.com/openai/v1')
  })
})

describe('request shape per provider', () => {
  it('OpenAI gets max_completion_tokens, not the deprecated max_tokens', async () => {
    const fetchImpl = jsonFetch(REPLY)
    await new OpenAICompatProvider({
      endpoint: 'https://api.openai.com/v1',
      fetch: fetchImpl,
      presetId: 'openai',
    }).generate(REQUEST)

    const body = sentBody(fetchImpl)
    expect(body.max_completion_tokens).toBe(256)
    expect(body.max_tokens).toBeUndefined()
  })

  it('self-hosted servers get the old max_tokens', async () => {
    const fetchImpl = jsonFetch(REPLY)
    await new OpenAICompatProvider({
      endpoint: 'http://localhost:1234/v1',
      fetch: fetchImpl,
      presetId: 'lmstudio',
    }).generate(REQUEST)
    expect(sentBody(fetchImpl).max_tokens).toBe(256)
  })

  it('strict mode omits the fields Groq answers 400 for', async () => {
    const fetchImpl = jsonFetch(REPLY)
    await new OpenAICompatProvider({
      endpoint: 'https://api.groq.com/openai/v1',
      fetch: fetchImpl,
      presetId: 'groq',
    }).generate(REQUEST)
    expect(sentBody(fetchImpl).n).toBeUndefined()
  })

  it('non-strict providers get n=1', async () => {
    const fetchImpl = jsonFetch(REPLY)
    await new OpenAICompatProvider({
      endpoint: 'https://api.openai.com/v1',
      fetch: fetchImpl,
      presetId: 'openai',
    }).generate(REQUEST)
    expect(sentBody(fetchImpl).n).toBe(1)
  })

  it('sends OpenRouter its attribution headers', async () => {
    const fetchImpl = jsonFetch(REPLY)
    await new OpenAICompatProvider({
      endpoint: 'https://openrouter.ai/api/v1',
      fetch: fetchImpl,
      presetId: 'openrouter',
    }).generate(REQUEST)
    const headers = sentHeaders(fetchImpl)
    expect(headers['X-Title']).toBe('AI Commit Messages')
    expect(headers['HTTP-Referer']).toContain('ai-commit-messages')
  })

  it('sends a schema only where the preset says it is supported', async () => {
    const supported = jsonFetch(REPLY)
    await new OpenAICompatProvider({
      endpoint: 'https://api.openai.com/v1',
      fetch: supported,
      presetId: 'openai',
    }).generate({ ...REQUEST, schema: { type: 'object' } })
    expect(sentBody(supported).response_format).toBeDefined()

    const unsupported = jsonFetch(REPLY)
    await new OpenAICompatProvider({
      endpoint: 'http://localhost:1234/v1',
      fetch: unsupported,
      presetId: 'lmstudio',
    }).generate({ ...REQUEST, schema: { type: 'object' } })
    expect(sentBody(unsupported).response_format).toBeUndefined()
  })

  it('always asks for a non-streaming reply', async () => {
    const fetchImpl = jsonFetch(REPLY)
    await new OpenAICompatProvider({ endpoint: 'http://h/v1', fetch: fetchImpl }).generate(REQUEST)
    expect(sentBody(fetchImpl).stream).toBe(false)
  })
})

describe('replies and errors', () => {
  it('reads the text from choices[0].message.content', async () => {
    const provider = new OpenAICompatProvider({ endpoint: 'http://h/v1', fetch: jsonFetch(REPLY) })
    expect((await provider.generate(REQUEST)).text).toBe('{"type":"feat"}')
  })

  it('picks up a reasoning trace returned in a sibling field', async () => {
    const provider = new OpenAICompatProvider({
      endpoint: 'http://h/v1',
      fetch: jsonFetch({ choices: [{ message: { content: 'ok', reasoning: 'hmm' } }] }),
    })
    expect((await provider.generate(REQUEST)).thinking).toBe('hmm')
  })

  it('lists models from /v1/models', async () => {
    const provider = new OpenAICompatProvider({
      endpoint: 'http://h/v1',
      fetch: jsonFetch({ data: [{ id: 'gpt-4o', owned_by: 'openai' }, { id: 'llama3' }] }),
    })
    const models = await provider.listModels()
    expect(models.map(m => m.id)).toEqual(['gpt-4o', 'llama3'])
    expect(models[0].detail).toBe('openai')
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [429, 'rate-limited'],
  ])('maps HTTP %s to %s', async (status, code) => {
    const provider = new OpenAICompatProvider({
      endpoint: 'http://h/v1',
      fetch: jsonFetch({ error: { message: 'nope' } }, status),
    })
    await expect(provider.generate(REQUEST)).rejects.toMatchObject({ code })
  })

  it('recognises a 400 that names an unsupported field', async () => {
    const provider = new OpenAICompatProvider({
      endpoint: 'http://h/v1',
      fetch: jsonFetch({ error: { message: "'logprobs' is not supported" } }, 400),
    })
    await expect(provider.generate(REQUEST)).rejects.toMatchObject({
      code: 'unsupported-parameter',
    })
  })

  it('degrades to plain text when the schema is refused', async () => {
    let call = 0
    const fetchImpl: FetchLike = vi.fn(async () => {
      call += 1
      if (call === 1) {
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => JSON.stringify({ error: { message: 'response_format is not supported' } }),
        }
      }
      return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(REPLY) }
    })

    const result = await new OpenAICompatProvider({
      endpoint: 'https://api.openai.com/v1',
      fetch: fetchImpl,
      presetId: 'openai',
    }).generate({ ...REQUEST, schema: { type: 'object' } })

    expect(result.degradedToText).toBe(true)
    expect(call).toBe(2)
  })

  it('says so when the endpoint is not JSON at all', async () => {
    const provider = new OpenAICompatProvider({
      endpoint: 'http://h/v1',
      fetch: jsonFetch('<html>404</html>'),
    })
    await expect(provider.generate(REQUEST)).rejects.toMatchObject({ code: 'malformed-response' })
  })

  it('claims no context window and no thinking — this contract exposes neither', async () => {
    const provider = new OpenAICompatProvider({ endpoint: 'http://h/v1', fetch: jsonFetch(REPLY) })
    expect(await provider.describeModel()).toEqual({ thinking: false, raw: [] })
  })
})

describe('the wrong base URL, which is the common mistake', () => {
  it('explains a 404 on /models instead of blaming the model', async () => {
    const provider = new OpenAICompatProvider({
      endpoint: 'http://192.168.15.6:11434',
      fetch: jsonFetch('404 page not found', 404),
    })
    // Pointing at the server root instead of its /v1 base used to answer "model-not-found".
    await expect(provider.listModels()).rejects.toMatchObject({ code: 'http' })
    await expect(provider.listModels()).rejects.toThrow(/ends in \/v1/)
  })

  it('still reports a genuine missing model when the base URL is right', async () => {
    const provider = new OpenAICompatProvider({
      endpoint: 'https://api.openai.com/v1',
      fetch: jsonFetch({ error: { message: 'The model does not exist' } }, 404),
      presetId: 'openai',
    })
    await expect(provider.generate(REQUEST)).rejects.toMatchObject({ code: 'model-not-found' })
  })
})
