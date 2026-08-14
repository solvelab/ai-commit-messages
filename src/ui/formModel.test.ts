import { describe, expect, it } from 'vitest'

import { formFields } from './formModel.js'

describe('formFields', () => {
  it('hides the endpoint of a hosted provider and asks for the key', () => {
    const fields = formFields('openai')
    expect(fields.showEndpoint).toBe(false)
    expect(fields.requiresKey).toBe(true)
    expect(fields.note).toContain('fixed address')
  })

  it('shows the endpoint of a server you run', () => {
    const fields = formFields('ollama')
    expect(fields.showEndpoint).toBe(true)
    expect(fields.requiresKey).toBe(false)
    expect(fields.suggestedEndpoint).toBe('http://localhost:11434')
  })

  // A gateway in front of a local Ollama asks for a credential; hiding the field strands that case.
  it('always allows a key, even where none is required', () => {
    expect(formFields('ollama').allowsKey).toBe(true)
    expect(formFields('lmstudio').allowsKey).toBe(true)
  })

  it('treats every hosted backend the same way', () => {
    for (const id of ['openai', 'groq', 'openrouter', 'gemini']) {
      expect(formFields(id).showEndpoint, id).toBe(false)
      expect(formFields(id).requiresKey, id).toBe(true)
    }
  })

  it('keeps the endpoint for self-hosted and custom backends', () => {
    for (const id of ['lmstudio', 'vllm', 'llamacpp', 'ollama-openai', 'custom']) {
      expect(formFields(id).showEndpoint, id).toBe(true)
    }
  })

  it('falls back to Ollama for an unknown backend instead of showing nothing', () => {
    expect(formFields('nonsense').backendId).toBe('ollama')
  })
})
