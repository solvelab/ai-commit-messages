import { describe, expect, it } from 'vitest'

import { endpointForSwitch } from './endpointSwitch.js'

describe('endpointForSwitch', () => {
  // The case on screen: OpenAI selected, address of someone's Ollama still there.
  it('takes the new backend address when switching to a hosted provider', () => {
    expect(
      endpointForSwitch({
        fromBackendId: 'ollama',
        toBackendId: 'openai',
        currentEndpoint: 'http://192.168.15.6:11434',
      }),
    ).toEqual({ endpoint: 'https://api.openai.com/v1', reason: 'switched' })
  })

  it('takes the new backend address when switching between local servers', () => {
    expect(
      endpointForSwitch({
        fromBackendId: 'ollama',
        toBackendId: 'lmstudio',
        currentEndpoint: 'http://localhost:11434',
      }).endpoint,
    ).toBe('http://localhost:1234/v1')
  })

  it('changes nothing when the backend did not change', () => {
    expect(
      endpointForSwitch({
        fromBackendId: 'ollama',
        toBackendId: 'ollama',
        currentEndpoint: 'http://192.168.15.6:11434',
      }),
    ).toEqual({ reason: 'same-backend' })
  })

  it('changes nothing when the address is already the right one', () => {
    expect(
      endpointForSwitch({
        fromBackendId: 'ollama',
        toBackendId: 'openai',
        currentEndpoint: 'https://api.openai.com/v1/',
      }),
    ).toEqual({ reason: 'already-correct' })
  })

  // "Other OpenAI-compatible endpoint" has no address of its own to offer.
  it('leaves the address alone for a custom backend', () => {
    expect(
      endpointForSwitch({
        fromBackendId: 'openai',
        toBackendId: 'custom',
        currentEndpoint: 'https://api.openai.com/v1',
      }).endpoint,
    ).toBeUndefined()
  })

  it('still switches when the previous backend is unknown', () => {
    expect(
      endpointForSwitch({ toBackendId: 'groq', currentEndpoint: 'http://localhost:11434' }).endpoint,
    ).toBe('https://api.groq.com/openai/v1')
  })
})
