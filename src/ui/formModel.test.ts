import { describe, expect, it } from 'vitest'

import { formFields, modelReadPlan } from './formModel.js'

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

describe('modelReadPlan', () => {
  // The panel used to send the request anyway and report the 401 as a rejected credential.
  it('does not ask a hosted backend for a list without a key', () => {
    const plan = modelReadPlan({ backendId: 'groq', hasKey: false })
    expect(plan.ask).toBe(false)
    expect(plan.reason).toContain('needs an API key')
    expect(plan.reason).toContain('Groq')
  })

  it('asks once the key is stored', () => {
    expect(modelReadPlan({ backendId: 'groq', hasKey: true })).toEqual({ ask: true })
  })

  it('asks a local backend with no key at all', () => {
    expect(modelReadPlan({ backendId: 'ollama', hasKey: false })).toEqual({ ask: true })
  })

  it('asks every self-hosted backend without a key', () => {
    for (const id of ['lmstudio', 'vllm', 'llamacpp', 'custom', 'ollama-openai']) {
      expect(modelReadPlan({ backendId: id, hasKey: false }).ask, id).toBe(true)
    }
  })
})
