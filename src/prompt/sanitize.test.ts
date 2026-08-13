import { describe, expect, it } from 'vitest'

import { hasUnclosedThinkingTag, sanitize, sanitizeModelOutput } from './sanitize.js'

const JSON_REPLY = '{"type":"feat","subject":"adicionar timeout","body":["criar controller"]}'

describe('sanitizeModelOutput', () => {
  it('removes a closed thinking block and keeps the answer', () => {
    const result = sanitizeModelOutput(`<think>Let me look at the diff...</think>\n${JSON_REPLY}`)
    expect(result.text).toBe(JSON_REPLY)
    expect(result.removed).toContain('thinking block')
    expect(result.rejected).toBe(false)
  })

  it('removes a thinking block written with attributes', () => {
    expect(sanitizeModelOutput(`<think channel="x">hm</think>${JSON_REPLY}`).text).toBe(JSON_REPLY)
  })

  it('handles the <thinking> spelling too', () => {
    expect(sanitizeModelOutput(`<thinking>hm</thinking>\n${JSON_REPLY}`).text).toBe(JSON_REPLY)
  })

  it('rejects a truncated stream instead of salvaging half a thought', () => {
    const result = sanitizeModelOutput('<think>I should start by looking at')
    expect(result.rejected).toBe(true)
    expect(result.text).toBe('')
  })

  it('rejects when one block closes and another is left open', () => {
    const result = sanitizeModelOutput(`<think>a</think>${JSON_REPLY}<think>b`)
    expect(result.rejected).toBe(true)
  })

  it('unwraps a code fence but keeps its contents', () => {
    const result = sanitizeModelOutput('```json\n' + JSON_REPLY + '\n```')
    expect(result.text).toBe(JSON_REPLY)
    expect(result.removed).toContain('code fence')
  })

  it.each([
    'Here is your commit message:\n',
    "Here's the commit message: ",
    'Commit message:\n',
    'Mensagem de commit:\n',
  ])('drops the preamble %j', preamble => {
    expect(sanitizeModelOutput(preamble + JSON_REPLY).text).toBe(JSON_REPLY)
  })

  it('drops quotes that wrap the whole reply', () => {
    expect(sanitizeModelOutput('"✨ feat: algo"').text).toBe('✨ feat: algo')
  })

  it('keeps quotes that are part of the content', () => {
    const text = 'Ajusta o campo "nome" do payload'
    expect(sanitizeModelOutput(text).text).toBe(text)
  })

  it('drops untagged reasoning prose that precedes a real commit line', () => {
    const raw = [
      'Okay, let me look at the diff.',
      'The user changed the network layer.',
      '✨ feat(net): adicionar timeout',
      '',
      'criar AbortController',
    ].join('\n')
    const result = sanitizeModelOutput(raw)
    expect(result.text.split('\n')[0]).toBe('✨ feat(net): adicionar timeout')
    expect(result.removed.some(r => r.includes('reasoning'))).toBe(true)
  })

  it('drops Portuguese reasoning prose as well', () => {
    const raw = 'Deixa eu ver o diff.\nO usuário mudou a rede.\n🐛 fix: corrigir timeout'
    expect(sanitizeModelOutput(raw).text).toBe('🐛 fix: corrigir timeout')
  })

  it('keeps a body line that merely starts like reasoning, when it comes after the title', () => {
    const raw = '✨ feat: algo\n\nbased on the new config, ajustar leitura'
    expect(sanitizeModelOutput(raw).text).toBe(raw)
  })

  it('never eats the whole reply when it cannot find a commit line', () => {
    const raw = 'Let me think about this one.\nI need more context.'
    // No answer to keep, so nothing is dropped: better noisy than empty.
    expect(sanitizeModelOutput(raw).text).toBe(raw)
    expect(sanitizeModelOutput(raw).rejected).toBe(false)
  })

  it('rejects an empty reply', () => {
    expect(sanitizeModelOutput('   ').rejected).toBe(true)
  })

  it('leaves a clean reply untouched', () => {
    const result = sanitizeModelOutput(JSON_REPLY)
    expect(result.text).toBe(JSON_REPLY)
    expect(result.removed).toHaveLength(0)
  })

  it('handles several problems at once', () => {
    const raw = '<think>hmm</think>\n```json\nHere is your commit message:\n' + JSON_REPLY + '\n```'
    const result = sanitizeModelOutput(raw)
    expect(result.text).toBe(JSON_REPLY)
    expect(result.removed.length).toBeGreaterThanOrEqual(2)
  })
})

describe('hasUnclosedThinkingTag', () => {
  it.each([
    ['<think>a', true],
    ['<think>a</think>', false],
    ['<think>a</think><think>b', true],
    ['no tags at all', false],
    ['<thinking attr="1">a', true],
  ])('%j -> %s', (input, expected) => {
    expect(hasUnclosedThinkingTag(input)).toBe(expected)
  })
})

describe('sanitize', () => {
  it('is the string-in string-out wrapper the pipeline injects', () => {
    expect(sanitize(`<think>x</think>${JSON_REPLY}`)).toBe(JSON_REPLY)
  })
})
