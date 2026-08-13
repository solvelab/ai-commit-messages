import { describe, expect, it, vi } from 'vitest'

import {
  describeNetworkError,
  isStructuredOutputRefusal,
  normalizeEndpoint,
  OllamaProvider,
  readContextLength,
} from './ollama.js'
import { ProviderError, type FetchLike } from './types.js'

function jsonFetch(bodies: unknown[] | unknown, status = 200): FetchLike {
  const queue = Array.isArray(bodies) ? [...bodies] : [bodies]
  return vi.fn(async () => {
    const body = queue.length > 1 ? queue.shift() : queue[0]
    return {
      ok: status < 400,
      status,
      statusText: 'x',
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    }
  })
}

function provider(fetchImpl: FetchLike, endpoint = 'http://192.168.15.6:11434') {
  return new OllamaProvider({ endpoint, fetch: fetchImpl })
}

describe('normalizeEndpoint', () => {
  it.each([
    ['http://192.168.15.6:11434/api/generate', 'http://192.168.15.6:11434'],
    ['http://192.168.15.6:11434/api/chat', 'http://192.168.15.6:11434'],
    ['http://localhost:11434/', 'http://localhost:11434'],
    ['http://localhost:11434/v1', 'http://localhost:11434'],
    ['localhost:11434', 'http://localhost:11434'],
    ['  http://host:11434  ', 'http://host:11434'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeEndpoint(input)).toBe(expected)
  })

  it('refuses an empty endpoint instead of building a bogus URL', () => {
    expect(() => normalizeEndpoint('   ')).toThrow(ProviderError)
  })
})

describe('readContextLength', () => {
  it.each([
    ['qwen2.context_length', 32768],
    ['qwen3.context_length', 40960],
    ['llama.context_length', 131072],
    ['gemma4.context_length', 131072],
  ])('reads %s regardless of the architecture prefix', (key, value) => {
    expect(readContextLength({ [key]: value, 'general.name': 'x' })).toBe(value)
  })

  it('returns undefined when no architecture reports one', () => {
    expect(readContextLength({ 'general.name': 'x' })).toBeUndefined()
    expect(readContextLength(undefined)).toBeUndefined()
  })

  it('ignores a non-numeric or zero value', () => {
    expect(readContextLength({ 'x.context_length': '32768' })).toBeUndefined()
    expect(readContextLength({ 'x.context_length': 0 })).toBeUndefined()
  })
})

describe('listModels', () => {
  it('uses the tagged model id', async () => {
    const models = await provider(
      jsonFetch({
        models: [
          { model: 'qwen2.5-coder:7b', name: 'qwen2.5-coder:7b', details: { parameter_size: '7.6B', family: 'qwen2' } },
          { name: 'llama3.2:latest' },
        ],
      }),
    ).listModels()
    expect(models.map(m => m.id)).toEqual(['qwen2.5-coder:7b', 'llama3.2:latest'])
    expect(models[0].detail).toContain('7.6B')
  })

  it('survives an empty server', async () => {
    expect(await provider(jsonFetch({})).listModels()).toEqual([])
  })
})

describe('describeModel', () => {
  it('reports thinking from the server capabilities, not from a model-name list', async () => {
    const caps = await provider(
      jsonFetch({
        model_info: { 'qwen3.context_length': 40960 },
        capabilities: ['completion', 'tools', 'thinking'],
      }),
    ).describeModel('qwen3:8b')
    expect(caps.thinking).toBe(true)
    expect(caps.contextLength).toBe(40960)
  })

  it('reports a non-reasoning model as such', async () => {
    const caps = await provider(
      jsonFetch({ model_info: { 'qwen2.context_length': 32768 }, capabilities: ['completion'] }),
    ).describeModel('qwen2.5-coder:7b')
    expect(caps.thinking).toBe(false)
  })
})

