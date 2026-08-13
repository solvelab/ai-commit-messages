import { describe, expect, it, vi } from 'vitest'

import { extractJson, generateMessage, PipelineError } from './pipeline.js'
import type { CommitProvider, GenerateResult } from '../providers/types.js'

const FILES = [{ path: 'src/a.ts', patch: '+const a = 1' }]

function fakeProvider(replies: (string | GenerateResult)[]): CommitProvider & {
  calls: { system: string }[]
} {
  const queue = [...replies]
  const calls: { system: string }[] = []
  return {
    id: 'fake',
    calls,
    listModels: async () => [],
    describeModel: async () => ({ thinking: false, raw: [] }),
    generate: vi.fn(async request => {
      calls.push({ system: request.system })
      const next = queue.shift()
      if (next === undefined) {
        throw new Error('fake provider ran out of replies')
      }
      return typeof next === 'string' ? { text: next, degradedToText: false } : next
    }),
  }
}

const GOOD = JSON.stringify({
  type: 'feat',
  scope: 'net',
  subject: 'adicionar timeout às requisições',
  body: ['criar AbortController compartilhado', 'liberar listener no finally'],
})

describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('reads an object wrapped in a fence', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('reads an object buried in prose', () => {
    expect(extractJson('Here you go:\n{"a":1}\nHope it helps!')).toEqual({ a: 1 })
  })

  it('is not confused by braces inside strings', () => {
    expect(extractJson('{"a":"}{"}')).toEqual({ a: '}{' })
  })

  it('is not confused by escaped quotes', () => {
    expect(extractJson('{"a":"say \\"hi\\""}')).toEqual({ a: 'say "hi"' })
  })

  it('returns undefined when there is no object', () => {
    expect(extractJson('no json here')).toBeUndefined()
    expect(extractJson('{ broken')).toBeUndefined()
  })
})

describe('generateMessage', () => {
  it('renders the message from a valid first reply, without retrying', async () => {
    const provider = fakeProvider([GOOD])
    const outcome = await generateMessage(provider, FILES, { model: 'm' })

    expect(outcome.retried).toBe(false)
    expect(outcome.message.split('\n')).toEqual([
      '✨ feat(net): adicionar timeout às requisições',
      '',
      'criar AbortController compartilhado',
      'liberar listener no finally',
    ])
    expect(provider.generate).toHaveBeenCalledOnce()
  })

  it('retries once with a correction when the first reply is unusable', async () => {
    const provider = fakeProvider(['I think you should commit something.', GOOD])
    const outcome = await generateMessage(provider, FILES, { model: 'm' })

    expect(outcome.retried).toBe(true)
    expect(provider.calls).toHaveLength(2)
    expect(provider.calls[1].system).toContain('did not follow the required format')
    expect(provider.calls[0].system).not.toContain('did not follow the required format')
  })

  it('retries when the draft parses but breaks the format', async () => {
    const tooLong = JSON.stringify({
      type: 'feat',
      subject: 'x',
      body: ['uma frase deliberadamente longa que passa do orçamento de palavras permitido aqui'],
    })
    const provider = fakeProvider([tooLong, GOOD])
    const outcome = await generateMessage(provider, FILES, { model: 'm', maxBodyWords: 5 })
    expect(outcome.retried).toBe(true)
  })

  it('gives up after exactly one retry, carrying the raw reply for the log', async () => {
    const provider = fakeProvider(['nope', 'still nope'])
    await expect(generateMessage(provider, FILES, { model: 'm' })).rejects.toBeInstanceOf(
      PipelineError,
    )
    expect(provider.calls).toHaveLength(2)
  })

  it('keeps the raw text on the error so it can be logged', async () => {
    const provider = fakeProvider(['nope', 'still nope'])
    const error = await generateMessage(provider, FILES, { model: 'm' }).catch(e => e)
    expect((error as PipelineError).raw).toBe('still nope')
  })

  it('reports that the provider degraded to plain text', async () => {
    const provider = fakeProvider([{ text: GOOD, degradedToText: true }])
    const outcome = await generateMessage(provider, FILES, { model: 'm' })
    expect(outcome.degradedToText).toBe(true)
  })

  it('runs the injected sanitizer before parsing', async () => {
    const provider = fakeProvider([`<think>hmm</think>${GOOD}`])
    const outcome = await generateMessage(provider, FILES, {
      model: 'm',
      sanitize: raw => raw.replace(/<think>[\s\S]*?<\/think>/g, ''),
    })
    expect(outcome.message).toContain('✨ feat(net):')
  })

  it('sends the schema and the requested knobs to the provider', async () => {
    const provider = fakeProvider([GOOD])
    await generateMessage(provider, FILES, {
      model: 'qwen3:8b',
      contextTokens: 8192,
      suppressThinking: true,
      temperature: 0.2,
      maxTokens: 300,
    })
    const request = (provider.generate as unknown as { mock: { calls: [Record<string, unknown>][] } })
      .mock.calls[0][0]
    expect(request.model).toBe('qwen3:8b')
    expect(request.schema).toBeDefined()
    expect(request.contextTokens).toBe(8192)
    expect(request.suppressThinking).toBe(true)
    expect(request.temperature).toBe(0.2)
    expect(request.maxTokens).toBe(300)
  })
})

describe('word budget after the retry', () => {
  it('drops the entry that blows the budget instead of failing the whole message', async () => {
    const overBudget = JSON.stringify({
      type: 'refactor',
      subject: 'reorganizar módulos',
      body: [
        'mover arquivos',
        'uma frase deliberadamente longa que passa do orçamento de palavras permitido aqui agora',
      ],
    })
    const provider = fakeProvider(['lixo', overBudget])
    const outcome = await generateMessage(provider, FILES, { model: 'm', maxBodyWords: 10 })

    expect(outcome.retried).toBe(true)
    expect(outcome.message).toContain('mover arquivos')
    expect(outcome.droppedBodyEntries).toHaveLength(1)
    expect(outcome.message).not.toContain('deliberadamente longa')
  })

  it('still fails when nothing usable survives', async () => {
    const provider = fakeProvider(['lixo', JSON.stringify({ type: 'feat', subject: '', body: [] })])
    await expect(generateMessage(provider, FILES, { model: 'm' })).rejects.toBeInstanceOf(
      PipelineError,
    )
  })
})
