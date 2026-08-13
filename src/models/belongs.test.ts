import { describe, expect, it } from 'vitest'

import { modelBelongs } from './belongs.js'

describe('modelBelongs', () => {
  it('recognises a model the server actually reported', () => {
    expect(modelBelongs({ model: 'gpt-4o-mini', cached: ['gpt-4o-mini', 'gpt-4o'] })).toBe('yes')
  })

  it('recognises a model from the built-in catalogue', () => {
    expect(modelBelongs({ model: 'gpt-4o', builtin: ['gpt-4o-mini', 'gpt-4o'] })).toBe('yes')
  })

  // The case the settings page allows: provider switched, model left behind.
  it('reports a leftover model from another backend', () => {
    expect(modelBelongs({ model: 'qwen2.5-coder:7b', builtin: ['gpt-4o-mini', 'gpt-4o'] })).toBe('no')
  })

  // Claiming it is wrong requires knowing what right looks like.
  it('stays silent when nothing is known about the backend', () => {
    expect(modelBelongs({ model: 'my-private-model' })).toBe('unknown')
    expect(modelBelongs({ model: 'my-private-model', builtin: [] })).toBe('unknown')
  })

  it('stays silent when no model is configured', () => {
    expect(modelBelongs({ model: '  ', builtin: ['gpt-4o'] })).toBe('unknown')
  })

  it('ignores case and surrounding blanks', () => {
    expect(modelBelongs({ model: ' GPT-4o ', builtin: ['gpt-4o'] })).toBe('yes')
  })

  it('trusts the cache over the catalogue, which is only a starting point', () => {
    expect(modelBelongs({ model: 'llama3.3:70b', cached: ['llama3.3:70b'], builtin: ['gpt-4o'] })).toBe(
      'yes',
    )
  })
})
