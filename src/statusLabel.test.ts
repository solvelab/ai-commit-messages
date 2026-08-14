import { describe, expect, it } from 'vitest'

import { busyLabel, statusLabel } from './statusLabel.js'

const base = {
  model: 'qwen2.5-coder:7b',
  host: '192.168.15.6:11434',
  backendLabel: 'Ollama',
  hasKey: false,
  requiresKey: false,
  endpoint: 'http://192.168.15.6:11434',
}

describe('statusLabel', () => {
  it('shows the model and the host, which is the whole point', () => {
    expect(statusLabel(base).text).toBe('$(git-commit) qwen2.5-coder:7b @ 192.168.15.6:11434')
  })

  it('puts backend, endpoint, model and key state in the tooltip', () => {
    const { tooltip } = statusLabel(base)
    expect(tooltip).toContain('Backend: Ollama')
    expect(tooltip).toContain('Endpoint: http://192.168.15.6:11434')
    expect(tooltip).toContain('Model: qwen2.5-coder:7b')
    expect(tooltip).toContain('API key: not needed')
  })

  it('warns when the backend needs a key and none is stored', () => {
    const label = statusLabel({ ...base, backendLabel: 'OpenAI', requiresKey: true })
    expect(label.text).toContain('$(warning)')
    expect(label.warning).toBe('no API key')
    expect(label.tooltip).toContain('missing')
  })

  it('does not warn once the key is stored', () => {
    const label = statusLabel({ ...base, requiresKey: true, hasKey: true })
    expect(label.text).not.toContain('$(warning)')
    expect(label.warning).toBeUndefined()
    expect(label.tooltip).toContain('stored for this host')
  })

  it('names what is missing instead of showing an empty label', () => {
    expect(statusLabel({ ...base, model: '' }).warning).toBe('no model')
    expect(statusLabel({ ...base, host: '' }).warning).toBe('no endpoint')
    expect(statusLabel({ ...base, model: '', host: '' }).warning).toBe('not configured')
  })

  // The key is a secret; whether one exists is the most that may be said.
  it('never says anything about the key beyond whether it exists', () => {
    const label = statusLabel({ ...base, requiresKey: true, hasKey: true })
    expect(label.tooltip).not.toMatch(/sk-|Bearer|token=/)
  })
})

describe('busyLabel', () => {
  it('spins and names the model doing the work', () => {
    expect(busyLabel('qwen2.5-coder:7b')).toBe('$(sync~spin) Generating with qwen2.5-coder:7b…')
  })

  it('still spins with no model configured', () => {
    expect(busyLabel('  ')).toBe('$(sync~spin) Generating…')
  })
})

