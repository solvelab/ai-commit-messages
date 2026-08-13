import { describe, expect, it } from 'vitest'

import {
  CHARS_PER_TOKEN,
  DEFAULTS,
  diffBudgetChars,
  MAX_CONTEXT_TOKENS,
  normalizeBaseUrl,
  readSettings,
  usableContextTokens,
} from './settings.js'

describe('normalizeBaseUrl', () => {
  it.each([
    // The exact value the extension being replaced stores today.
    ['http://192.168.15.6:11434/api/generate', 'http://192.168.15.6:11434'],
    ['http://192.168.15.6:11434/api/chat', 'http://192.168.15.6:11434'],
    ['http://192.168.15.6:11434/api/tags', 'http://192.168.15.6:11434'],
    ['http://localhost:11434/v1', 'http://localhost:11434'],
    ['http://localhost:11434/v1/chat/completions', 'http://localhost:11434'],
    ['http://localhost:11434/', 'http://localhost:11434'],
    ['localhost:11434', 'http://localhost:11434'],
    ['  https://ollama.example.com  ', 'https://ollama.example.com'],
    ['http://host:11434/behind/proxy', 'http://host:11434/behind/proxy'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected)
  })

  it.each(['', '   ', 'http://', 'not a url at all /// %%%'])('rejects %j', input => {
    expect(normalizeBaseUrl(input)).toBeUndefined()
  })
})

describe('readSettings', () => {
  it('falls back to the defaults for an empty configuration', () => {
    const { settings, problems } = readSettings({})
    expect(settings).toEqual(DEFAULTS)
    expect(problems).toHaveLength(0)
  })

  it('normalizes the endpoint on the way in', () => {
    expect(readSettings({ endpoint: 'http://192.168.15.6:11434/api/generate' }).settings.endpoint).toBe(
      'http://192.168.15.6:11434',
    )
  })

  it('reports an invalid endpoint instead of building a broken URL', () => {
    const { settings, problems } = readSettings({ endpoint: 'http://' })
    expect(settings.endpoint).toBe(DEFAULTS.endpoint)
    expect(problems.map(p => p.key)).toContain('endpoint')
  })

  it('rejects an unknown provider', () => {
    const { settings, problems } = readSettings({ provider: 'anthropic' })
    expect(settings.provider).toBe('ollama')
    expect(problems[0].message).toContain('anthropic')
  })

  it.each([
    ['maxDiffChars', 0, 200],
    ['maxDiffChars', 10_000_000, 500_000],
    ['maxBodyWords', 1, 3],
    ['maxBodyWords', 999, 40],
    ['temperature', -1, 0],
    ['temperature', 5, 1],
    ['timeoutMs', 10, 1_000],
  ])('clamps %s from %s to %s', (key, given, expected) => {
    const { settings, problems } = readSettings({ [key]: given })
    expect(settings[key as 'maxDiffChars']).toBe(expected)
    expect(problems.map(p => p.key)).toContain(key)
  })

  it('keeps a value that is already inside the range without complaining', () => {
    const { settings, problems } = readSettings({ temperature: 0.2, maxDiffChars: 8000 })
    expect(settings.temperature).toBe(0.2)
    expect(settings.maxDiffChars).toBe(8000)
    expect(problems).toHaveLength(0)
  })

  it('reports a non-numeric value instead of coercing it', () => {
    const { settings, problems } = readSettings({ maxDiffChars: 'muitos' })
    expect(settings.maxDiffChars).toBe(DEFAULTS.maxDiffChars)
    expect(problems.map(p => p.key)).toContain('maxDiffChars')
  })

  it('keeps a blank prompt template as blank, meaning "use the built-in"', () => {
    expect(readSettings({ promptTemplate: '' }).settings.promptTemplate).toBe('')
  })
})

