import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { EXTENSION_ID, EXTENSION_NAME, OUTPUT_CHANNEL_NAME, PUBLISHER } from './meta.js'

const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
) as Record<string, unknown>

describe('meta', () => {
  it('matches the publisher declared in the manifest', () => {
    expect(manifest.publisher).toBe(PUBLISHER)
  })

  it('matches the extension name declared in the manifest', () => {
    expect(manifest.name).toBe(EXTENSION_NAME)
  })

  it('composes the id VS Code resolves extensions by', () => {
    expect(EXTENSION_ID).toBe(`${manifest.publisher}.${manifest.name}`)
  })

  it('uses the manifest display name for the log channel', () => {
    expect(manifest.displayName).toBe(OUTPUT_CHANNEL_NAME)
  })
})
