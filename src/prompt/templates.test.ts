import { describe, expect, it } from 'vitest'

import { COMMIT_TYPES } from './commit.js'
import { buildSystemPrompt } from './template.js'
import { builtInPrompt, PROMPT_EN, PROMPT_PT_BR } from './templates.js'

describe('builtInPrompt', () => {
  it.each(['pt-BR', 'pt-br', 'PT-BR', 'pt'])('gives the Portuguese prompt for %s', tag => {
    expect(builtInPrompt(tag)).toBe(PROMPT_PT_BR)
  })

  it.each(['en', 'en-US', 'EN-GB'])('gives the English prompt for %s', tag => {
    expect(builtInPrompt(tag)).toBe(PROMPT_EN)
  })

  it.each(['es', 'fr', 'de', 'klingon', ''])('falls back to English for %j', tag => {
    // A prompt in the wrong language still produces a message; no prompt produces an error.
    expect(builtInPrompt(tag)).toBe(PROMPT_EN)
  })
})

describe('the two built-in prompts carry the same contract', () => {
  const contract: [string, RegExp, RegExp][] = [
    ['JSON only', /Responda APENAS com JSON/, /Answer with JSON only/],
    ['no markdown', /nunca com markdown/, /never with markdown/],
    ['no emoji from the model', /Não emita nenhum/, /Do not emit one/],
    ['word budget', /\{maxBodyWords\} palavras/, /\{maxBodyWords\}\s*\n?\s*words/],
    ['no invention', /Nunca invente/, /Never invent/],
    ['one action per entry', /Uma ação realizada por entrada/, /One performed action per entry/],
    ['worked example', /"type":"feat"/, /"type":"feat"/],
  ]

  it.each(contract)('%s', (_name, pt, en) => {
    expect(PROMPT_PT_BR).toMatch(pt)
    expect(PROMPT_EN).toMatch(en)
  })

  it.each([
    ['{types}', PROMPT_PT_BR],
    ['{language}', PROMPT_PT_BR],
    ['{maxBodyWords}', PROMPT_PT_BR],
    ['{types}', PROMPT_EN],
    ['{language}', PROMPT_EN],
    ['{maxBodyWords}', PROMPT_EN],
  ])('keeps the %s placeholder', (placeholder, prompt) => {
    expect(prompt).toContain(placeholder)
  })
})

describe('buildSystemPrompt', () => {
  it('renders Portuguese rules for pt-BR', () => {
    const prompt = buildSystemPrompt({ language: { tag: 'pt-BR', name: 'português brasileiro' } })
    expect(prompt).toContain('Responda APENAS com JSON')
    expect(prompt).toContain('português brasileiro')
    expect(prompt).not.toContain('{language}')
  })

  it('renders English rules for en', () => {
    const prompt = buildSystemPrompt({ language: { tag: 'en', name: 'English' } })
    expect(prompt).toContain('Answer with JSON only')
  })

  it('substitutes every placeholder in both languages', () => {
    for (const tag of ['pt-BR', 'en']) {
      const prompt = buildSystemPrompt({ language: { tag, name: 'X' }, maxBodyWords: 7 })
      expect(prompt).not.toMatch(/\{(types|language|languageTag|maxBodyWords)\}/)
      expect(prompt).toContain('7')
      for (const type of COMMIT_TYPES) {
        expect(prompt).toContain(type)
      }
    }
  })

  it('lets a custom template win over the built-in one', () => {
    const prompt = buildSystemPrompt({
      language: { tag: 'pt-BR', name: 'português' },
      template: 'Minhas regras em {language}.',
    })
    expect(prompt).toBe('Minhas regras em português.')
  })

  it('treats a blank custom template as "use the built-in"', () => {
    const prompt = buildSystemPrompt({ language: { tag: 'pt-BR', name: 'X' }, template: '   ' })
    expect(prompt).toContain('Responda APENAS com JSON')
  })
})