describe('diffBudgetChars', () => {
  it('uses the measured ratio rather than the usual 4 chars per token', () => {
    expect(CHARS_PER_TOKEN).toBe(2.6)
  })

  it('leaves room for the system prompt, the answer and slack', () => {
    const budget = diffBudgetChars({
      contextTokens: 32_768,
      systemPromptChars: 1300,
      maxOutputTokens: 512,
      fallbackChars: 4000,
    })
    // (32768 - ceil(1300/2.6) - 512 - 256) * 2.6
    expect(budget).toBe(Math.floor((32_768 - 500 - 512 - 256) * 2.6))
  })

  it('falls back when the context window is unknown', () => {
    expect(diffBudgetChars({ systemPromptChars: 1000, maxOutputTokens: 512, fallbackChars: 4000 })).toBe(
      4000,
    )
  })

  it('falls back when the overheads already exceed the window', () => {
    expect(
      diffBudgetChars({
        contextTokens: 512,
        systemPromptChars: 4000,
        maxOutputTokens: 512,
        fallbackChars: 4000,
      }),
    ).toBe(4000)
  })
})

describe('auth settings', () => {
  it('defaults to Authorization + Bearer', () => {
    const { settings } = readSettings({})
    expect(settings.authHeader).toBe('Authorization')
    expect(settings.authScheme).toBe('Bearer')
    expect(settings.headers).toEqual({})
  })

  it('keeps an empty scheme, which means "send the raw token"', () => {
    // `str()` would turn blank into the default; here blank is a meaningful choice.
    expect(readSettings({ authHeader: 'Authorization: {token}' }).settings.authScheme).toBe('')
  })

  it('accepts a custom header name', () => {
    expect(readSettings({ authHeader: 'x-api-key: {token}' }).settings.authHeader).toBe('x-api-key')
  })

  it('reads extra headers and drops non-string values with a report', () => {
    const { settings, problems } = readSettings({
      headers: { 'X-Title': 'acm', 'X-Bad': 42, '  ': 'x' },
    })
    expect(settings.headers).toEqual({ 'X-Title': 'acm' })
    expect(problems.filter(p => p.key === 'headers')).toHaveLength(2)
  })

  it('rejects headers that are not an object', () => {
    const { settings, problems } = readSettings({ headers: ['nope'] })
    expect(settings.headers).toEqual({})
    expect(problems.map(p => p.key)).toContain('headers')
  })
})

describe('usableContextTokens — o mesmo número nos dois lados', () => {
  it('capa uma janela grande', () => {
    // llama3.1:8b reporta 131072; o request pedia 32k e o orçamento usava 131072.
    expect(usableContextTokens(131_072)).toBe(MAX_CONTEXT_TOKENS)
  })

  it('mantém uma janela menor que o teto', () => {
    expect(usableContextTokens(8_192)).toBe(8_192)
  })

  it('propaga o desconhecido, para o orçamento cair no fallback', () => {
    expect(usableContextTokens(undefined)).toBeUndefined()
  })

  it('o orçamento calculado com o valor capado não excede a janela pedida', () => {
    const usable = usableContextTokens(131_072)!
    const budget = diffBudgetChars({
      contextTokens: usable,
      systemPromptChars: 1400,
      maxOutputTokens: 512,
      fallbackChars: 4000,
    })
    // O prompt em tokens, pela razão medida, tem que caber no num_ctx enviado.
    const promptTokens = Math.ceil(budget / CHARS_PER_TOKEN) + Math.ceil(1400 / CHARS_PER_TOKEN) + 512
    expect(promptTokens).toBeLessThanOrEqual(usable)
  })

  it('a divergência antiga teria falhado este teste', () => {
    // Antes: orçamento com 131072, request com 32768.
    const budgetComJanelaCheia = diffBudgetChars({
      contextTokens: 131_072,
      systemPromptChars: 1400,
      maxOutputTokens: 512,
      fallbackChars: 4000,
    })
    const tokensDoPrompt = Math.ceil(budgetComJanelaCheia / CHARS_PER_TOKEN)
    expect(tokensDoPrompt).toBeGreaterThan(MAX_CONTEXT_TOKENS)
  })
})