describe('generate', () => {
  it('sends stream false, the schema and the options the request asks for', async () => {
    const fetchImpl = jsonFetch({ message: { content: '{"type":"feat"}' } })
    await provider(fetchImpl).generate({
      model: 'qwen2.5-coder:7b',
      system: 'rules',
      user: 'diff',
      schema: { type: 'object' },
      maxTokens: 256,
      temperature: 0,
      contextTokens: 8192,
      suppressThinking: true,
    })

    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, { body: string; method: string }][] } })
      .mock.calls[0]
    const body = JSON.parse(init.body)
    expect(url).toBe('http://192.168.15.6:11434/api/chat')
    expect(body.stream).toBe(false)
    expect(body.think).toBe(false)
    expect(body.format).toEqual({ type: 'object' })
    expect(body.options).toEqual({ temperature: 0, num_predict: 256, num_ctx: 8192 })
    expect(body.messages).toEqual([
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'diff' },
    ])
  })

  it('omits think when the model has no reasoning trace', async () => {
    const fetchImpl = jsonFetch({ message: { content: 'ok' } })
    await provider(fetchImpl).generate({
      model: 'm',
      system: 's',
      user: 'u',
      maxTokens: 10,
      temperature: 0,
    })
    const init = (fetchImpl as unknown as { mock: { calls: [string, { body: string; method: string }][] } }).mock
      .calls[0][1]
    expect(JSON.parse(init.body).think).toBeUndefined()
  })

  it('reads the reply from message.content, not from response', async () => {
    const result = await provider(
      jsonFetch({ message: { content: 'hello', thinking: 'hmm' } }),
    ).generate({ model: 'm', system: 's', user: 'u', maxTokens: 10, temperature: 0 })
    expect(result.text).toBe('hello')
    expect(result.thinking).toBe('hmm')
    expect(result.degradedToText).toBe(false)
  })

  it('degrades to plain text when the model refuses the schema', async () => {
    let call = 0
    const fetchImpl: FetchLike = vi.fn(async () => {
      call += 1
      if (call === 1) {
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => JSON.stringify({ error: 'model does not support structured outputs' }),
        }
      }
      return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify({ message: { content: 'plain' } }) }
    })

    const result = await provider(fetchImpl).generate({
      model: 'm',
      system: 's',
      user: 'u',
      schema: { type: 'object' },
      maxTokens: 10,
      temperature: 0,
    })
    expect(result.text).toBe('plain')
    expect(result.degradedToText).toBe(true)
    expect(call).toBe(2)
    // The retry must drop the schema, otherwise it would fail the same way.
    const second = (fetchImpl as unknown as { mock: { calls: [string, { body: string; method: string }][] } }).mock
      .calls[1][1]
    expect(JSON.parse(second.body).format).toBeUndefined()
  })

  it('names NDJSON for what it is instead of a generic parse error', async () => {
    const ndjson = '{"message":{"content":"a"}}\n{"message":{"content":"b"}}\n'
    await expect(
      provider(jsonFetch(ndjson)).generate({
        model: 'm',
        system: 's',
        user: 'u',
        maxTokens: 10,
        temperature: 0,
      }),
    ).rejects.toMatchObject({ code: 'malformed-response' })
  })

  it('flags a missing model as model-not-found', async () => {
    await expect(
      provider(jsonFetch({ error: 'model "nope" not found' }, 404)).generate({
        model: 'nope',
        system: 's',
        user: 'u',
        maxTokens: 10,
        temperature: 0,
      }),
    ).rejects.toMatchObject({ code: 'model-not-found' })
  })

  it('rejects a body with no message.content', async () => {
    await expect(
      provider(jsonFetch({ response: 'wrong endpoint shape' })).generate({
        model: 'm',
        system: 's',
        user: 'u',
        maxTokens: 10,
        temperature: 0,
      }),
    ).rejects.toMatchObject({ code: 'malformed-response' })
  })

  it('maps an abort to its own code', async () => {
    const aborted: FetchLike = async () => {
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      throw error
    }
    await expect(
      provider(aborted).generate({ model: 'm', system: 's', user: 'u', maxTokens: 1, temperature: 0 }),
    ).rejects.toMatchObject({ code: 'aborted' })
  })
})

describe('describeNetworkError', () => {
  it.each([
    ['ECONNREFUSED', /Is Ollama running/],
    ['EHOSTUNREACH', /unreachable/],
    ['ETIMEDOUT', /did not answer in time/],
    ['ENOTFOUND', /could not be resolved/],
  ])('explains %s instead of "fetch failed"', (code, expected) => {
    const error = Object.assign(new TypeError('fetch failed'), { cause: { code } })
    expect(describeNetworkError(error, 'http://h:11434')).toMatch(expected)
  })
})

describe('isStructuredOutputRefusal', () => {
  it.each([
    'model does not support structured outputs',
    'Failed to parse structured output as JSON',
    'structured output generation failed',
  ])('recognises %s', message => {
    expect(isStructuredOutputRefusal(message)).toBe(true)
  })

  it('does not swallow unrelated errors', () => {
    expect(isStructuredOutputRefusal('out of memory')).toBe(false)
  })
})

describe('HTTP methods (regression: caught only against a real server)', () => {
  it('asks /api/tags with GET and without a body', async () => {
    const fetchImpl = jsonFetch({ models: [] })
    await provider(fetchImpl).listModels()
    const [url, init] = (
      fetchImpl as unknown as { mock: { calls: [string, { body?: string; method: string }][] } }
    ).mock.calls[0]
    expect(url).toBe('http://192.168.15.6:11434/api/tags')
    // POST here answers `405 method not allowed`.
    expect(init.method).toBe('GET')
    // `fetch` rejects a GET carrying a body — even an empty string.
    expect(init.body).toBeUndefined()
  })

  it('asks /api/show with POST and the model in the body', async () => {
    const fetchImpl = jsonFetch({ capabilities: [] })
    await provider(fetchImpl).describeModel('qwen3:8b')
    const [url, init] = (
      fetchImpl as unknown as { mock: { calls: [string, { body?: string; method: string }][] } }
    ).mock.calls[0]
    expect(url).toBe('http://192.168.15.6:11434/api/show')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body!)).toEqual({ model: 'qwen3:8b' })
  })
})
